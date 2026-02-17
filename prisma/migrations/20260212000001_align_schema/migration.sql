-- AlignSchema: Add missing tables and columns from prisma schema
-- Safe to run against existing DB (uses IF NOT EXISTS / DO $$ guards)

-- ============================================================
-- 1. Missing columns on user_profiles
-- ============================================================
DO $$ BEGIN
  -- Name fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='first_name_encrypted') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "first_name_encrypted" VARCHAR(50) DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='last_name_encrypted') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "last_name_encrypted" VARCHAR(50) DEFAULT '';
  END IF;

  -- Mentor-specific fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_bio') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_bio" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_expertise') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_expertise" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_industries') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_industries" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_availability') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_availability" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_response_time') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_response_time" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_style') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_style" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_languages') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_hourly_rate') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_hourly_rate" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='is_active_mentor') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "is_active_mentor" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentor_profile_created_at') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentor_profile_created_at" TIMESTAMPTZ(3);
  END IF;

  -- Mentee-specific fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_bio') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_bio" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_goals') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_goals" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_interests') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_interests" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_industries') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_industries" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_availability') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_availability" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_urgency') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_urgency" VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_topic') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_topic" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='is_active_mentee') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "is_active_mentee" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentored_style') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentored_style" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_languages') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentee_profile_created_at') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentee_profile_created_at" TIMESTAMPTZ(3);
  END IF;

  -- Mentoring role
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='mentoring_as') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "mentoring_as" VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='communication_method') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "communication_method" VARCHAR(50);
  END IF;

  -- Privacy settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='profile_visibility') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "profile_visibility" VARCHAR(20) NOT NULL DEFAULT 'public';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='show_email') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "show_email" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='show_company') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "show_company" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='show_location') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "show_location" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='allow_messages_from') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "allow_messages_from" VARCHAR(20) NOT NULL DEFAULT 'everyone';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='show_activity') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "show_activity" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='show_connections') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "show_connections" BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Notification settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='email_notifications') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "email_notifications" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='push_notifications') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "push_notifications" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='notify_on_comment') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "notify_on_comment" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='notify_on_like') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "notify_on_like" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='notify_on_follow') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "notify_on_follow" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='notify_on_mention') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "notify_on_mention" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='notify_on_message') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "notify_on_message" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='notify_on_connection_request') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "notify_on_connection_request" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='digest_frequency') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "digest_frequency" VARCHAR(20) NOT NULL DEFAULT 'daily';
  END IF;

  -- Account management
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='is_deactivated') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "is_deactivated" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='deactivated_at') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "deactivated_at" TIMESTAMPTZ(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='deactivation_reason') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "deactivation_reason" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='is_deleted') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='deleted_at') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='deletion_reason') THEN
    ALTER TABLE "user_profiles" ADD COLUMN "deletion_reason" TEXT;
  END IF;
END $$;

-- ============================================================
-- 2. Missing columns on mentorship_relationships
-- ============================================================
DO $$ BEGIN
  -- Request details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='request_topic') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "request_topic" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='request_goals_encrypted') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "request_goals_encrypted" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='request_background_encrypted') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "request_background_encrypted" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='request_availability') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "request_availability" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='request_communication_method') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "request_communication_method" VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='request_urgency') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "request_urgency" VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='match_score') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "match_score" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='declined_at') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "declined_at" TIMESTAMPTZ(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='cancelled_at') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='last_contact_at') THEN
    ALTER TABLE "mentorship_relationships" ADD COLUMN "last_contact_at" TIMESTAMPTZ(3);
  END IF;

  -- Rename feedback columns to encrypted if they exist as plain text
  -- (init migration had mentor_feedback/mentee_feedback as plain TEXT)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='mentor_feedback_encrypted') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='mentor_feedback') THEN
      ALTER TABLE "mentorship_relationships" RENAME COLUMN "mentor_feedback" TO "mentor_feedback_encrypted";
    ELSE
      ALTER TABLE "mentorship_relationships" ADD COLUMN "mentor_feedback_encrypted" TEXT;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='mentee_feedback_encrypted') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentorship_relationships' AND column_name='mentee_feedback') THEN
      ALTER TABLE "mentorship_relationships" RENAME COLUMN "mentee_feedback" TO "mentee_feedback_encrypted";
    ELSE
      ALTER TABLE "mentorship_relationships" ADD COLUMN "mentee_feedback_encrypted" TEXT;
    END IF;
  END IF;

  -- Change status column to VARCHAR(50) if it's plain TEXT
  ALTER TABLE "mentorship_relationships" ALTER COLUMN "status" TYPE VARCHAR(50);
END $$;

-- ============================================================
-- 3. Missing columns on messages (updated_at)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='updated_at') THEN
    ALTER TABLE "messages" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- ============================================================
-- 4. Missing columns on identity_reveals (connection_id nullable)
-- ============================================================
-- The init migration has connection_id as NOT NULL but schema has it as optional
ALTER TABLE "identity_reveals" ALTER COLUMN "connection_id" DROP NOT NULL;

