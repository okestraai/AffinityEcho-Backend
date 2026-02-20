-- Migration: Add missing FK indexes + optimize RLS policies
--
-- Part 1: Add indexes on unindexed foreign key columns (26 total)
-- These are critical for JOIN/DELETE performance.
--
-- Part 2: Fix RLS initplan warnings by wrapping auth.uid() in (select ...)
-- This prevents per-row re-evaluation of auth.uid().

-- ============================================================
-- PART 1: MISSING FOREIGN KEY INDEXES
-- ============================================================

-- comment_reactions
CREATE INDEX IF NOT EXISTS "idx_comment_reactions_user_id"
  ON "comment_reactions" ("user_id");

-- conversations
CREATE INDEX IF NOT EXISTS "idx_conversations_user2_id"
  ON "conversations" ("user2_id");

-- forum_comments
CREATE INDEX IF NOT EXISTS "idx_forum_comments_parent_comment_id"
  ON "forum_comments" ("parent_comment_id");
CREATE INDEX IF NOT EXISTS "idx_forum_comments_topic_id"
  ON "forum_comments" ("topic_id");
CREATE INDEX IF NOT EXISTS "idx_forum_comments_user_id"
  ON "forum_comments" ("user_id");

-- forum_members
CREATE INDEX IF NOT EXISTS "idx_forum_members_user_id"
  ON "forum_members" ("user_id");

-- forum_topics
CREATE INDEX IF NOT EXISTS "idx_forum_topics_forum_id"
  ON "forum_topics" ("forum_id");
CREATE INDEX IF NOT EXISTS "idx_forum_topics_user_id"
  ON "forum_topics" ("user_id");

-- identity_reveals
CREATE INDEX IF NOT EXISTS "idx_identity_reveals_requester_id"
  ON "identity_reveals" ("requester_id");
CREATE INDEX IF NOT EXISTS "idx_identity_reveals_responder_id"
  ON "identity_reveals" ("responder_id");

-- mentorship_bookmarks
CREATE INDEX IF NOT EXISTS "idx_mentorship_bookmarks_bookmarked_user_id"
  ON "mentorship_bookmarks" ("bookmarked_user_id");

-- mentorship_sessions
CREATE INDEX IF NOT EXISTS "idx_mentorship_sessions_relationship_id"
  ON "mentorship_sessions" ("relationship_id");

-- messages
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id"
  ON "messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_messages_sender_id"
  ON "messages" ("sender_id");

-- nook_message_reactions
CREATE INDEX IF NOT EXISTS "idx_nook_message_reactions_user_id"
  ON "nook_message_reactions" ("user_id");

-- nook_messages
CREATE INDEX IF NOT EXISTS "idx_nook_messages_parent_message_id"
  ON "nook_messages" ("parent_message_id");

-- nook_reactions
CREATE INDEX IF NOT EXISTS "idx_nook_reactions_user_id"
  ON "nook_reactions" ("user_id");

-- nooks
CREATE INDEX IF NOT EXISTS "idx_nooks_creator_id"
  ON "nooks" ("creator_id");

