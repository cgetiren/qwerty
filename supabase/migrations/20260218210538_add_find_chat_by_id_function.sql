/*
  # Add find_chat_by_id SQL function

  Creates a helper function that searches chats by id or chat_id
  using case-insensitive matching, for use in the Telegram webhook.
*/

CREATE OR REPLACE FUNCTION find_chat_by_id(search_id text)
RETURNS TABLE(
  id text,
  chat_id text,
  agent_name text,
  customer_name text,
  created_at timestamptz,
  status text,
  message_count int
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT c.id, c.chat_id, c.agent_name, c.customer_name, c.created_at, c.status, c.message_count
  FROM chats c
  WHERE upper(c.id) = upper(search_id)
     OR upper(c.chat_id) = upper(search_id)
  LIMIT 1;
$$;
