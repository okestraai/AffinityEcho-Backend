import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConfig } from '../../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private connected = false;
  private readonly logger = new Logger(RedisService.name);

  async onModuleInit() {
    try {
      const config = getRedisConfig();
      this.client = new Redis({
        ...config,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn('Redis unavailable — running without cache');
            return null; // Stop retrying
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true, // Don't connect immediately
      });

      this.client.on('connect', () => {
        this.connected = true;
        this.logger.log('Redis connected');
      });

      this.client.on('error', (err: any) => {
        this.connected = false;
        this.logger.warn(`Redis error: ${err.message}`);
      });

      this.client.on('close', () => {
        this.connected = false;
        this.logger.warn('Redis connection closed');
      });

      // Try to connect, but don't crash if it fails
      await this.client.connect().catch(() => {
        this.logger.warn('Redis not available — caching disabled');
        this.client = null;
      });
    } catch {
      this.logger.warn('Redis initialization failed — running without cache');
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.connected) return null;
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
    } catch (err: any) {
      this.logger.error(`Redis set error for key ${key}:`, err.message);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.error(`Redis del error for key ${key}:`, err.message);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      const prefix = getRedisConfig().keyPrefix || '';
      const fullPattern = `${prefix}${pattern}`;
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          const keysWithoutPrefix = keys.map((k: any) =>
            k.startsWith(prefix) ? k.slice(prefix.length) : k,
          );
          await this.client.del(...keysWithoutPrefix);
        }
      } while (cursor !== '0');
    } catch (err: any) {
      this.logger.error(`Redis delPattern error for ${pattern}:`, err.message);
    }
  }

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }
}
