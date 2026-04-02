-- Per-user soft delete on messages
ALTER TABLE messages ADD COLUMN deleted_by_user1 BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN deleted_by_user2 BOOLEAN DEFAULT false;

-- Per-user soft delete on conversations
ALTER TABLE conversations ADD COLUMN user1_deleted_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN user2_deleted_at TIMESTAMPTZ;
