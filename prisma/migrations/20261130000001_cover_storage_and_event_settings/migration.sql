-- A cover is kept either in the database or in a bucket; the admin console picks where new ones go.
ALTER TABLE "event_covers" ADD COLUMN IF NOT EXISTS "storage" VARCHAR(10) NOT NULL DEFAULT 'database';
ALTER TABLE "event_covers" ADD COLUMN IF NOT EXISTS "object_key" VARCHAR(200);
ALTER TABLE "event_covers" ALTER COLUMN "data" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_covers_storage_check') THEN
    ALTER TABLE "event_covers" ADD CONSTRAINT "event_covers_storage_check" CHECK (
      ("storage" = 'database' AND "data" IS NOT NULL AND "object_key" IS NULL)
      OR ("storage" = 'bucket' AND "data" IS NULL AND "object_key" IS NOT NULL)
    );
  END IF;
END $$;

-- Admin-editable event rules and cover storage, starting with today's values.
INSERT INTO "system_settings" ("key", "value") VALUES
  ('events', '{"events_per_day":5,"covers_enabled":true,"cover_max_mb":2,"update_grouping_minutes":2}'),
  ('storage', '{"cover_storage":"database"}')
ON CONFLICT ("key") DO NOTHING;
