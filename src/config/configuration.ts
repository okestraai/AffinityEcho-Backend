export default () => ({
  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  moderation: {
    togetherApiKey: process.env.TOGETHER_API_KEY,
    togetherBaseUrl:
      process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1',
    togetherModel:
      process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
    togetherTimeoutMs: parseInt(process.env.TOGETHER_TIMEOUT_MS || '15000', 10),
    togetherMaxRetries: parseInt(process.env.TOGETHER_MAX_RETRIES || '3', 10),
    enabled: process.env.MODERATION_ENABLED === 'true',
    mode: process.env.MODERATION_MODE || 'shadow',
    concurrency: parseInt(process.env.MODERATION_CONCURRENCY || '4', 10),
    autoRemoveConfidence: parseFloat(
      process.env.MODERATION_AUTO_REMOVE_CONFIDENCE || '0.90',
    ),
    autoHideConfidence: parseFloat(
      process.env.MODERATION_AUTO_HIDE_CONFIDENCE || '0.75',
    ),
  },
});
