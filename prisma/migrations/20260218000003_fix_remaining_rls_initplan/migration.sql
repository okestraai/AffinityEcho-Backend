-- Migration: Fix ALL remaining RLS initplan warnings
-- Covers tables missed in 20260218000002: nooks, nook_members, nook_messages,
-- nook_reactions, nook_message_reactions, conversations, messages,
-- mentorship_sessions, mentorship_requests, mentorship_direct_requests (additional policies),
-- mentorship_bookmarks, mentorship_relationships (update), notifications (delete),
-- feed_posts, feed_likes, feed_comments, feed_shares, feed_views, feed_bookmarks,
-- feed_reactions, harassment_reports.

-- ============================================================
-- 1. mentorship_relationships (update policy was missing)
-- ============================================================
DROP POLICY IF EXISTS "mentorship_relationships_update" ON "mentorship_relationships";
CREATE POLICY "mentorship_relationships_update"
  ON "mentorship_relationships" FOR UPDATE TO authenticated
  USING (mentor_id = (select auth.uid()) OR mentee_id = (select auth.uid()));

-- ============================================================
-- 2. mentorship_sessions
-- ============================================================
DROP POLICY IF EXISTS "mentorship_sessions_select" ON "mentorship_sessions";
CREATE POLICY "mentorship_sessions_select"
  ON "mentorship_sessions" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mentorship_relationships mr
      WHERE mr.id = relationship_id
      AND (mr.mentor_id = (select auth.uid()) OR mr.mentee_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "mentorship_sessions_insert" ON "mentorship_sessions";
CREATE POLICY "mentorship_sessions_insert"
  ON "mentorship_sessions" FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mentorship_relationships mr
      WHERE mr.id = relationship_id
      AND (mr.mentor_id = (select auth.uid()) OR mr.mentee_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "mentorship_sessions_update" ON "mentorship_sessions";
CREATE POLICY "mentorship_sessions_update"
  ON "mentorship_sessions" FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mentorship_relationships mr
      WHERE mr.id = relationship_id
      AND (mr.mentor_id = (select auth.uid()) OR mr.mentee_id = (select auth.uid()))
    )
  );

-- ============================================================
-- 3. conversations
-- ============================================================
DROP POLICY IF EXISTS "conversations_select" ON "conversations";
CREATE POLICY "conversations_select"
  ON "conversations" FOR SELECT TO authenticated
  USING (user1_id = (select auth.uid()) OR user2_id = (select auth.uid()));

DROP POLICY IF EXISTS "conversations_insert" ON "conversations";
CREATE POLICY "conversations_insert"
  ON "conversations" FOR INSERT TO authenticated
  WITH CHECK (user1_id = (select auth.uid()) OR user2_id = (select auth.uid()));

DROP POLICY IF EXISTS "conversations_update" ON "conversations";
CREATE POLICY "conversations_update"
  ON "conversations" FOR UPDATE TO authenticated
  USING (user1_id = (select auth.uid()) OR user2_id = (select auth.uid()));

-- ============================================================
-- 4. messages
-- ============================================================
DROP POLICY IF EXISTS "messages_select" ON "messages";
CREATE POLICY "messages_select"
  ON "messages" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.user1_id = (select auth.uid()) OR c.user2_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "messages_insert" ON "messages";
CREATE POLICY "messages_insert"
  ON "messages" FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.user1_id = (select auth.uid()) OR c.user2_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "messages_update" ON "messages";
CREATE POLICY "messages_update"
  ON "messages" FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.user1_id = (select auth.uid()) OR c.user2_id = (select auth.uid()))
    )
  );

-- ============================================================
-- 5. notifications (delete was missing from previous migration)
-- ============================================================
DROP POLICY IF EXISTS "notifications_delete" ON "notifications";
CREATE POLICY "notifications_delete"
  ON "notifications" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 6. nooks
-- ============================================================
DROP POLICY IF EXISTS "nooks_insert" ON "nooks";
CREATE POLICY "nooks_insert"
  ON "nooks" FOR INSERT TO authenticated
  WITH CHECK (creator_id = (select auth.uid()));

