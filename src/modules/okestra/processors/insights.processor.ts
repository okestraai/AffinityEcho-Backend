import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RedisService } from '../../../common/services/redis.service';
import { OkestraLlmService } from '../services/okestra-llm.service';
import { ContentHashService } from '../services/content-hash.service';
import {
  CachedInsights,
  InsightsJobPayload,
} from '../interfaces/insights.interface';

@Processor('okestra-insights')
export class InsightsProcessor extends WorkerHost {
  private readonly logger = new Logger(InsightsProcessor.name);

  private readonly TOPIC_TTL = 3600000; // 1 hour
  private readonly NOOK_TTL = 1800000; // 30 min
  private readonly LOCK_TTL = 120000; // 2 min

  constructor(
    private redis: RedisService,
    private llmService: OkestraLlmService,
    private contentHashService: ContentHashService,
  ) {
    super();
  }

  async process(job: Job<InsightsJobPayload>): Promise<void> {
    const { contentType, contentId, contentHash } = job.data;
    this.logger.log(
      `Processing insights for ${contentType}:${contentId}`,
    );

    const cacheKey = `okestra:insights:${contentType}:${contentId}`;
    const lockKey = `okestra:lock:${contentType}:${contentId}`;

    // Check if already generated while queued
    const existing = await this.redis.get<CachedInsights>(cacheKey);
    if (existing && existing.contentHash === contentHash) {
      this.logger.debug(
        `Already up-to-date for ${contentType}:${contentId}`,
      );
      return;
    }

    // Set lock
    await this.redis.set(lockKey, true, this.LOCK_TTL);

    try {
      const insights = await this.llmService.generateInsights(
        contentType,
        contentId,
      );

      const cachedData: CachedInsights = {
        insights,
        contentHash,
        generatedAt: new Date().toISOString(),
        contentType,
        contentId,
      };

      const ttl =
        contentType === 'topic' ? this.TOPIC_TTL : this.NOOK_TTL;
      await this.redis.set(cacheKey, cachedData, ttl);

      this.logger.log(
        `Insights generated and cached for ${contentType}:${contentId}`,
      );
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
