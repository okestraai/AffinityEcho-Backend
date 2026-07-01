-- Coaching agent: cache a per-user "coaching profile" derived from their own
-- Affinity Echo activity (themes of their posts/engagement + affinity groups).
-- FULLY ADDITIVE: only ADD COLUMN IF NOT EXISTS on the coaching feature's own
-- table. No existing table or column is altered.

ALTER TABLE coaching_engagements
  ADD COLUMN IF NOT EXISTS profile_encrypted TEXT;

ALTER TABLE coaching_engagements
  ADD COLUMN IF NOT EXISTS profile_refreshed_at TIMESTAMPTZ(3);
