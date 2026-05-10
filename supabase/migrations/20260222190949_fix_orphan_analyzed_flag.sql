/*
  # Fix Orphan Analyzed Flag

  ## Problem
  2 chats have `analyzed = true` but no corresponding `chat_analysis` record.
  These were likely interrupted during analysis. Reset their flag so they can be re-analyzed.

  ## Changes
  - Sets `analyzed = false` for chats with no chat_analysis record
*/

UPDATE chats
SET analyzed = false
WHERE id IN (
  SELECT c.id
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE ca.chat_id IS NULL
    AND c.analyzed = true
);
