-- Coaching agent self-learning: a curated, deduplicated, frequency-weighted
-- "rulebook" consolidated from the raw feedback-distilled lessons. The coach's
-- prompt reads from this rulebook; a daily cron rebuilds it. FULLY ADDITIVE.

CREATE TABLE IF NOT EXISTS coaching_rulebook (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_encrypted TEXT NOT NULL,
  weight         INT  NOT NULL DEFAULT 1,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_rulebook_active
  ON coaching_rulebook (is_active, weight DESC);
