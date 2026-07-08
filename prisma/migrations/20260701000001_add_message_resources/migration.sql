-- Persist the clickable in-product resources the coach recommended on a given
-- message, so the cards survive session resume/reload. Encrypted JSON, nullable.
-- FULLY ADDITIVE: ADD COLUMN IF NOT EXISTS only.

ALTER TABLE coaching_messages
  ADD COLUMN IF NOT EXISTS resources_json TEXT;
