-- Coaching agent: pin the client's agreed goal for a session so the coach keeps
-- every stage anchored to it and steers back if the conversation drifts.
-- FULLY ADDITIVE: ADD COLUMN IF NOT EXISTS only.

ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS goal_encrypted TEXT;
