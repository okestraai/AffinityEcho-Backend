-- Fix: Set immutable search_path on all SECURITY DEFINER functions.
-- Prevents search_path manipulation attacks (Supabase lint 0011).
-- Uses CREATE OR REPLACE to update existing functions in place.

-- ============================================================
-- FORUM RPC FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION increment_forum_topic_count(forum_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forums
  SET topic_count = topic_count + 1
  WHERE id = forum_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_forum_topic_count(forum_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forums
  SET topic_count = GREATEST(0, topic_count - 1)
  WHERE id = forum_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_forum_member_count(forum_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forums
  SET member_count = member_count + 1
  WHERE id = forum_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_forum_member_count(forum_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forums
  SET member_count = GREATEST(0, member_count - 1)
  WHERE id = forum_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_topic_views(topic_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forum_topics
  SET views_count = views_count + 1
  WHERE id = topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_topic_reaction(topic_id UUID, reaction_field TEXT)
RETURNS void AS $$
BEGIN
  IF reaction_field NOT IN (
    'reaction_seen_count', 'reaction_validated_count',
    'reaction_inspired_count', 'reaction_heard_count'
  ) THEN
    RAISE EXCEPTION 'Invalid reaction field: %', reaction_field;
  END IF;

  EXECUTE format(
    'UPDATE forum_topics SET %I = %I + 1 WHERE id = $1',
    reaction_field, reaction_field
  ) USING topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_topic_reaction(topic_id UUID, reaction_field TEXT)
RETURNS void AS $$
BEGIN
  IF reaction_field NOT IN (
    'reaction_seen_count', 'reaction_validated_count',
    'reaction_inspired_count', 'reaction_heard_count'
  ) THEN
    RAISE EXCEPTION 'Invalid reaction field: %', reaction_field;
  END IF;

  EXECUTE format(
    'UPDATE forum_topics SET %I = GREATEST(0, %I - 1) WHERE id = $1',
    reaction_field, reaction_field
  ) USING topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_topic_comment_count(topic_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forum_topics
  SET comments_count = comments_count + 1,
      last_activity_at = NOW()
  WHERE id = topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_topic_comment_count(topic_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forum_topics
  SET comments_count = GREATEST(0, comments_count - 1)
  WHERE id = topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_comment_reaction(comment_id UUID, reaction_field TEXT)
RETURNS void AS $$
BEGIN
  IF reaction_field NOT IN ('helpful_count', 'supportive_count') THEN
    RAISE EXCEPTION 'Invalid reaction field: %', reaction_field;
  END IF;

  EXECUTE format(
    'UPDATE forum_comments SET %I = %I + 1 WHERE id = $1',
    reaction_field, reaction_field
  ) USING comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_comment_reaction(comment_id UUID, reaction_field TEXT)
RETURNS void AS $$
BEGIN
  IF reaction_field NOT IN ('helpful_count', 'supportive_count') THEN
    RAISE EXCEPTION 'Invalid reaction field: %', reaction_field;
  END IF;

  EXECUTE format(
    'UPDATE forum_comments SET %I = GREATEST(0, %I - 1) WHERE id = $1',
    reaction_field, reaction_field
  ) USING comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION update_forum_activity(forum_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forums
  SET last_activity = NOW()
  WHERE id = forum_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================================
-- FEED RPC FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION increment_feed_post_views(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE feed_posts
  SET views_count = views_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_feed_post_likes(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE feed_posts
  SET likes_count = likes_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_feed_post_likes(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE feed_posts
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_feed_post_comments(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE feed_posts
  SET comments_count = comments_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_feed_post_shares(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE feed_posts
  SET shares_count = shares_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_feed_post_shares(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE feed_posts
  SET shares_count = GREATEST(0, shares_count - 1)
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================================
-- REFERRAL RPC FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION increment_referral_views(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET views_count = views_count + 1
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_referral_likes(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET likes_count = likes_count + 1
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_referral_likes(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_referral_bookmarks(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET bookmarks_count = bookmarks_count + 1
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_referral_bookmarks(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET bookmarks_count = GREATEST(0, bookmarks_count - 1)
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_referral_comments(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET comments_count = comments_count + 1
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_referral_comments(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET comments_count = GREATEST(0, comments_count - 1)
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_connection_requests(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET connection_requests_count = connection_requests_count + 1
  WHERE id = referral_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION decrement_available_slots(referral_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE referral_posts
  SET available_slots = GREATEST(0, available_slots - 1)
  WHERE id = referral_id
  AND available_slots > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION increment_user_posts(user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET total_posts = total_posts + 1
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
