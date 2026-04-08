import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  let config: PoolConfig;

  if (process.env.PG_HOST) {
    config = {
      host: process.env.PG_HOST,
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'postgres',
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      ssl:
        process.env.PG_SSL === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
    };
  } else if (process.env.DATABASE_URL) {
    config = {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_URL.includes('azure') ||
        process.env.DATABASE_URL.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : undefined,
    };
  } else {
    throw new Error(
      'Missing database configuration: set PG_HOST or DATABASE_URL',
    );
  }

  pool = new Pool({
    ...config,
    min: 5, // Keep 5 connections warm at all times
    max: 20,
    idleTimeoutMillis: 60000, // Keep idle connections longer (60s vs 30s)
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000, // Kill queries that take >30s
  });

  pool.on('error', (err: any) => {
    console.error('[PgClient] Unexpected pool error:', err.message);
  });

  // Warm up connections immediately (don't await — fire and forget)
  Promise.all(
    Array.from({ length: 5 }, () => pool!.query('SELECT 1').catch(() => {})),
  ).then(() => {
    console.log('[PgClient] Pool warmed up with 5 connections');
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
