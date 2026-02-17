-- AddUuidDefaults: Add DEFAULT gen_random_uuid() to all id columns
--
-- Prisma's @default(uuid()) only works with Prisma Client.
-- Since the app uses Supabase JS client for all queries, the database
-- itself must generate UUIDs when id is not provided on insert.
-- Safe to run repeatedly — ALTER COLUMN SET DEFAULT is idempotent.

-- From init migration (21 tables)
ALTER TABLE "user_profiles"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "forums"                     ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "forum_members"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "forum_topics"               ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "forum_comments"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "topic_reactions"            ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "comment_reactions"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "referral_posts"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "referral_connections"       ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "identity_reveals"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "mentorship_relationships"   ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "mentorship_sessions"        ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "conversations"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "messages"                   ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "notifications"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "user_follows"               ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "nooks"                      ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "nook_members"               ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "nook_messages"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "nook_reactions"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "nook_message_reactions"     ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- From align_schema migration (14 tables)
ALTER TABLE "referral_likes"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "referral_bookmarks"         ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "referral_comments"          ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "mentorship_requests"        ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "mentorship_direct_requests" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "mentorship_bookmarks"       ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "user_blocks"                ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "harassment_reports"         ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "feed_posts"                 ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "feed_likes"                 ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "feed_comments"              ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "feed_shares"                ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "feed_views"                 ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "feed_bookmarks"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
