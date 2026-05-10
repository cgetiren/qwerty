/*
  # Fix find_chat_by_id to return brand_id

  ## Problem
  The find_chat_by_id function was not returning brand_id in its result set.
  The MarkBia telegram webhook checks chatInfo.brand_id !== MARKBIA_BRAND_ID,
  but since brand_id was undefined, this check always failed and returned
  "Chat bulunamadi" even when the chat existed.

  ## Fix
  Drop and recreate the function with brand_id included in return columns.
*/

DROP FUNCTION IF EXISTS public.find_chat_by_id(text);

CREATE OR REPLACE FUNCTION public.find_chat_by_id(search_id text)
RETURNS TABLE(id text, chat_id text, brand_id uuid, agent_name text, customer_name text, created_at timestamp with time zone, status text, message_count integer)
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT c.id, c.chat_id, c.brand_id, c.agent_name, c.customer_name, c.created_at, c.status, c.message_count
FROM chats c
WHERE upper(c.id) = upper(search_id)
OR upper(c.chat_id) = upper(search_id)
LIMIT 1;
$$;
