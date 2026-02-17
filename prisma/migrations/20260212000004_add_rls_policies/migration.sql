-- AddRlsPolicies: Row Level Security for all tables
-- The backend uses service_role (supabaseAdmin) which bypasses RLS.
-- These policies protect against direct Supabase client access and
-- provide defense-in-depth.
--
-- Roles:
--   service_role  → bypasses RLS automatically (backend admin client)
--   authenticated → logged-in user via Supabase Auth (subject to RLS)
--   anon          → unauthenticated (no access to any table)

-- ============================================================
-- 1. USER PROFILES
-- ============================================================
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;

-- Own profile: full access
CREATE POLICY "user_profiles_select_own"
  ON "user_profiles" FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Other profiles: only non-deleted, non-deactivated
CREATE POLICY "user_profiles_select_others"
  ON "user_profiles" FOR SELECT TO authenticated
  USING (
    is_deleted = false
    AND is_deactivated = false
  );

-- Insert own profile only
CREATE POLICY "user_profiles_insert"
  ON "user_profiles" FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Update own profile only
CREATE POLICY "user_profiles_update"
  ON "user_profiles" FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No direct delete (soft delete via is_deleted flag)

-- ============================================================
-- 2. FORUMS
-- ============================================================
ALTER TABLE "forums" ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read forums
CREATE POLICY "forums_select"
  ON "forums" FOR SELECT TO authenticated
  USING (true);

-- No insert/update/delete for authenticated (admin via service_role only)

-- ============================================================
-- 3. FORUM MEMBERS
-- ============================================================
ALTER TABLE "forum_members" ENABLE ROW LEVEL SECURITY;

-- Members can see their own memberships
CREATE POLICY "forum_members_select"
  ON "forum_members" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can join forums
CREATE POLICY "forum_members_insert"
  ON "forum_members" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can leave forums
CREATE POLICY "forum_members_delete"
  ON "forum_members" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 4. FORUM TOPICS
-- ============================================================
ALTER TABLE "forum_topics" ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read topics
CREATE POLICY "forum_topics_select"
  ON "forum_topics" FOR SELECT TO authenticated
  USING (true);

-- Users can create topics (own user_id)
CREATE POLICY "forum_topics_insert"
  ON "forum_topics" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update own topics
CREATE POLICY "forum_topics_update"
  ON "forum_topics" FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 5. FORUM COMMENTS
-- ============================================================
ALTER TABLE "forum_comments" ENABLE ROW LEVEL SECURITY;

-- All authenticated can read non-removed comments
CREATE POLICY "forum_comments_select"
  ON "forum_comments" FOR SELECT TO authenticated
  USING (is_removed = false OR user_id = auth.uid());

-- Users can create comments
CREATE POLICY "forum_comments_insert"
  ON "forum_comments" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update own comments
CREATE POLICY "forum_comments_update"
  ON "forum_comments" FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 6. TOPIC REACTIONS
-- ============================================================
ALTER TABLE "topic_reactions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topic_reactions_select"
  ON "topic_reactions" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "topic_reactions_insert"
  ON "topic_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "topic_reactions_delete"
  ON "topic_reactions" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 7. COMMENT REACTIONS
-- ============================================================
ALTER TABLE "comment_reactions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_reactions_select"
  ON "comment_reactions" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "comment_reactions_insert"
  ON "comment_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "comment_reactions_delete"
  ON "comment_reactions" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 8. REFERRAL POSTS
-- ============================================================
ALTER TABLE "referral_posts" ENABLE ROW LEVEL SECURITY;

-- All authenticated can read referral posts
CREATE POLICY "referral_posts_select"
  ON "referral_posts" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "referral_posts_insert"
  ON "referral_posts" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "referral_posts_update"
  ON "referral_posts" FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "referral_posts_delete"
  ON "referral_posts" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 9. REFERRAL CONNECTIONS
-- ============================================================
ALTER TABLE "referral_connections" ENABLE ROW LEVEL SECURITY;

-- Sender or receiver can read
CREATE POLICY "referral_connections_select"
  ON "referral_connections" FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Sender creates the connection
