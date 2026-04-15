-- Migration: add partial unique indexes to close NULL-gap constraint holes
--
-- 1. identity_reveals: prevent duplicate pending reveal requests between the same pair
--    regardless of connection_id (NULL != NULL in standard unique constraints, so
--    two pending requests could be created for the same pair when connection_id is NULL).
--
-- 2. conversations: prevent duplicate conversations of the same context_type between
--    the same user pair when context_id IS NULL (same NULL != NULL gap).

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_reveals_pending_pair
  ON identity_reveals (requester_id, responder_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_null_context
  ON conversations (user1_id, user2_id, context_type)
  WHERE context_id IS NULL;
