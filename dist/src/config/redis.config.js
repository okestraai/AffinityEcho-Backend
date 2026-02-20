"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConfig = void 0;
const getRedisConfig = () => ({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'affinity:',
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
        if (times > 5)
            return null;
        return Math.min(times * 200, 2000);
    },
    ...(process.env.NODE_ENV === 'production' && process.env.REDIS_TLS === 'true'
        ? { tls: {} }
        : {}),
});
exports.getRedisConfig = getRedisConfig;
//# sourceMappingURL=redis.config.js.map