-- Enable RLS on _prisma_migrations to prevent exposure via PostgREST API.
-- No policies are added, so all access through Supabase (anon/authenticated) is blocked.
-- Prisma still has direct access via the database connection string.

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
