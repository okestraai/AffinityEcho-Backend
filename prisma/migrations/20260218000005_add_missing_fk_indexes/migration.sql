-- Migration: Add missing FK indexes (26 total)
-- These were in 20260218000001 but that migration was never executed.
-- All use IF NOT EXISTS for idempotency.

CREATE INDEX IF NOT EXISTS "idx_comment_reactions_user_id"
  ON "comment_reactions" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_conversations_user2_id"
  ON "conversations" ("user2_id");

CREATE INDEX IF NOT EXISTS "idx_forum_comments_parent_comment_id"
  ON "forum_comments" ("parent_comment_id");
CREATE INDEX IF NOT EXISTS "idx_forum_comments_topic_id"
  ON "forum_comments" ("topic_id");
CREATE INDEX IF NOT EXISTS "idx_forum_comments_user_id"
  ON "forum_comments" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_forum_members_user_id"
  ON "forum_members" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_forum_topics_forum_id"
  ON "forum_topics" ("forum_id");
CREATE INDEX IF NOT EXISTS "idx_forum_topics_user_id"
  ON "forum_topics" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_identity_reveals_requester_id"
  ON "identity_reveals" ("requester_id");
CREATE INDEX IF NOT EXISTS "idx_identity_reveals_responder_id"
  ON "identity_reveals" ("responder_id");

CREATE INDEX IF NOT EXISTS "idx_mentorship_bookmarks_bookmarked_user_id"
  ON "mentorship_bookmarks" ("bookmarked_user_id");

CREATE INDEX IF NOT EXISTS "idx_mentorship_sessions_relationship_id"
  ON "mentorship_sessions" ("relationship_id");

CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id"
  ON "messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_messages_sender_id"
  ON "messages" ("sender_id");

CREATE INDEX IF NOT EXISTS "idx_nook_message_reactions_user_id"
  ON "nook_message_reactions" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_nook_messages_parent_message_id"
  ON "nook_messages" ("parent_message_id");

CREATE INDEX IF NOT EXISTS "idx_nook_reactions_user_id"
  ON "nook_reactions" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_nooks_creator_id"
  ON "nooks" ("creator_id");

CREATE INDEX IF NOT EXISTS "idx_notifications_actor_id"
  ON "notifications" ("actor_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_user_id"
  ON "notifications" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_referral_connections_receiver_id"
  ON "referral_connections" ("receiver_id");
CREATE INDEX IF NOT EXISTS "idx_referral_connections_sender_id"
  ON "referral_connections" ("sender_id");

CREATE INDEX IF NOT EXISTS "idx_referral_posts_user_id"
  ON "referral_posts" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_topic_reactions_user_id"
  ON "topic_reactions" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocked_id"
  ON "user_blocks" ("blocked_id");

CREATE INDEX IF NOT EXISTS "idx_user_follows_following_id"
  ON "user_follows" ("following_id");
