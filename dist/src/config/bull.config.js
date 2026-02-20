"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBullConfig = void 0;
const getBullConfig = () => ({
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
    },
});
exports.getBullConfig = getBullConfig;
//# sourceMappingURL=bull.config.js.map