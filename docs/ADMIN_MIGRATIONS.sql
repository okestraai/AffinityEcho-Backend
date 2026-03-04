-- ============================================================
-- Admin System Migrations
-- Run in Supabase SQL Editor in order
-- ============================================================

-- 1. Add role column to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'moderator', 'admin', 'super_admin'));

-- 2. Add suspension fields to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS suspension_expires_at TIMESTAMPTZ;

-- 3. Create admin_logs audit table
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES user_profiles(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Moderation fields on forum_topics
ALTER TABLE forum_topics
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- 5. Moderation fields on forum_comments
ALTER TABLE forum_comments
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- 6. Moderation fields on feed_posts
ALTER TABLE feed_posts
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- 7. Moderation fields on nook_messages
ALTER TABLE nook_messages
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- 8. Admin fields on harassment_reports
ALTER TABLE harassment_reports
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS resolution_action TEXT
  CHECK (resolution_action IN ('warned', 'suspended', 'banned', 'dismissed')),
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES user_profiles(id);

-- 9. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON admin_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_suspended ON user_profiles(is_suspended);
CREATE INDEX IF NOT EXISTS idx_harassment_reports_assigned_to ON harassment_reports(assigned_to);

-- ============================================================
-- DONE: Run the backend code after applying these migrations
-- ============================================================
