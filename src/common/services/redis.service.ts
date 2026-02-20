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
  private client!: Redis;
  private readonly logger = new Logger(RedisService.name);

  async onModuleInit() {
    const config = getRedisConfig();
    this.client = new Redis(config);

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error:', err.message);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Get a cached value by key. Returns null if not found or expired.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a cached value with TTL in milliseconds.
   */
  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
    } catch (err) {
      this.logger.error(`Redis set error for key ${key}:`, err);
    }
  }

  /**
   * Delete a specific cache key.
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.error(`Redis del error for key ${key}:`, err);
    }
  }

  /**
   * Delete all keys matching a pattern (e.g. "feeds:*").
   * Uses SCAN to avoid blocking Redis.
   */
  async delPattern(pattern: string): Promise<void> {
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
          // Remove prefix before deleting (ioredis adds it automatically)
          const keysWithoutPrefix = keys.map((k) =>
            k.startsWith(prefix) ? k.slice(prefix.length) : k,
          );
          await this.client.del(...keysWithoutPrefix);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.error(`Redis delPattern error for ${pattern}:`, err);
    }
  }

  /**
   * Get-or-set helper: Returns cached value if exists, otherwise calls factory
   * and caches the result.
   */
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
