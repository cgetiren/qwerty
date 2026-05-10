/*
  # Add Reset Analysis Helper Functions

  ## Summary
  Creates two SECURITY DEFINER SQL functions that bypass RLS to reset chat analyses.
  This is needed because the authenticated user role only has SELECT on these tables,
  but admins need to delete analysis records and reset chat analyzed flags.

  ## New Functions

  ### reset_all_analyses()
  - Deletes ALL rows from chat_analysis table
  - Sets analyzed = false for ALL chats
  - Returns number of chats reset

  ### reset_single_chat_analysis(p_chat_id uuid)
  - Deletes chat_analysis rows for the given chat_id
  - Sets analyzed = false for the given chat
  - Returns 1 if the chat was found, 0 otherwise

  ## Security
  - Both functions use SECURITY DEFINER to run with owner privileges, bypassing RLS
  - Callable only by authenticated users (GRANT EXECUTE TO authenticated)
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
  DELETE FROM chat_analysis;

  UPDATE chats SET analyzed = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_all_analyses() TO authenticated;


CREATE OR REPLACE FUNCTION reset_single_chat_analysis(p_chat_id uuid)
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

GRANT EXECUTE ON FUNCTION reset_single_chat_analysis(uuid) TO authenticated;
