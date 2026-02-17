-- AddTimestampDefaults: Add DEFAULT CURRENT_TIMESTAMP to updated_at columns
--
-- Prisma's @updatedAt only works with Prisma Client.
-- Since the app uses Supabase JS client for all queries, the database
-- itself must set updated_at when it is not provided on insert.
-- Safe to run repeatedly — ALTER COLUMN SET DEFAULT is idempotent.

-- From init migration (10 tables missing DEFAULT on updated_at)
ALTER TABLE "forum_topics"               ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "forum_comments"             ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "referral_posts"             ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "referral_connections"        ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "identity_reveals"           ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mentorship_relationships"   ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mentorship_sessions"        ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "conversations"              ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "nooks"                      ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "nook_messages"              ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
