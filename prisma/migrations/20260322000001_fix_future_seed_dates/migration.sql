-- ============================================================
-- Fix seed data timestamps that ended up in the future.
--
-- The original seed migration calculated dates relative to now()
-- with offsets that could go negative, producing future timestamps.
--
-- Strategy: mirror any future timestamp around now() so it lands
-- the same distance into the PAST, plus a small 1-hour buffer.
-- This preserves relative ordering among records.
-- ============================================================

-- 1. Forum topics
UPDATE forum_topics SET
  created_at    = CASE WHEN created_at    > now() THEN now() - (created_at    - now()) - interval '1 hour' ELSE created_at    END,
  updated_at    = CASE WHEN updated_at    > now() THEN now() - (updated_at    - now()) - interval '1 hour' ELSE updated_at    END,
  last_activity_at = CASE WHEN last_activity_at > now() THEN now() - (last_activity_at - now()) - interval '1 hour' ELSE last_activity_at END
WHERE created_at > now() OR updated_at > now() OR last_activity_at > now();

-- 2. Forum comments
UPDATE forum_comments SET
  created_at = CASE WHEN created_at > now() THEN now() - (created_at - now()) - interval '1 hour' ELSE created_at END,
  updated_at = CASE WHEN updated_at > now() THEN now() - (updated_at - now()) - interval '1 hour' ELSE updated_at END
WHERE created_at > now() OR updated_at > now();

-- 3. Topic reactions
UPDATE topic_reactions SET
  created_at = now() - (created_at - now()) - interval '1 hour'
WHERE created_at > now();

-- 4. Nooks (created_at, updated_at, last_activity_at — leave expires_at as-is since expiration is meant to be future)
UPDATE nooks SET
  created_at       = CASE WHEN created_at       > now() THEN now() - (created_at       - now()) - interval '1 hour' ELSE created_at       END,
  updated_at       = CASE WHEN updated_at       > now() THEN now() - (updated_at       - now()) - interval '1 hour' ELSE updated_at       END,
  last_activity_at = CASE WHEN last_activity_at > now() THEN now() - (last_activity_at - now()) - interval '1 hour' ELSE last_activity_at END
WHERE created_at > now() OR updated_at > now() OR last_activity_at > now();

-- 5. Nook members
UPDATE nook_members SET
  joined_at    = CASE WHEN joined_at    > now() THEN now() - (joined_at    - now()) - interval '1 hour' ELSE joined_at    END,
  last_read_at = CASE WHEN last_read_at > now() THEN now() - (last_read_at - now()) - interval '1 hour' ELSE last_read_at END
WHERE joined_at > now() OR last_read_at > now();

-- 6. Nook messages
UPDATE nook_messages SET
  created_at = CASE WHEN created_at > now() THEN now() - (created_at - now()) - interval '1 hour' ELSE created_at END,
  updated_at = CASE WHEN updated_at > now() THEN now() - (updated_at - now()) - interval '1 hour' ELSE updated_at END
WHERE created_at > now() OR updated_at > now();

-- 7. Nook reactions
UPDATE nook_reactions SET
  created_at = now() - (created_at - now()) - interval '1 hour'
WHERE created_at > now();

-- 8. Feed posts
UPDATE feed_posts SET
  created_at = CASE WHEN created_at > now() THEN now() - (created_at - now()) - interval '1 hour' ELSE created_at END,
  updated_at = CASE WHEN updated_at > now() THEN now() - (updated_at - now()) - interval '1 hour' ELSE updated_at END
WHERE created_at > now() OR updated_at > now();

-- 9. Feed likes
UPDATE feed_likes SET
  created_at = now() - (created_at - now()) - interval '1 hour'
WHERE created_at > now();

-- 10. Feed comments
UPDATE feed_comments SET
  created_at = CASE WHEN created_at > now() THEN now() - (created_at - now()) - interval '1 hour' ELSE created_at END,
  updated_at = CASE WHEN updated_at > now() THEN now() - (updated_at - now()) - interval '1 hour' ELSE updated_at END
WHERE created_at > now() OR updated_at > now();
