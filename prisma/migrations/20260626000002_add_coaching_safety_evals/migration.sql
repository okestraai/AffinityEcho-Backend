-- Coaching agent safety eval: log every DISAGREEMENT between the deterministic
-- regex floor and the LLM classifier, so the classifier's recall can be measured
-- over time and drift after model updates is caught. Admin-only, encrypted msg.
-- FULLY ADDITIVE: CREATE TABLE IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS coaching_safety_evals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID,
  kind                VARCHAR(20) NOT NULL,        -- 'classifier_miss' | 'regex_gap'
  regex_category      VARCHAR(16),
  classifier_category VARCHAR(16),
  classifier_severity VARCHAR(10),
  message_encrypted   TEXT,
  created_at          TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_safety_evals_kind
  ON coaching_safety_evals (kind, created_at DESC);
