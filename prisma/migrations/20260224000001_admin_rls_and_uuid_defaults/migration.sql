-- Migration: Admin RLS policies + UUID defaults
--
-- 1. Ensure pgcrypto is available for gen_random_uuid()
-- 2. Enable RLS on the 4 new admin tables
-- 3. Add role-aware SELECT policies (write is service_role only)
-- 4. Update existing content table SELECT policies to hide is_hidden rows from regular users

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. UUID generator extension
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure all new admin table id columns default to gen_random_uuid() (idempotent)
ALTER TABLE admin_logs              ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE report_timeline_events  ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE content_moderation      ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE admin_notifications     ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. admin_logs
--    Only admins/super_admins can SELECT. No client INSERT/UPDATE/DELETE.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_logs_select" ON "admin_logs";
CREATE POLICY "admin_logs_select"
  ON "admin_logs" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. report_timeline_events
--    Moderators and above can SELECT. No client write.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE report_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_timeline_events_select" ON "report_timeline_events";
CREATE POLICY "report_timeline_events_select"
  ON "report_timeline_events" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('moderator', 'admin', 'super_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. content_moderation
--    Moderators and above can SELECT. No client write.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE content_moderation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_moderation_select" ON "content_moderation";
CREATE POLICY "content_moderation_select"
  ON "content_moderation" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('moderator', 'admin', 'super_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. admin_notifications
--    Admins/super_admins can SELECT the management table. No client write.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications_select" ON "admin_notifications";
CREATE POLICY "admin_notifications_select"
  ON "admin_notifications" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Update existing content SELECT policies to respect is_hidden
--    Hidden content is invisible to regular authenticated users.
--    Admins access via service_role which bypasses RLS entirely.
-- ─────────────────────────────────────────────────────────────────────────────

-- feed_posts: exclude hidden posts
DROP POLICY IF EXISTS "feed_posts_select" ON "feed_posts";
CREATE POLICY "feed_posts_select"
  ON "feed_posts" FOR SELECT TO authenticated
  USING (is_archived = false AND is_hidden = false);

-- forum_topics: exclude hidden topics
DROP POLICY IF EXISTS "forum_topics_select" ON "forum_topics";
CREATE POLICY "forum_topics_select"
  ON "forum_topics" FOR SELECT TO authenticated
  USING (is_hidden = false);

-- forum_comments: exclude hidden comments (own comments still visible to author)
DROP POLICY IF EXISTS "forum_comments_select" ON "forum_comments";
CREATE POLICY "forum_comments_select"
  ON "forum_comments" FOR SELECT TO authenticated
  USING (
    (is_removed = false AND is_hidden = false)
    OR user_id = (SELECT auth.uid())
  );

-- nook_messages: exclude hidden messages
DROP POLICY IF EXISTS "nook_messages_select" ON "nook_messages";
CREATE POLICY "nook_messages_select"
  ON "nook_messages" FOR SELECT TO authenticated
  USING (
    is_removed = false
    AND is_hidden = false
    AND EXISTS (
      SELECT 1 FROM nook_members nm
      WHERE nm.nook_id = nook_messages.nook_id
        AND nm.user_id = (SELECT auth.uid())
    )
  );

-- nooks: exclude hidden nooks
DROP POLICY IF EXISTS "nooks_select" ON "nooks";
CREATE POLICY "nooks_select"
  ON "nooks" FOR SELECT TO authenticated
  USING (is_active = true AND is_hidden = false AND expires_at > now());
