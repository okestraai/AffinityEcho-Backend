-- AddIndexes: Performance indexes for common query patterns
-- Safe to run repeatedly (uses IF NOT EXISTS)

-- ============================================================
-- USER PROFILES
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_user_profiles_email"
  ON "user_profiles"("email");

CREATE INDEX IF NOT EXISTS "idx_user_profiles_active_mentor"
  ON "user_profiles"("is_active_mentor")
  WHERE "is_active_mentor" = true AND "is_deleted" = false AND "is_deactivated" = false;

CREATE INDEX IF NOT EXISTS "idx_user_profiles_active_mentee"
  ON "user_profiles"("is_active_mentee")
  WHERE "is_active_mentee" = true AND "is_deleted" = false AND "is_deactivated" = false;

-- GIN indexes for array fields used in mentorship matching
CREATE INDEX IF NOT EXISTS "idx_user_profiles_mentor_expertise_gin"
  ON "user_profiles" USING GIN ("mentor_expertise");

CREATE INDEX IF NOT EXISTS "idx_user_profiles_mentor_industries_gin"
  ON "user_profiles" USING GIN ("mentor_industries");

CREATE INDEX IF NOT EXISTS "idx_user_profiles_skills_gin"
  ON "user_profiles" USING GIN ("skills");

-- ============================================================
-- REFERRAL POSTS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_referral_posts_user_id"
  ON "referral_posts"("user_id");

CREATE INDEX IF NOT EXISTS "idx_referral_posts_status"
  ON "referral_posts"("status");

CREATE INDEX IF NOT EXISTS "idx_referral_posts_created_at_desc"
  ON "referral_posts"("created_at" DESC);

-- ============================================================
-- REFERRAL LIKES / BOOKMARKS / COMMENTS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_referral_likes_user_id"
  ON "referral_likes"("user_id");

CREATE INDEX IF NOT EXISTS "idx_referral_likes_referral_post_id"
  ON "referral_likes"("referral_post_id");

CREATE INDEX IF NOT EXISTS "idx_referral_bookmarks_user_id"
  ON "referral_bookmarks"("user_id");

CREATE INDEX IF NOT EXISTS "idx_referral_bookmarks_referral_post_id"
  ON "referral_bookmarks"("referral_post_id");

CREATE INDEX IF NOT EXISTS "idx_referral_comments_referral_post_id"
  ON "referral_comments"("referral_post_id");

CREATE INDEX IF NOT EXISTS "idx_referral_comments_user_id"
  ON "referral_comments"("user_id");

-- ============================================================
-- MENTORSHIP REQUESTS & DIRECT REQUESTS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_mentorship_requests_requester_id"
  ON "mentorship_requests"("requester_id");

CREATE INDEX IF NOT EXISTS "idx_mentorship_requests_status"
  ON "mentorship_requests"("status");

CREATE INDEX IF NOT EXISTS "idx_mentorship_requests_request_type"
  ON "mentorship_requests"("request_type");

CREATE INDEX IF NOT EXISTS "idx_mentorship_requests_created_at"
  ON "mentorship_requests"("created_at");

CREATE INDEX IF NOT EXISTS "idx_mentorship_direct_requests_target_status"
  ON "mentorship_direct_requests"("target_user_id", "status");

CREATE INDEX IF NOT EXISTS "idx_mentorship_direct_requests_requester_id"
  ON "mentorship_direct_requests"("requester_id");

CREATE INDEX IF NOT EXISTS "idx_mentorship_direct_requests_status"
  ON "mentorship_direct_requests"("status");

-- ============================================================
-- MENTORSHIP BOOKMARKS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_mentorship_bookmarks_user_id"
  ON "mentorship_bookmarks"("user_id");

-- ============================================================
-- FEED POSTS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_feed_posts_user_id"
  ON "feed_posts"("user_id");

CREATE INDEX IF NOT EXISTS "idx_feed_posts_visibility"
  ON "feed_posts"("visibility");

CREATE INDEX IF NOT EXISTS "idx_feed_posts_created_at_desc"
  ON "feed_posts"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_feed_posts_likes_count_desc"
  ON "feed_posts"("likes_count" DESC);

-- ============================================================
-- FEED LIKES / COMMENTS / SHARES / VIEWS / BOOKMARKS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_feed_likes_user_id"
  ON "feed_likes"("user_id");

CREATE INDEX IF NOT EXISTS "idx_feed_likes_content"
  ON "feed_likes"("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "idx_feed_likes_created_at_desc"
  ON "feed_likes"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_feed_comments_user_id"
  ON "feed_comments"("user_id");

CREATE INDEX IF NOT EXISTS "idx_feed_comments_content"
  ON "feed_comments"("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "idx_feed_comments_parent"
  ON "feed_comments"("parent_comment_id");

CREATE INDEX IF NOT EXISTS "idx_feed_comments_created_at_desc"
  ON "feed_comments"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_feed_shares_user_id"
  ON "feed_shares"("user_id");

CREATE INDEX IF NOT EXISTS "idx_feed_shares_content"
  ON "feed_shares"("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "idx_feed_shares_created_at_desc"
  ON "feed_shares"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_feed_views_user_id"
  ON "feed_views"("user_id");

CREATE INDEX IF NOT EXISTS "idx_feed_views_content"
  ON "feed_views"("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "idx_feed_views_viewed_at_desc"
  ON "feed_views"("viewed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_feed_bookmarks_user_id"
  ON "feed_bookmarks"("user_id");

CREATE INDEX IF NOT EXISTS "idx_feed_bookmarks_content"
  ON "feed_bookmarks"("content_type", "content_id");

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_notifications_user_id"
  ON "notifications"("user_id");

CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread"
  ON "notifications"("user_id", "is_read")
  WHERE "is_read" = false;

CREATE INDEX IF NOT EXISTS "idx_notifications_created_at_desc"
  ON "notifications"("created_at" DESC);

-- ============================================================
-- HARASSMENT REPORTS
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_harassment_reports_reporter_id"
  ON "harassment_reports"("reporter_id");

CREATE INDEX IF NOT EXISTS "idx_harassment_reports_status"
  ON "harassment_reports"("status");

CREATE INDEX IF NOT EXISTS "idx_harassment_reports_reference_number"
  ON "harassment_reports"("reference_number");

CREATE INDEX IF NOT EXISTS "idx_harassment_reports_created_at_desc"
  ON "harassment_reports"("created_at" DESC);

-- ============================================================
-- FORUM (supplementary indexes)
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_forum_topics_forum_id"
  ON "forum_topics"("forum_id");

CREATE INDEX IF NOT EXISTS "idx_forum_topics_user_id"
  ON "forum_topics"("user_id");

CREATE INDEX IF NOT EXISTS "idx_forum_topics_created_at_desc"
  ON "forum_topics"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_forum_comments_topic_id"
  ON "forum_comments"("topic_id");

CREATE INDEX IF NOT EXISTS "idx_forum_comments_user_id"
  ON "forum_comments"("user_id");

-- ============================================================
-- CONVERSATIONS & MESSAGES
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id"
  ON "messages"("conversation_id");

CREATE INDEX IF NOT EXISTS "idx_messages_sender_id"
  ON "messages"("sender_id");

CREATE INDEX IF NOT EXISTS "idx_messages_created_at_desc"
  ON "messages"("created_at" DESC);
