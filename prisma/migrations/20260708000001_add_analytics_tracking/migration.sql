-- AddAnalyticsTracking: admin-only visitor/session/event tracking.
-- Purely ADDITIVE — creates two new tables + indexes only. Touches no existing
-- table. Safe to run repeatedly (uses IF NOT EXISTS).

-- ============================================================
-- analytics_sessions — one row per client session/device
-- ============================================================
CREATE TABLE IF NOT EXISTS "analytics_sessions" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_key"     TEXT NOT NULL,
  "user_id"         UUID,
  "platform"        TEXT NOT NULL,
  "device_type"     TEXT,
  "os"              TEXT,
  "os_version"      TEXT,
  "browser"         TEXT,
  "device_model"    TEXT,
  "app_version"     TEXT,
  "country"         TEXT,
  "region"          TEXT,
  "city"            TEXT,
  "referrer_source" TEXT,
  "referrer_url"    TEXT,
  "utm_source"      TEXT,
  "utm_medium"      TEXT,
  "utm_campaign"    TEXT,
  "utm_term"        TEXT,
  "utm_content"     TEXT,
  "landing_path"    TEXT,
  "locale"          TEXT,
  "timezone"        TEXT,
  "ip_hash"         TEXT,
  "is_bot"          BOOLEAN NOT NULL DEFAULT false,
  "event_count"     INTEGER NOT NULL DEFAULT 0,
  "first_seen"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "last_seen"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_sessions_session_key_key"
  ON "analytics_sessions"("session_key");
CREATE INDEX IF NOT EXISTS "idx_analytics_sessions_first_seen"
  ON "analytics_sessions"("first_seen");
CREATE INDEX IF NOT EXISTS "idx_analytics_sessions_platform_first_seen"
  ON "analytics_sessions"("platform", "first_seen");
CREATE INDEX IF NOT EXISTS "idx_analytics_sessions_referrer_source"
  ON "analytics_sessions"("referrer_source");
CREATE INDEX IF NOT EXISTS "idx_analytics_sessions_country"
  ON "analytics_sessions"("country");
CREATE INDEX IF NOT EXISTS "idx_analytics_sessions_user_id"
  ON "analytics_sessions"("user_id");

-- ============================================================
-- analytics_events — one row per page/screen view or app open
-- ============================================================
CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_key" TEXT NOT NULL,
  "user_id"     UUID,
  "type"        TEXT NOT NULL,
  "path"        TEXT,
  "name"        TEXT,
  "referrer"    TEXT,
  "platform"    TEXT,
  "metadata"    JSONB,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_analytics_events_created_at"
  ON "analytics_events"("created_at");
CREATE INDEX IF NOT EXISTS "idx_analytics_events_type_created_at"
  ON "analytics_events"("type", "created_at");
CREATE INDEX IF NOT EXISTS "idx_analytics_events_session_key"
  ON "analytics_events"("session_key");
