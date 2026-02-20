import { RedisOptions } from 'ioredis';

export const getRedisConfig = (): RedisOptions => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: 'affinity:',
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 5) return null; // Stop retrying after 5 attempts
    return Math.min(times * 200, 2000);
  },
  ...(process.env.NODE_ENV === 'production' && process.env.REDIS_TLS === 'true'
    ? { tls: {} }
    : {}),
});
