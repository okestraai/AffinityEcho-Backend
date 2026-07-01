-- Coaching agent: post-session feedback (star rating + optional comment) and a
-- "self-learning" store of distilled lessons that get fed back into the coach's
-- prompt. FULLY ADDITIVE: CREATE TABLE IF NOT EXISTS only.

-- One feedback row per session (star rating 1-5 + optional encrypted comment).
CREATE TABLE IF NOT EXISTS coaching_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID UNIQUE REFERENCES coaching_sessions(id) ON DELETE SET NULL,
  user_id           UUID NOT NULL,
  rating            SMALLINT NOT NULL,
  comment_encrypted TEXT,
  created_at        TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_feedback_rating
  ON coaching_feedback (rating, created_at);

-- Distilled, generalisable, non-identifying lessons learned from feedback,
-- injected into the coaching system prompt so Coach improves over time.
CREATE TABLE IF NOT EXISTS coaching_learnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_encrypted TEXT NOT NULL,
  source_rating   SMALLINT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_learnings_active
  ON coaching_learnings (is_active, created_at DESC);
