-- FixEncryptedNameColumns: Change first_name_encrypted and last_name_encrypted
-- from VARCHAR(50) to TEXT since they store encrypted values that exceed 50 chars.

ALTER TABLE "user_profiles" ALTER COLUMN "first_name_encrypted" TYPE TEXT;
ALTER TABLE "user_profiles" ALTER COLUMN "last_name_encrypted" TYPE TEXT;
