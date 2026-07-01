-- Coaching agent (Echo) — standalone feature tables.
-- FULLY ADDITIVE: only CREATE TABLE/INDEX IF NOT EXISTS. No existing table is
-- altered, so this migration cannot regress any existing feature.
-- Encrypted columns (*_encrypted) hold AES-256-GCM ciphertext, same as the rest
-- of the platform. user_id is a plain UUID column (indexed) intentionally
-- decoupled from user_profiles at the FK level to keep this module standalone;
-- account deletion purges these rows via the coaching deletion routine.
-- NB: gen_random_uuid() is a Postgres 13+ core function (no pgcrypto extension
-- needed) — every existing table on this DB already uses it as an id default.

-- Engagement: the ongoing relationship between a user and the AI coach.
CREATE TABLE IF NOT EXISTS coaching_engagements (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL,
  status                      VARCHAR(20)  NOT NULL DEFAULT 'active',
  focus_encrypted             TEXT,
  current_stage               VARCHAR(16)  NOT NULL DEFAULT 'OPENING',
  semantic_summary_encrypted  TEXT,
  consent_collect             BOOLEAN      NOT NULL DEFAULT FALSE,
  consent_share               BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ(3)  NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ(3)  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_engagements_user
  ON coaching_engagements (user_id, status);

-- Session: one coaching conversation within an engagement.
CREATE TABLE IF NOT EXISTS coaching_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id         UUID NOT NULL REFERENCES coaching_engagements(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  stage                 VARCHAR(16) NOT NULL DEFAULT 'OPENING',
  modality              VARCHAR(10) NOT NULL DEFAULT 'text',
  summary_encrypted     TEXT,
  commitment_encrypted  TEXT,
  opened_at             TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ(3),
  created_at            TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_engagement
  ON coaching_sessions (engagement_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user
  ON coaching_sessions (user_id, status);

-- Message: turn-by-turn transcript (coach/client/system), encrypted at rest.
CREATE TABLE IF NOT EXISTS coaching_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  engagement_id      UUID NOT NULL REFERENCES coaching_engagements(id) ON DELETE CASCADE,
  role               VARCHAR(10) NOT NULL,
  content_encrypted  TEXT NOT NULL,
  stage              VARCHAR(16) NOT NULL DEFAULT 'OPENING',
  modality           VARCHAR(10) NOT NULL DEFAULT 'text',
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_messages_session
  ON coaching_messages (session_id, created_at);

-- Memory: episodic + semantic entries consolidated from sessions.
-- (Embedding column reserved for a later pgvector-based hybrid retrieval pass.)
CREATE TABLE IF NOT EXISTS coaching_memory (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id      UUID NOT NULL REFERENCES coaching_engagements(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  kind               VARCHAR(12) NOT NULL,
  content_encrypted  TEXT NOT NULL,
  source_session_id  UUID REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  salience           REAL NOT NULL DEFAULT 0.5,
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_memory_engagement
  ON coaching_memory (engagement_id, kind);

-- Commitment: the client-owned closing action; drives between-session follow-up.
CREATE TABLE IF NOT EXISTS coaching_commitments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id      UUID NOT NULL REFERENCES coaching_engagements(id) ON DELETE CASCADE,
  session_id         UUID REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  user_id            UUID NOT NULL,
  content_encrypted  TEXT NOT NULL,
  status             VARCHAR(12) NOT NULL DEFAULT 'open',
  due_at             TIMESTAMPTZ(3),
  follow_up_at       TIMESTAMPTZ(3),
  created_at         TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_commitments_user
  ON coaching_commitments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_coaching_commitments_followup
  ON coaching_commitments (follow_up_at) WHERE follow_up_at IS NOT NULL;

-- Safety event: tamper-evident log of crisis detections + referrals (compliance).
CREATE TABLE IF NOT EXISTS coaching_safety_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  session_id       UUID REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  category         VARCHAR(16) NOT NULL,
  severity         VARCHAR(10) NOT NULL,
  action           VARCHAR(12) NOT NULL DEFAULT 'none',
  detail_encrypted TEXT,
  created_at       TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_safety_user
  ON coaching_safety_events (user_id, created_at);
