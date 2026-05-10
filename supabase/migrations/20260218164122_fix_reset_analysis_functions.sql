/*
  # Fix Reset Analysis Functions

  ## Changes
  - reset_all_analyses: Added WHERE 1=1 to DELETE and UPDATE to satisfy the "DELETE requires a WHERE clause" guard
  - reset_single_chat_analysis: Changed parameter type from uuid to text, because chat IDs are LiveChat string IDs (e.g. "TA5KW49N01"), not UUIDs
*/

CREATE OR REPLACE FUNCTION reset_all_analyses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM chat_analysis WHERE id IS NOT NULL;

  UPDATE chats SET analyzed = false WHERE id IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_all_analyses() TO authenticated;


CREATE OR REPLACE FUNCTION reset_single_chat_analysis(p_chat_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM chat_analysis WHERE chat_id = p_chat_id;

  UPDATE chats SET analyzed = false WHERE id = p_chat_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_single_chat_analysis(text) TO authenticated;
