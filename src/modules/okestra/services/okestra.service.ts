import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../../../common/services/redis.service';
import { OkestraLlmService } from './okestra-llm.service';
import { ContentHashService } from './content-hash.service';
import {
  ContentType,
  CachedInsights,
  OkestraInsightsResult,
  InsightsJobPayload,
} from '../interfaces/insights.interface';

@Injectable()
export class OkestraService {
  private readonly logger = new Logger(OkestraService.name);

  private readonly TOPIC_TTL = 3600000; // 1 hour
  private readonly NOOK_TTL = 1800000; // 30 min
  private readonly LOCK_TTL = 120000; // 2 min

  constructor(
    private redis: RedisService,
    private llmService: OkestraLlmService,
    private contentHashService: ContentHashService,
    @InjectQueue('okestra-insights') private insightsQueue: Queue,
  ) {}

  async getInsights(
    contentType: ContentType,
    contentId: string,
    userId: string,
  ): Promise<{
    insights: OkestraInsightsResult | null;
    status: 'cached' | 'generating' | 'stale_cached';
    cached: boolean;
  }> {
    const currentHash = await this.contentHashService.computeHash(
      contentType,
      contentId,
    );
    if (!currentHash) {
      return { insights: null, status: 'generating', cached: false };
    }

    const cacheKey = this.getCacheKey(contentType, contentId);
    const cached = await this.redis.get<CachedInsights>(cacheKey);

    if (cached && cached.contentHash === currentHash) {
      this.logger.debug(`Cache HIT for ${contentType}:${contentId}`);
      return { insights: cached.insights, status: 'cached', cached: true };
    }

    if (cached && cached.contentHash !== currentHash) {
      this.logger.debug(`Cache STALE for ${contentType}:${contentId}`);
      await this.enqueueGeneration(contentType, contentId, currentHash);
      return {
        insights: cached.insights,
        status: 'stale_cached',
        cached: true,
      };
    }

    this.logger.debug(`Cache MISS for ${contentType}:${contentId}`);
    await this.enqueueGeneration(contentType, contentId, currentHash);
    return { insights: null, status: 'generating', cached: false };
  }

  async generateSync(
    contentType: ContentType,
    contentId: string,
    userId: string,
  ): Promise<OkestraInsightsResult> {
    const currentHash = await this.contentHashService.computeHash(
      contentType,
      contentId,
    );

    // Check cache first
    const cacheKey = this.getCacheKey(contentType, contentId);
    const cached = await this.redis.get<CachedInsights>(cacheKey);
    if (cached && cached.contentHash === currentHash) {
      return cached.insights;
    }

    // Check generation lock to prevent duplicate work
    const lockKey = `okestra:lock:${contentType}:${contentId}`;
    const locked = await this.redis.get<boolean>(lockKey);
    if (locked) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const freshCached = await this.redis.get<CachedInsights>(cacheKey);
      if (freshCached) return freshCached.insights;
    }

    // Set lock
    await this.redis.set(lockKey, true, this.LOCK_TTL);

    try {
      const insights = await this.llmService.generateInsights(
        contentType,
        contentId,
        userId,
      );
      const ttl =
        contentType === 'topic' ? this.TOPIC_TTL : this.NOOK_TTL;

      const cachedData: CachedInsights = {
        insights,
        contentHash: currentHash,
        generatedAt: new Date().toISOString(),
        contentType,
        contentId,
      };

      await this.redis.set(cacheKey, cachedData, ttl);
      return insights;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async invalidateCache(
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(contentType, contentId);
    await this.redis.del(cacheKey);
    this.logger.debug(`Invalidated cache for ${contentType}:${contentId}`);
  }

  private async enqueueGeneration(
    contentType: ContentType,
    contentId: string,
    contentHash: string,
  ): Promise<void> {
    const jobId = `insights:${contentType}:${contentId}`;

    const lockKey = `okestra:lock:${contentType}:${contentId}`;
    const locked = await this.redis.get<boolean>(lockKey);
    if (locked) {
      this.logger.debug(
        `Generation already in progress for ${contentType}:${contentId}`,
      );
      return;
    }

    try {
      await this.insightsQueue.add(
        'generate',
        {
          contentType,
          contentId,
          contentHash,
        } as InsightsJobPayload,
        {
          jobId,
          removeOnComplete: true,
          removeOnFail: 5,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    } catch (err) {
      this.logger.debug(
        `Job enqueue for ${jobId}: ${err instanceof Error ? err.message : 'duplicate'}`,
      );
    }
  }

  private getCacheKey(
    contentType: ContentType,
    contentId: string,
  ): string {
    return `okestra:insights:${contentType}:${contentId}`;
  }
}
