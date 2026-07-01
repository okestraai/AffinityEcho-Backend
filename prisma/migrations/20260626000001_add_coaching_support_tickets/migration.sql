-- Coaching agent: when the safety layer detects harm to self or others, log a
-- dedicated, admin-only support ticket with the session transcript and the
-- user's handle, so the safety team can follow up. Kept SEPARATE from the
-- general harassment/case system so a user's own crisis is never surfaced to
-- them as a "report", and sensitive coaching/health data stays segregated.
-- FULLY ADDITIVE: CREATE TABLE IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS coaching_support_tickets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number     VARCHAR(24) NOT NULL UNIQUE,
  user_id              UUID NOT NULL,
  handle               VARCHAR(60),
  category             VARCHAR(16) NOT NULL,
  severity             VARCHAR(10) NOT NULL,
  session_id           UUID REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  transcript_encrypted TEXT,
  status               VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_support_tickets_status
  ON coaching_support_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_support_tickets_user
  ON coaching_support_tickets (user_id);