CREATE POLICY "referral_connections_insert"
  ON "referral_connections" FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Either party can update
CREATE POLICY "referral_connections_update"
  ON "referral_connections" FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Either party can delete
CREATE POLICY "referral_connections_delete"
  ON "referral_connections" FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- ============================================================
-- 10. IDENTITY REVEALS
-- ============================================================
ALTER TABLE "identity_reveals" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "identity_reveals_select"
  ON "identity_reveals" FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR responder_id = auth.uid());

CREATE POLICY "identity_reveals_insert"
  ON "identity_reveals" FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "identity_reveals_update"
  ON "identity_reveals" FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR responder_id = auth.uid());

-- ============================================================
-- 11. REFERRAL LIKES
-- ============================================================
ALTER TABLE "referral_likes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_likes_select"
  ON "referral_likes" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "referral_likes_insert"
  ON "referral_likes" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "referral_likes_delete"
  ON "referral_likes" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 12. REFERRAL BOOKMARKS
-- ============================================================
ALTER TABLE "referral_bookmarks" ENABLE ROW LEVEL SECURITY;

-- Only own bookmarks visible
CREATE POLICY "referral_bookmarks_select"
  ON "referral_bookmarks" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "referral_bookmarks_insert"
  ON "referral_bookmarks" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "referral_bookmarks_delete"
  ON "referral_bookmarks" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 13. REFERRAL COMMENTS
-- ============================================================
ALTER TABLE "referral_comments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_comments_select"
  ON "referral_comments" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "referral_comments_insert"
  ON "referral_comments" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "referral_comments_update"
  ON "referral_comments" FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "referral_comments_delete"
  ON "referral_comments" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 14. MENTORSHIP RELATIONSHIPS
-- ============================================================
ALTER TABLE "mentorship_relationships" ENABLE ROW LEVEL SECURITY;

-- Only mentor or mentee can see
CREATE POLICY "mentorship_relationships_select"
  ON "mentorship_relationships" FOR SELECT TO authenticated
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid());

-- Either party can update (accept, rate, etc.)
CREATE POLICY "mentorship_relationships_update"
  ON "mentorship_relationships" FOR UPDATE TO authenticated
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid());

-- Insert handled by service_role only (backend creates relationships)

-- ============================================================
-- 15. MENTORSHIP SESSIONS
-- ============================================================
ALTER TABLE "mentorship_sessions" ENABLE ROW LEVEL SECURITY;

-- Participants can see sessions (via relationship)
CREATE POLICY "mentorship_sessions_select"
  ON "mentorship_sessions" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mentorship_relationships mr
      WHERE mr.id = relationship_id
      AND (mr.mentor_id = auth.uid() OR mr.mentee_id = auth.uid())
    )
  );

-- Participants can create sessions
CREATE POLICY "mentorship_sessions_insert"
  ON "mentorship_sessions" FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mentorship_relationships mr
      WHERE mr.id = relationship_id
      AND (mr.mentor_id = auth.uid() OR mr.mentee_id = auth.uid())
    )
  );

-- Participants can update sessions
CREATE POLICY "mentorship_sessions_update"
  ON "mentorship_sessions" FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM mentorship_relationships mr
      WHERE mr.id = relationship_id
      AND (mr.mentor_id = auth.uid() OR mr.mentee_id = auth.uid())
    )
  );

-- ============================================================
-- 16. MENTORSHIP REQUESTS
-- ============================================================
ALTER TABLE "mentorship_requests" ENABLE ROW LEVEL SECURITY;

-- Requester can see own requests
CREATE POLICY "mentorship_requests_select"
  ON "mentorship_requests" FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "mentorship_requests_insert"
  ON "mentorship_requests" FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "mentorship_requests_update"
  ON "mentorship_requests" FOR UPDATE TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "mentorship_requests_delete"
  ON "mentorship_requests" FOR DELETE TO authenticated
  USING (requester_id = auth.uid());

-- ============================================================
-- 17. MENTORSHIP DIRECT REQUESTS
-- ============================================================
ALTER TABLE "mentorship_direct_requests" ENABLE ROW LEVEL SECURITY;

