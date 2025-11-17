export default () => ({
  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
    frontendUrl: process.env.FRONTEND_URL,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
});