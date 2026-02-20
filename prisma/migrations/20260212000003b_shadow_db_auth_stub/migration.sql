-- Shadow DB compatibility: Supabase provides auth.uid(), authenticated/anon/service_role
-- roles natively, but Prisma's shadow database doesn't have them.
-- This migration creates stubs so that subsequent RLS migrations can run
-- on the shadow database. On Supabase, these are no-ops (already exist).

-- Only run stubs if auth schema does NOT already exist (i.e., shadow DB).
-- On Supabase the auth schema is always present, so this entire block is skipped.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    CREATE SCHEMA auth;

    CREATE FUNCTION auth.uid() RETURNS uuid AS $fn$
      SELECT COALESCE(
        current_setting('request.jwt.claim.sub', true),
        '00000000-0000-0000-0000-000000000000'
      )::uuid;
    $fn$ LANGUAGE sql STABLE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
