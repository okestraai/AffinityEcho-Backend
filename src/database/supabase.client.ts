import { ConfigService } from '@nestjs/config';
import { getPool } from './pg-client';
import { SupabaseAdapter } from './query-builder';

/**
 * Returns a SupabaseAdapter backed by the PostgreSQL pool.
 * Drop-in replacement for the old Supabase anon client.
 * Auth calls are stubbed — real auth is in auth.service.ts.
 */
export const supabaseClient = (_config: ConfigService): SupabaseAdapter => {
  return new SupabaseAdapter(getPool());
};

/**
 * Returns a SupabaseAdapter backed by the PostgreSQL pool.
 * Drop-in replacement for the old Supabase service-role (admin) client.
 * Same pool — no RLS distinction needed since we control all access server-side.
 */
export const supabaseAdmin = (_config: ConfigService): SupabaseAdapter => {
  return new SupabaseAdapter(getPool());
};
