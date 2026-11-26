-- Events: hosting, registration, check-in, views and reports.
-- Additive only; safe to run again.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "event_policy_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "event_hosting_stopped_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "event_hosting_stopped_reason" TEXT;

CREATE TABLE IF NOT EXISTS "events" (
  "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug"                   VARCHAR(80) NOT NULL,
  "host_id"                UUID NOT NULL,
  "title"                  VARCHAR(120) NOT NULL,
  "description"            TEXT NOT NULL DEFAULT '',
  "mode"                   VARCHAR(10) NOT NULL,
  "starts_at"              TIMESTAMPTZ(3) NOT NULL,
  "ends_at"                TIMESTAMPTZ(3) NOT NULL,
  "time_zone"              VARCHAR(64) NOT NULL,
  "venue_name"             VARCHAR(160),
  "venue_address"          VARCHAR(300),
  "venue_city"             VARCHAR(120),
  "map_url"                VARCHAR(500),
  "join_url"               VARCHAR(500),
  "capacity_in_person"     INTEGER,
  "capacity_online"        INTEGER,
  "registration_closes_at" TIMESTAMPTZ(3),
  "organiser_name"         VARCHAR(120) NOT NULL,
  "status"                 VARCHAR(12) NOT NULL DEFAULT 'published',
  "removed_reason"         TEXT,
  "removed_by"             UUID,
  "removed_at"             TIMESTAMPTZ(3),
  "cancelled_at"           TIMESTAMPTZ(3),
  "created_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "events_mode_chk" CHECK ("mode" IN ('virtual', 'physical', 'hybrid')),
  CONSTRAINT "events_times_chk" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "events_capacity_chk" CHECK (
    ("capacity_in_person" IS NULL OR "capacity_in_person" > 0) AND
    ("capacity_online" IS NULL OR "capacity_online" > 0))
);
-- Deleted events are kept for the audit trail but shown nowhere.
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_status_chk";
ALTER TABLE "events" ADD CONSTRAINT "events_status_chk"
  CHECK ("status" IN ('published', 'cancelled', 'removed', 'deleted'));
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX IF NOT EXISTS "events_slug_key" ON "events" ("slug");
CREATE INDEX IF NOT EXISTS "events_host_idx" ON "events" ("host_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "events_starts_idx" ON "events" ("starts_at");

CREATE TABLE IF NOT EXISTS "event_registrations" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id"        UUID NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "user_id"         UUID NOT NULL,
  "name_encrypted"  TEXT NOT NULL,
  "email_encrypted" TEXT,
  "share_email"     BOOLEAN NOT NULL DEFAULT false,
  "attendance"      VARCHAR(10) NOT NULL,
  "check_in_code"   VARCHAR(12) NOT NULL,
  "checked_in_at"   TIMESTAMPTZ(3),
  "source"          VARCHAR(20) NOT NULL DEFAULT 'link',
  "status"          VARCHAR(12) NOT NULL DEFAULT 'registered',
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_registrations_attendance_chk" CHECK ("attendance" IN ('in_person', 'online')),
  CONSTRAINT "event_registrations_status_chk" CHECK ("status" IN ('registered', 'cancelled')),
  -- An email is only kept when the guest chose to share it.
  CONSTRAINT "event_registrations_email_chk" CHECK ("share_email" OR "email_encrypted" IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_registrations_event_user_key" ON "event_registrations" ("event_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "event_registrations_code_key" ON "event_registrations" ("event_id", "check_in_code");
CREATE INDEX IF NOT EXISTS "event_registrations_user_idx" ON "event_registrations" ("user_id");

CREATE TABLE IF NOT EXISTS "event_views" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id"   UUID NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "user_id"    UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "event_views_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "event_views_event_idx" ON "event_views" ("event_id");

CREATE TABLE IF NOT EXISTS "event_reports" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id"    UUID NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "reporter_id" UUID NOT NULL,
  "reason"      VARCHAR(500) NOT NULL,
  "status"      VARCHAR(12) NOT NULL DEFAULT 'open',
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "event_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_reports_event_reporter_key" ON "event_reports" ("event_id", "reporter_id");

ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_reports" ENABLE ROW LEVEL SECURITY;

-- Same access rule as the other tables the server reads.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'event_registrations', 'event_views', 'event_reports'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Service role full access') THEN
      EXECUTE format('CREATE POLICY "Service role full access" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
