-- Edit/Delete columns for user-initiated content editing and soft-deletion
-- These are SEPARATE from admin moderation (is_hidden) and existing soft-delete (is_archived, is_removed, deleted_at on nooks)

-- feed_posts: only is_edited (already uses is_archived for user delete)
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

-- feed_comments: full edit + delete support
ALTER TABLE feed_comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE feed_comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE feed_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- forum_topics: full edit + delete support
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- forum_comments: full edit + delete support (SEPARATE from existing is_removed)
ALTER TABLE forum_comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE forum_comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE forum_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- nooks: only is_edited (already has deleted_at for admin/user delete)
ALTER TABLE nooks ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

-- nook_messages: full edit + delete support (SEPARATE from existing is_removed)
ALTER TABLE nook_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE nook_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE nook_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
