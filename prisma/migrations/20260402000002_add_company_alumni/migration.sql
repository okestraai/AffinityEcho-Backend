-- Alumni array on user_profiles (internal, never exposed to frontend)
ALTER TABLE user_profiles ADD COLUMN company_alumni_encrypted TEXT[] DEFAULT '{}';
CREATE INDEX idx_user_profiles_company_alumni ON user_profiles USING GIN (company_alumni_encrypted);

-- Stamp company on feed posts at creation time (for proper filtering)
ALTER TABLE feed_posts ADD COLUMN company_name VARCHAR(255);

-- Stamp company on nooks at creation time
ALTER TABLE nooks ADD COLUMN company_name VARCHAR(255);
