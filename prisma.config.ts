import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Build connection string from individual PG_* vars or fall back to DATABASE_URL
function getDatabaseUrl(): string {
  if (process.env.PG_HOST) {
    const password = encodeURIComponent(process.env.PG_PASSWORD || '');
    const host = process.env.PG_HOST;
    const port = process.env.PG_PORT || '5432';
    const db = process.env.PG_DATABASE || 'postgres';
    const user = process.env.PG_USER || 'postgres';
    const ssl = process.env.PG_SSL === 'true' ? '?sslmode=require' : '';
    return `postgresql://${user}:${password}@${host}:${port}/${db}${ssl}`;
  }
  return process.env.DIRECT_URL || process.env.DATABASE_URL!;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