-- Requester or target can see
CREATE POLICY "mentorship_direct_requests_select"
  ON "mentorship_direct_requests" FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR target_user_id = auth.uid());

CREATE POLICY "mentorship_direct_requests_insert"
  ON "mentorship_direct_requests" FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Either party can update (accept/decline)
CREATE POLICY "mentorship_direct_requests_update"
  ON "mentorship_direct_requests" FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR target_user_id = auth.uid());

-- ============================================================
-- 18. MENTORSHIP BOOKMARKS
-- ============================================================
ALTER TABLE "mentorship_bookmarks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mentorship_bookmarks_select"
  ON "mentorship_bookmarks" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "mentorship_bookmarks_insert"
  ON "mentorship_bookmarks" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mentorship_bookmarks_delete"
  ON "mentorship_bookmarks" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 19. CONVERSATIONS
-- ============================================================
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;

-- Only participants can see conversations
CREATE POLICY "conversations_select"
  ON "conversations" FOR SELECT TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid());

-- Participant can create (must be user1 or user2)
CREATE POLICY "conversations_insert"
  ON "conversations" FOR INSERT TO authenticated
  WITH CHECK (user1_id = auth.uid() OR user2_id = auth.uid());

-- Participant can update (clear chat, reveal identity)
CREATE POLICY "conversations_update"
  ON "conversations" FOR UPDATE TO authenticated
  USING (user1_id = auth.uid() OR user2_id = auth.uid());

-- ============================================================
-- 20. MESSAGES
-- ============================================================
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;

-- Only conversation participants can read messages
CREATE POLICY "messages_select"
  ON "messages" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Sender must be authenticated user AND a conversation participant
CREATE POLICY "messages_insert"
  ON "messages" FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Sender can update own messages (edit, mark read)
CREATE POLICY "messages_update"
  ON "messages" FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- ============================================================
-- 21. NOTIFICATIONS
-- ============================================================
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- Users can only see own notifications
CREATE POLICY "notifications_select"
  ON "notifications" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can update own notifications (mark as read)
CREATE POLICY "notifications_update"
  ON "notifications" FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Users can delete own notifications
CREATE POLICY "notifications_delete"
  ON "notifications" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Insert handled by service_role only (backend creates notifications)

-- ============================================================
-- 22. USER FOLLOWS
-- ============================================================
ALTER TABLE "user_follows" ENABLE ROW LEVEL SECURITY;

-- Both follower and following can see the relationship
CREATE POLICY "user_follows_select"
  ON "user_follows" FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE POLICY "user_follows_insert"
  ON "user_follows" FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "user_follows_delete"
  ON "user_follows" FOR DELETE TO authenticated
  USING (follower_id = auth.uid());

-- ============================================================
-- 23. USER BLOCKS
-- ============================================================
ALTER TABLE "user_blocks" ENABLE ROW LEVEL SECURITY;

-- Only the blocker can see blocks
CREATE POLICY "user_blocks_select"
  ON "user_blocks" FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

CREATE POLICY "user_blocks_insert"
  ON "user_blocks" FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "user_blocks_delete"
  ON "user_blocks" FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

-- ============================================================
-- 24. NOOKS
-- ============================================================
ALTER TABLE "nooks" ENABLE ROW LEVEL SECURITY;

-- All authenticated can browse active, non-expired nooks
CREATE POLICY "nooks_select"
  ON "nooks" FOR SELECT TO authenticated
  USING (is_active = true AND expires_at > now());

-- Creator creates nooks
CREATE POLICY "nooks_insert"
  ON "nooks" FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- Creator can update own nooks
CREATE POLICY "nooks_update"
  ON "nooks" FOR UPDATE TO authenticated
  USING (creator_id = auth.uid());

-- ============================================================
-- 25. NOOK MEMBERS
-- ============================================================
ALTER TABLE "nook_members" ENABLE ROW LEVEL SECURITY;