-- ============================================================
-- 5. Missing columns on forums (created_at)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='forums' AND column_name='created_at') THEN
    ALTER TABLE "forums" ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- ============================================================
-- 6. Create missing tables
-- ============================================================

-- user_blocks
CREATE TABLE IF NOT EXISTS "user_blocks" (
    "id" UUID NOT NULL,
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- mentorship_requests
CREATE TABLE IF NOT EXISTS "mentorship_requests" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "target_user_id" UUID,
    "topic" TEXT NOT NULL,
    "goals_encrypted" TEXT NOT NULL,
    "background_encrypted" TEXT,
    "availability" TEXT NOT NULL,
    "communication_method" VARCHAR(50) NOT NULL,
    "urgency" VARCHAR(20) NOT NULL,
    "request_type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',
    "matched_with_id" UUID,
    "matched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    CONSTRAINT "mentorship_requests_pkey" PRIMARY KEY ("id")
);

-- mentorship_direct_requests
CREATE TABLE IF NOT EXISTS "mentorship_direct_requests" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "request_type" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "topic" VARCHAR(200),
    "goals" TEXT,
    "job_title" TEXT,
    "company" TEXT,
    "years_of_experience" TEXT,
    "location" TEXT,
    "career_level" TEXT,
    "bio" TEXT,
    "is_read_by_requester" BOOLEAN NOT NULL DEFAULT false,
    "is_read_by_target" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "response_message" TEXT,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mentorship_direct_requests_pkey" PRIMARY KEY ("id")
);

-- mentorship_bookmarks
CREATE TABLE IF NOT EXISTS "mentorship_bookmarks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bookmarked_user_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mentorship_bookmarks_pkey" PRIMARY KEY ("id")
);

-- referral_likes
CREATE TABLE IF NOT EXISTS "referral_likes" (
    "id" UUID NOT NULL,
    "referral_post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_likes_pkey" PRIMARY KEY ("id")
);

-- referral_bookmarks
CREATE TABLE IF NOT EXISTS "referral_bookmarks" (
    "id" UUID NOT NULL,
    "referral_post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_bookmarks_pkey" PRIMARY KEY ("id")
);

-- referral_comments
CREATE TABLE IF NOT EXISTS "referral_comments" (
    "id" UUID NOT NULL,
    "referral_post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_comments_pkey" PRIMARY KEY ("id")
);

-- feed_posts
CREATE TABLE IF NOT EXISTS "feed_posts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'global',
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "shares_count" INTEGER NOT NULL DEFAULT 0,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_posts_pkey" PRIMARY KEY ("id")
);

-- feed_likes
CREATE TABLE IF NOT EXISTS "feed_likes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "content_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_likes_pkey" PRIMARY KEY ("id")
);

-- feed_comments
CREATE TABLE IF NOT EXISTS "feed_comments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "content_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "parent_comment_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_comments_pkey" PRIMARY KEY ("id")
);

-- feed_shares
CREATE TABLE IF NOT EXISTS "feed_shares" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "content_id" UUID NOT NULL,
    "share_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_shares_pkey" PRIMARY KEY ("id")
);

-- feed_views
CREATE TABLE IF NOT EXISTS "feed_views" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "content_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_views_pkey" PRIMARY KEY ("id")
);

-- feed_bookmarks
CREATE TABLE IF NOT EXISTS "feed_bookmarks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "content_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feed_bookmarks_pkey" PRIMARY KEY ("id")
);

-- harassment_reports
CREATE TABLE IF NOT EXISTS "harassment_reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reference_number" VARCHAR(20) NOT NULL,
    "incident_type" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "date" VARCHAR(20),
    "location" TEXT,
    "witnesses" TEXT,
    "evidence" TEXT,
    "reporter_type" VARCHAR(20) NOT NULL,
    "contact_email" VARCHAR(254),
    "immediate_risk" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'submitted',
    "admin_notes" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "harassment_reports_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 7. Unique constraints on new tables
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS "user_blocks_blocker_id_blocked_id_key"
  ON "user_blocks"("blocker_id", "blocked_id");

