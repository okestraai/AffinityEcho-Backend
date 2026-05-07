-- Content flags table
CREATE TABLE content_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES user_profiles(id),
  reason VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  reviewed_by UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(content_type, content_id, reporter_id)
);

CREATE INDEX idx_content_flags_content ON content_flags(content_type, content_id);
CREATE INDEX idx_content_flags_reporter ON content_flags(reporter_id);
CREATE INDEX idx_content_flags_status ON content_flags(status);

-- User hidden content table
CREATE TABLE user_hidden_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  content_type VARCHAR(20) NOT NULL,
  content_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_type, content_id)
);

CREATE INDEX idx_user_hidden_content_user ON user_hidden_content(user_id);

-- Add terms + age columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
