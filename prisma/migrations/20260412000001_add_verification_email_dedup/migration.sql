-- Add HMAC hash column for duplicate detection on user_profiles
-- The hash is HMAC-SHA256(normalized_email, ENCRYPTION_KEY) — deterministic, no rainbow tables
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS verification_email_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_verification_email_hash
  ON user_profiles(verification_email_hash)
  WHERE verification_email_hash IS NOT NULL;

-- Persistent table for used verification emails.
-- This survives account deletion, preventing email reuse across re-registrations.
-- user_id is nullable (SET NULL on delete) so audit record stays even if account is gone.
CREATE TABLE IF NOT EXISTS used_verification_emails (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email_hash    TEXT        UNIQUE NOT NULL,  -- HMAC-SHA256, dedup key
  email_encrypted TEXT      NOT NULL,         -- AES-256-GCM, audit only
  user_id       UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ                   -- set if badge is revoked
);

CREATE INDEX IF NOT EXISTS idx_used_verification_emails_user_id
  ON used_verification_emails(user_id);

ALTER TABLE used_verification_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON used_verification_emails FOR ALL USING (true) WITH CHECK (true);