-- notifications
CREATE INDEX IF NOT EXISTS "idx_notifications_actor_id"
  ON "notifications" ("actor_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_user_id"
  ON "notifications" ("user_id");

-- referral_connections
CREATE INDEX IF NOT EXISTS "idx_referral_connections_receiver_id"
  ON "referral_connections" ("receiver_id");
CREATE INDEX IF NOT EXISTS "idx_referral_connections_sender_id"
  ON "referral_connections" ("sender_id");

-- referral_posts
CREATE INDEX IF NOT EXISTS "idx_referral_posts_user_id"
  ON "referral_posts" ("user_id");

-- topic_reactions
CREATE INDEX IF NOT EXISTS "idx_topic_reactions_user_id"
  ON "topic_reactions" ("user_id");

-- user_blocks
CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocked_id"
  ON "user_blocks" ("blocked_id");

-- user_follows
CREATE INDEX IF NOT EXISTS "idx_user_follows_following_id"
  ON "user_follows" ("following_id");


-- ============================================================
-- PART 2: FIX RLS INITPLAN (auth.uid() → (select auth.uid()))
-- ============================================================
-- Drop and recreate affected policies with optimized (select auth.uid()) calls.
-- This is a no-downtime change: policies are per-statement, not per-transaction.

-- 1. user_profiles
DROP POLICY IF EXISTS "user_profiles_select_own" ON "user_profiles";
CREATE POLICY "user_profiles_select_own"
  ON "user_profiles" FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "user_profiles_insert" ON "user_profiles";
CREATE POLICY "user_profiles_insert"
  ON "user_profiles" FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "user_profiles_update" ON "user_profiles";
CREATE POLICY "user_profiles_update"
  ON "user_profiles" FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- 2. forum_members
DROP POLICY IF EXISTS "forum_members_select" ON "forum_members";
CREATE POLICY "forum_members_select"
  ON "forum_members" FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "forum_members_insert" ON "forum_members";
CREATE POLICY "forum_members_insert"
  ON "forum_members" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "forum_members_delete" ON "forum_members";
CREATE POLICY "forum_members_delete"
  ON "forum_members" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 3. forum_topics
DROP POLICY IF EXISTS "forum_topics_insert" ON "forum_topics";
CREATE POLICY "forum_topics_insert"
  ON "forum_topics" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "forum_topics_update" ON "forum_topics";
CREATE POLICY "forum_topics_update"
  ON "forum_topics" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- 4. forum_comments
DROP POLICY IF EXISTS "forum_comments_select" ON "forum_comments";
CREATE POLICY "forum_comments_select"
  ON "forum_comments" FOR SELECT TO authenticated
  USING (is_removed = false OR user_id = (select auth.uid()));

DROP POLICY IF EXISTS "forum_comments_insert" ON "forum_comments";
CREATE POLICY "forum_comments_insert"
  ON "forum_comments" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "forum_comments_update" ON "forum_comments";
CREATE POLICY "forum_comments_update"
  ON "forum_comments" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- 5. topic_reactions
DROP POLICY IF EXISTS "topic_reactions_insert" ON "topic_reactions";
CREATE POLICY "topic_reactions_insert"
  ON "topic_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "topic_reactions_delete" ON "topic_reactions";
CREATE POLICY "topic_reactions_delete"
  ON "topic_reactions" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 6. comment_reactions
DROP POLICY IF EXISTS "comment_reactions_insert" ON "comment_reactions";
CREATE POLICY "comment_reactions_insert"
  ON "comment_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "comment_reactions_delete" ON "comment_reactions";
CREATE POLICY "comment_reactions_delete"
  ON "comment_reactions" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 7. referral_posts
DROP POLICY IF EXISTS "referral_posts_insert" ON "referral_posts";
CREATE POLICY "referral_posts_insert"
  ON "referral_posts" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_posts_update" ON "referral_posts";
CREATE POLICY "referral_posts_update"
  ON "referral_posts" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_posts_delete" ON "referral_posts";
CREATE POLICY "referral_posts_delete"
  ON "referral_posts" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 8. referral_connections
DROP POLICY IF EXISTS "referral_connections_select" ON "referral_connections";
CREATE POLICY "referral_connections_select"
  ON "referral_connections" FOR SELECT TO authenticated
  USING (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_connections_insert" ON "referral_connections";
CREATE POLICY "referral_connections_insert"
  ON "referral_connections" FOR INSERT TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_connections_update" ON "referral_connections";
CREATE POLICY "referral_connections_update"
  ON "referral_connections" FOR UPDATE TO authenticated
  USING (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_connections_delete" ON "referral_connections";
CREATE POLICY "referral_connections_delete"
  ON "referral_connections" FOR DELETE TO authenticated
  USING (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()));

-- 9. identity_reveals
DROP POLICY IF EXISTS "identity_reveals_select" ON "identity_reveals";
CREATE POLICY "identity_reveals_select"
  ON "identity_reveals" FOR SELECT TO authenticated
  USING (requester_id = (select auth.uid()) OR responder_id = (select auth.uid()));

DROP POLICY IF EXISTS "identity_reveals_insert" ON "identity_reveals";
CREATE POLICY "identity_reveals_insert"
  ON "identity_reveals" FOR INSERT TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "identity_reveals_update" ON "identity_reveals";
CREATE POLICY "identity_reveals_update"
  ON "identity_reveals" FOR UPDATE TO authenticated
  USING (requester_id = (select auth.uid()) OR responder_id = (select auth.uid()));

-- 10. referral_likes
DROP POLICY IF EXISTS "referral_likes_insert" ON "referral_likes";
CREATE POLICY "referral_likes_insert"
  ON "referral_likes" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_likes_delete" ON "referral_likes";
CREATE POLICY "referral_likes_delete"
  ON "referral_likes" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 11. referral_bookmarks
DROP POLICY IF EXISTS "referral_bookmarks_select" ON "referral_bookmarks";
CREATE POLICY "referral_bookmarks_select"
  ON "referral_bookmarks" FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_bookmarks_insert" ON "referral_bookmarks";
CREATE POLICY "referral_bookmarks_insert"
  ON "referral_bookmarks" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_bookmarks_delete" ON "referral_bookmarks";
CREATE POLICY "referral_bookmarks_delete"
  ON "referral_bookmarks" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 12. referral_comments
DROP POLICY IF EXISTS "referral_comments_insert" ON "referral_comments";
CREATE POLICY "referral_comments_insert"
  ON "referral_comments" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_comments_update" ON "referral_comments";
CREATE POLICY "referral_comments_update"
  ON "referral_comments" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "referral_comments_delete" ON "referral_comments";
CREATE POLICY "referral_comments_delete"
  ON "referral_comments" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- 13. mentorship_relationships
DROP POLICY IF EXISTS "mentorship_relationships_select" ON "mentorship_relationships";
CREATE POLICY "mentorship_relationships_select"
  ON "mentorship_relationships" FOR SELECT TO authenticated
  USING (mentor_id = (select auth.uid()) OR mentee_id = (select auth.uid()));

-- 14. mentorship_direct_requests
DROP POLICY IF EXISTS "mentorship_requests_select" ON "mentorship_direct_requests";
CREATE POLICY "mentorship_requests_select"
  ON "mentorship_direct_requests" FOR SELECT TO authenticated
  USING (requester_id = (select auth.uid()) OR target_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_requests_insert" ON "mentorship_direct_requests";
CREATE POLICY "mentorship_requests_insert"
  ON "mentorship_direct_requests" FOR INSERT TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_requests_update" ON "mentorship_direct_requests";
CREATE POLICY "mentorship_requests_update"
  ON "mentorship_direct_requests" FOR UPDATE TO authenticated
  USING (requester_id = (select auth.uid()) OR target_user_id = (select auth.uid()));

-- 15. notifications
DROP POLICY IF EXISTS "notifications_select" ON "notifications";
CREATE POLICY "notifications_select"
  ON "notifications" FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "notifications_update" ON "notifications";
CREATE POLICY "notifications_update"
  ON "notifications" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

-- 16. user_follows
DROP POLICY IF EXISTS "user_follows_select" ON "user_follows";
CREATE POLICY "user_follows_select"
  ON "user_follows" FOR SELECT TO authenticated
  USING (follower_id = (select auth.uid()) OR following_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_follows_insert" ON "user_follows";
CREATE POLICY "user_follows_insert"
  ON "user_follows" FOR INSERT TO authenticated
  WITH CHECK (follower_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_follows_delete" ON "user_follows";
CREATE POLICY "user_follows_delete"
  ON "user_follows" FOR DELETE TO authenticated
  USING (follower_id = (select auth.uid()));

-- 17. user_blocks
DROP POLICY IF EXISTS "user_blocks_select" ON "user_blocks";
CREATE POLICY "user_blocks_select"
  ON "user_blocks" FOR SELECT TO authenticated
  USING (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_blocks_insert" ON "user_blocks";
CREATE POLICY "user_blocks_insert"
  ON "user_blocks" FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (select auth.uid()));

DROP POLICY IF EXISTS "user_blocks_delete" ON "user_blocks";
CREATE POLICY "user_blocks_delete"
  ON "user_blocks" FOR DELETE TO authenticated
  USING (blocker_id = (select auth.uid()));