-- Users can see own memberships
CREATE POLICY "nook_members_select"
  ON "nook_members" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "nook_members_insert"
  ON "nook_members" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update own membership (notifications settings)
CREATE POLICY "nook_members_update"
  ON "nook_members" FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Users can leave nooks
CREATE POLICY "nook_members_delete"
  ON "nook_members" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 26. NOOK MESSAGES
-- ============================================================
ALTER TABLE "nook_messages" ENABLE ROW LEVEL SECURITY;

-- Only nook members can read messages
CREATE POLICY "nook_messages_select"
  ON "nook_messages" FOR SELECT TO authenticated
  USING (
    is_removed = false
    AND EXISTS (
      SELECT 1 FROM nook_members nm
      WHERE nm.nook_id = nook_messages.nook_id
      AND nm.user_id = auth.uid()
    )
  );

-- Members can post messages
CREATE POLICY "nook_messages_insert"
  ON "nook_messages" FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM nook_members nm
      WHERE nm.nook_id = nook_messages.nook_id
      AND nm.user_id = auth.uid()
    )
  );

-- Users can update own messages
CREATE POLICY "nook_messages_update"
  ON "nook_messages" FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 27. NOOK REACTIONS
-- ============================================================
ALTER TABLE "nook_reactions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nook_reactions_select"
  ON "nook_reactions" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "nook_reactions_insert"
  ON "nook_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "nook_reactions_delete"
  ON "nook_reactions" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 28. NOOK MESSAGE REACTIONS
-- ============================================================
ALTER TABLE "nook_message_reactions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nook_message_reactions_select"
  ON "nook_message_reactions" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "nook_message_reactions_insert"
  ON "nook_message_reactions" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "nook_message_reactions_delete"
  ON "nook_message_reactions" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 29. FEED POSTS
-- ============================================================
ALTER TABLE "feed_posts" ENABLE ROW LEVEL SECURITY;

-- All authenticated can read non-archived posts
CREATE POLICY "feed_posts_select"
  ON "feed_posts" FOR SELECT TO authenticated
  USING (is_archived = false);

CREATE POLICY "feed_posts_insert"
  ON "feed_posts" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feed_posts_update"
  ON "feed_posts" FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feed_posts_delete"
  ON "feed_posts" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 30. FEED LIKES
-- ============================================================
ALTER TABLE "feed_likes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_likes_select"
  ON "feed_likes" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "feed_likes_insert"
  ON "feed_likes" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feed_likes_delete"
  ON "feed_likes" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 31. FEED COMMENTS
-- ============================================================
ALTER TABLE "feed_comments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_comments_select"
  ON "feed_comments" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "feed_comments_insert"
  ON "feed_comments" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feed_comments_update"
  ON "feed_comments" FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feed_comments_delete"
  ON "feed_comments" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 32. FEED SHARES
-- ============================================================
ALTER TABLE "feed_shares" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feed_shares_select"
  ON "feed_shares" FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "feed_shares_insert"
  ON "feed_shares" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feed_shares_delete"
  ON "feed_shares" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 33. FEED VIEWS
-- ============================================================
ALTER TABLE "feed_views" ENABLE ROW LEVEL SECURITY;

-- Users can only see own views
CREATE POLICY "feed_views_select"
  ON "feed_views" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "feed_views_insert"
  ON "feed_views" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 34. FEED BOOKMARKS
-- ============================================================
ALTER TABLE "feed_bookmarks" ENABLE ROW LEVEL SECURITY;

-- Users can only see own bookmarks
CREATE POLICY "feed_bookmarks_select"
  ON "feed_bookmarks" FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "feed_bookmarks_insert"
  ON "feed_bookmarks" FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "feed_bookmarks_delete"
  ON "feed_bookmarks" FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 35. HARASSMENT REPORTS
-- ============================================================
ALTER TABLE "harassment_reports" ENABLE ROW LEVEL SECURITY;

-- Reporters can see own reports only
CREATE POLICY "harassment_reports_select"
  ON "harassment_reports" FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "harassment_reports_insert"
  ON "harassment_reports" FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- No update/delete for authenticated (admin handles status changes via service_role)
