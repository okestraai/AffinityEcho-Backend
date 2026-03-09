-- Migration: Add system_settings table
-- Stores platform-wide configuration managed by super_admin

CREATE TABLE IF NOT EXISTS "system_settings" (
  "id"         UUID    NOT NULL DEFAULT gen_random_uuid(),
  "key"        VARCHAR(100) NOT NULL,
  "value"      JSONB   NOT NULL DEFAULT '{}',
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_settings_key_key" UNIQUE ("key")
);

CREATE INDEX IF NOT EXISTS "idx_system_settings_key" ON "system_settings"("key");

-- Seed default settings
INSERT INTO "system_settings" ("key", "value") VALUES
  ('general', '{"platform_name":"AffinityEcho","platform_description":"A professional social platform","maintenance_mode":false,"allow_new_registrations":true,"require_email_verification":true}'),
  ('security', '{"max_login_attempts":5,"session_timeout_minutes":60,"require_2fa_for_admins":false,"min_password_length":8,"password_requires_special_char":true}'),
  ('notifications', '{"email_notifications_enabled":true,"push_notifications_enabled":true,"digest_frequency":"daily","max_notifications_per_day":50}'),
  ('moderation', '{"auto_hide_reports_threshold":3,"require_reason_for_hiding":true,"allow_user_appeals":true,"auto_suspend_after_reports":10,"content_review_queue_enabled":true}')
ON CONFLICT ("key") DO NOTHING;

-- Enable RLS
ALTER TABLE "system_settings" ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (admin portal uses service_role client)
CREATE POLICY "system_settings_service_role" ON "system_settings"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