CREATE UNIQUE INDEX IF NOT EXISTS "mentorship_bookmarks_user_id_bookmarked_user_id_key"
  ON "mentorship_bookmarks"("user_id", "bookmarked_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "unique_pending_direct_request"
  ON "mentorship_direct_requests"("requester_id", "target_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "referral_likes_referral_post_id_user_id_key"
  ON "referral_likes"("referral_post_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "referral_bookmarks_referral_post_id_user_id_key"
  ON "referral_bookmarks"("referral_post_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "feed_likes_user_id_content_type_content_id_key"
  ON "feed_likes"("user_id", "content_type", "content_id");

CREATE UNIQUE INDEX IF NOT EXISTS "feed_shares_user_id_content_type_content_id_key"
  ON "feed_shares"("user_id", "content_type", "content_id");

CREATE UNIQUE INDEX IF NOT EXISTS "feed_views_user_id_content_type_content_id_key"
  ON "feed_views"("user_id", "content_type", "content_id");

CREATE UNIQUE INDEX IF NOT EXISTS "feed_bookmarks_user_id_content_type_content_id_key"
  ON "feed_bookmarks"("user_id", "content_type", "content_id");

CREATE UNIQUE INDEX IF NOT EXISTS "harassment_reports_reference_number_key"
  ON "harassment_reports"("reference_number");

-- ============================================================
-- 8. Foreign keys on new tables
-- ============================================================
DO $$ BEGIN
  -- user_blocks
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_blocks_blocker_id_fkey') THEN
    ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey"
      FOREIGN KEY ("blocker_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_blocks_blocked_id_fkey') THEN
    ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey"
      FOREIGN KEY ("blocked_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- mentorship_requests
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mentorship_requests_requester_id_fkey') THEN
    ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_requester_id_fkey"
      FOREIGN KEY ("requester_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- mentorship_direct_requests
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mentorship_direct_requests_requester_id_fkey') THEN
    ALTER TABLE "mentorship_direct_requests" ADD CONSTRAINT "mentorship_direct_requests_requester_id_fkey"
      FOREIGN KEY ("requester_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mentorship_direct_requests_target_user_id_fkey') THEN
    ALTER TABLE "mentorship_direct_requests" ADD CONSTRAINT "mentorship_direct_requests_target_user_id_fkey"
      FOREIGN KEY ("target_user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- mentorship_bookmarks
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mentorship_bookmarks_user_id_fkey') THEN
    ALTER TABLE "mentorship_bookmarks" ADD CONSTRAINT "mentorship_bookmarks_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mentorship_bookmarks_bookmarked_user_id_fkey') THEN
    ALTER TABLE "mentorship_bookmarks" ADD CONSTRAINT "mentorship_bookmarks_bookmarked_user_id_fkey"
      FOREIGN KEY ("bookmarked_user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- referral_likes
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_likes_referral_post_id_fkey') THEN
    ALTER TABLE "referral_likes" ADD CONSTRAINT "referral_likes_referral_post_id_fkey"
      FOREIGN KEY ("referral_post_id") REFERENCES "referral_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_likes_user_id_fkey') THEN
    ALTER TABLE "referral_likes" ADD CONSTRAINT "referral_likes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- referral_bookmarks
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_bookmarks_referral_post_id_fkey') THEN
    ALTER TABLE "referral_bookmarks" ADD CONSTRAINT "referral_bookmarks_referral_post_id_fkey"
      FOREIGN KEY ("referral_post_id") REFERENCES "referral_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_bookmarks_user_id_fkey') THEN
    ALTER TABLE "referral_bookmarks" ADD CONSTRAINT "referral_bookmarks_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- referral_comments
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_comments_referral_post_id_fkey') THEN
    ALTER TABLE "referral_comments" ADD CONSTRAINT "referral_comments_referral_post_id_fkey"
      FOREIGN KEY ("referral_post_id") REFERENCES "referral_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_comments_user_id_fkey') THEN
    ALTER TABLE "referral_comments" ADD CONSTRAINT "referral_comments_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- feed_posts
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_posts_user_id_fkey') THEN
    ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- feed_likes
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_likes_user_id_fkey') THEN
    ALTER TABLE "feed_likes" ADD CONSTRAINT "feed_likes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- feed_comments
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_comments_user_id_fkey') THEN
    ALTER TABLE "feed_comments" ADD CONSTRAINT "feed_comments_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_comments_parent_comment_id_fkey') THEN
    ALTER TABLE "feed_comments" ADD CONSTRAINT "feed_comments_parent_comment_id_fkey"
      FOREIGN KEY ("parent_comment_id") REFERENCES "feed_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- feed_shares
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_shares_user_id_fkey') THEN
    ALTER TABLE "feed_shares" ADD CONSTRAINT "feed_shares_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- feed_views
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_views_user_id_fkey') THEN
    ALTER TABLE "feed_views" ADD CONSTRAINT "feed_views_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- feed_bookmarks
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feed_bookmarks_user_id_fkey') THEN
    ALTER TABLE "feed_bookmarks" ADD CONSTRAINT "feed_bookmarks_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- harassment_reports
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'harassment_reports_reporter_id_fkey') THEN
    ALTER TABLE "harassment_reports" ADD CONSTRAINT "harassment_reports_reporter_id_fkey"
      FOREIGN KEY ("reporter_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 9. Indexes on mentorship_relationships (from schema)
-- ============================================================
CREATE INDEX IF NOT EXISTS "mentorship_relationships_status_idx"
  ON "mentorship_relationships"("status");
CREATE INDEX IF NOT EXISTS "mentorship_relationships_mentor_id_status_idx"
  ON "mentorship_relationships"("mentor_id", "status");
CREATE INDEX IF NOT EXISTS "mentorship_relationships_mentee_id_status_idx"
  ON "mentorship_relationships"("mentee_id", "status");
