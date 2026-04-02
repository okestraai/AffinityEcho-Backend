CREATE INDEX IF NOT EXISTS idx_forum_topics_tags ON forum_topics USING GIN (tags);
