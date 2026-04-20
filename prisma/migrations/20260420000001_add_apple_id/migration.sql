-- Add apple_id column for Apple Sign-In
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS apple_id TEXT;

-- Partial unique index (same pattern as google_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_apple_id
  ON user_profiles(apple_id) WHERE apple_id IS NOT NULL;
