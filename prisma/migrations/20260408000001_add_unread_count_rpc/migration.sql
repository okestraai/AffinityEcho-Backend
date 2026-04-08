-- Single-query unread message count (replaces 2 sequential queries)
CREATE OR REPLACE FUNCTION get_unread_message_count(p_user_id UUID, p_chat_type TEXT DEFAULT NULL)
RETURNS INTEGER AS $fn$
DECLARE result INTEGER;
BEGIN
  SELECT COUNT(m.id)::int INTO result
  FROM messages m
  JOIN conversations c ON m.conversation_id = c.id
  WHERE m.is_read = false
    AND m.sender_id != p_user_id
    AND (c.user1_id = p_user_id OR c.user2_id = p_user_id)
    AND c.is_active = true
    AND (p_chat_type IS NULL OR p_chat_type = 'all' OR c.context_type = p_chat_type);
  RETURN COALESCE(result, 0);
END;
$fn$ LANGUAGE plpgsql;
