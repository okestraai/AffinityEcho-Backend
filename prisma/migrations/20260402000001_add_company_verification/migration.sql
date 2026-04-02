-- Add verification fields to user_profiles
ALTER TABLE user_profiles ADD COLUMN is_company_verified BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN company_verification_email TEXT;
ALTER TABLE user_profiles ADD COLUMN company_verified_at TIMESTAMPTZ;

-- Verification tokens table
CREATE TABLE company_verification_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cvt_token ON company_verification_tokens(token);
CREATE INDEX idx_cvt_user_id ON company_verification_tokens(user_id);

ALTER TABLE company_verification_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON company_verification_tokens FOR ALL USING (true) WITH CHECK (true);
