-- Change nook_messages.nook_id FK from ON DELETE CASCADE to ON DELETE SET NULL
-- This preserves messages (and participant stats) after a nook expires and is deleted.

ALTER TABLE nook_messages DROP CONSTRAINT IF EXISTS nook_messages_nook_id_fkey;

ALTER TABLE nook_messages ALTER COLUMN nook_id DROP NOT NULL;

ALTER TABLE nook_messages
  ADD CONSTRAINT nook_messages_nook_id_fkey
  FOREIGN KEY (nook_id) REFERENCES nooks(id) ON DELETE SET NULL;
