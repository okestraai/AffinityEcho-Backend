-- Add authentication columns to user_profiles so we can manage auth without Supabase Auth.
-- Supabase's auth.users data will be backfilled into these columns during data migration.

-- Email for login (was only in auth.users before)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- bcrypt password hash (null for OAuth-only users)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- When email was confirmed (null = not confirmed)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

-- Auth provider: 'email' or 'google'
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';

-- Google OAuth subject ID (for linking Google accounts)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS google_id TEXT;

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_google_id ON user_profiles(google_id) WHERE google_id IS NOT NULL;
