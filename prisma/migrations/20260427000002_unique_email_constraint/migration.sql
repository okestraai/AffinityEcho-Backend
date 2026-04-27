-- Remove duplicate email accounts (keep the older one)
DELETE FROM user_profiles
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY created_at ASC) as rn
    FROM user_profiles
    WHERE email IS NOT NULL
  ) dupes
  WHERE rn > 1
);

-- Add unique constraint on lowercase email (allows NULL — only one non-null per email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_unique
ON user_profiles (lower(email))
WHERE email IS NOT NULL;