DROP POLICY IF EXISTS "nooks_update" ON "nooks";
CREATE POLICY "nooks_update"
  ON "nooks" FOR UPDATE TO authenticated
  USING (creator_id = (select auth.uid()));

-- ============================================================
-- 7. nook_members
-- ============================================================
DROP POLICY IF EXISTS "nook_members_select" ON "nook_members";
CREATE POLICY "nook_members_select"
  ON "nook_members" FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "nook_members_insert" ON "nook_members";
CREATE POLICY "nook_members_insert"
  ON "nook_members" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "nook_members_update" ON "nook_members";
CREATE POLICY "nook_members_update"
  ON "nook_members" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "nook_members_delete" ON "nook_members";
CREATE POLICY "nook_members_delete"
  ON "nook_members" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 8. nook_messages
-- ============================================================
DROP POLICY IF EXISTS "nook_messages_select" ON "nook_messages";
CREATE POLICY "nook_messages_select"
  ON "nook_messages" FOR SELECT TO authenticated
  USING (
    is_removed = false
    AND EXISTS (
      SELECT 1 FROM nook_members nm
      WHERE nm.nook_id = nook_messages.nook_id
      AND nm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "nook_messages_insert" ON "nook_messages";
CREATE POLICY "nook_messages_insert"
  ON "nook_messages" FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM nook_members nm
      WHERE nm.nook_id = nook_messages.nook_id
      AND nm.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "nook_messages_update" ON "nook_messages";
CREATE POLICY "nook_messages_update"
  ON "nook_messages" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 9. nook_reactions
-- ============================================================
DROP POLICY IF EXISTS "nook_reactions_insert" ON "nook_reactions";
CREATE POLICY "nook_reactions_insert"
  ON "nook_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "nook_reactions_delete" ON "nook_reactions";
CREATE POLICY "nook_reactions_delete"
  ON "nook_reactions" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 10. nook_message_reactions
-- ============================================================
DROP POLICY IF EXISTS "nook_message_reactions_insert" ON "nook_message_reactions";
CREATE POLICY "nook_message_reactions_insert"
  ON "nook_message_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "nook_message_reactions_delete" ON "nook_message_reactions";
CREATE POLICY "nook_message_reactions_delete"
  ON "nook_message_reactions" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 11. mentorship_requests (the actual table, not mentorship_direct_requests)
-- ============================================================
DROP POLICY IF EXISTS "mentorship_requests_select" ON "mentorship_requests";
CREATE POLICY "mentorship_requests_select"
  ON "mentorship_requests" FOR SELECT TO authenticated
  USING (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_requests_insert" ON "mentorship_requests";
CREATE POLICY "mentorship_requests_insert"
  ON "mentorship_requests" FOR INSERT TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_requests_update" ON "mentorship_requests";
CREATE POLICY "mentorship_requests_update"
  ON "mentorship_requests" FOR UPDATE TO authenticated
  USING (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_requests_delete" ON "mentorship_requests";
CREATE POLICY "mentorship_requests_delete"
  ON "mentorship_requests" FOR DELETE TO authenticated
  USING (requester_id = (select auth.uid()));

-- ============================================================
-- 12. mentorship_direct_requests (the _direct_requests_ named policies)
-- ============================================================
DROP POLICY IF EXISTS "mentorship_direct_requests_select" ON "mentorship_direct_requests";
CREATE POLICY "mentorship_direct_requests_select"
  ON "mentorship_direct_requests" FOR SELECT TO authenticated
  USING (requester_id = (select auth.uid()) OR target_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_direct_requests_insert" ON "mentorship_direct_requests";
CREATE POLICY "mentorship_direct_requests_insert"
  ON "mentorship_direct_requests" FOR INSERT TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_direct_requests_update" ON "mentorship_direct_requests";
CREATE POLICY "mentorship_direct_requests_update"
  ON "mentorship_direct_requests" FOR UPDATE TO authenticated
  USING (requester_id = (select auth.uid()) OR target_user_id = (select auth.uid()));

-- ============================================================
-- 13. mentorship_bookmarks
-- ============================================================
DROP POLICY IF EXISTS "mentorship_bookmarks_select" ON "mentorship_bookmarks";
CREATE POLICY "mentorship_bookmarks_select"
  ON "mentorship_bookmarks" FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_bookmarks_insert" ON "mentorship_bookmarks";
CREATE POLICY "mentorship_bookmarks_insert"
  ON "mentorship_bookmarks" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "mentorship_bookmarks_delete" ON "mentorship_bookmarks";
CREATE POLICY "mentorship_bookmarks_delete"
  ON "mentorship_bookmarks" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 14. feed_posts
-- ============================================================
DROP POLICY IF EXISTS "feed_posts_insert" ON "feed_posts";
CREATE POLICY "feed_posts_insert"
  ON "feed_posts" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_posts_update" ON "feed_posts";
CREATE POLICY "feed_posts_update"
  ON "feed_posts" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_posts_delete" ON "feed_posts";
CREATE POLICY "feed_posts_delete"
  ON "feed_posts" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 15. feed_likes
-- ============================================================
DROP POLICY IF EXISTS "feed_likes_insert" ON "feed_likes";
CREATE POLICY "feed_likes_insert"
  ON "feed_likes" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_likes_delete" ON "feed_likes";
CREATE POLICY "feed_likes_delete"
  ON "feed_likes" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 16. feed_comments
-- ============================================================
DROP POLICY IF EXISTS "feed_comments_insert" ON "feed_comments";
CREATE POLICY "feed_comments_insert"
  ON "feed_comments" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_comments_update" ON "feed_comments";
CREATE POLICY "feed_comments_update"
  ON "feed_comments" FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_comments_delete" ON "feed_comments";
CREATE POLICY "feed_comments_delete"
  ON "feed_comments" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 17. feed_shares
-- ============================================================
DROP POLICY IF EXISTS "feed_shares_insert" ON "feed_shares";
CREATE POLICY "feed_shares_insert"
  ON "feed_shares" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_shares_delete" ON "feed_shares";
CREATE POLICY "feed_shares_delete"
  ON "feed_shares" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 18. feed_views
-- ============================================================
DROP POLICY IF EXISTS "feed_views_select" ON "feed_views";
CREATE POLICY "feed_views_select"
  ON "feed_views" FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_views_insert" ON "feed_views";
CREATE POLICY "feed_views_insert"
  ON "feed_views" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================
-- 19. feed_bookmarks
-- ============================================================
DROP POLICY IF EXISTS "feed_bookmarks_select" ON "feed_bookmarks";
CREATE POLICY "feed_bookmarks_select"
  ON "feed_bookmarks" FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_bookmarks_insert" ON "feed_bookmarks";
CREATE POLICY "feed_bookmarks_insert"
  ON "feed_bookmarks" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_bookmarks_delete" ON "feed_bookmarks";
CREATE POLICY "feed_bookmarks_delete"
  ON "feed_bookmarks" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 20. feed_reactions (RLS may have been added outside migrations)
-- ============================================================
ALTER TABLE "feed_reactions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_reactions_select" ON "feed_reactions";
CREATE POLICY "feed_reactions_select"
  ON "feed_reactions" FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "feed_reactions_insert" ON "feed_reactions";
CREATE POLICY "feed_reactions_insert"
  ON "feed_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "feed_reactions_delete" ON "feed_reactions";
CREATE POLICY "feed_reactions_delete"
  ON "feed_reactions" FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================
-- 21. harassment_reports
-- ============================================================
DROP POLICY IF EXISTS "harassment_reports_select" ON "harassment_reports";
CREATE POLICY "harassment_reports_select"
  ON "harassment_reports" FOR SELECT TO authenticated
  USING (reporter_id = (select auth.uid()));

DROP POLICY IF EXISTS "harassment_reports_insert" ON "harassment_reports";
CREATE POLICY "harassment_reports_insert"
  ON "harassment_reports" FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (select auth.uid()));
