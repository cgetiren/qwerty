
/*
  # Fix chat_analysis NULL brand_id

  ## Problem
  52 MarkBia chat_analysis records were created with brand_id = NULL because
  the analyze-chat edge function did not pass brand_id when inserting analysis records.

  ## Fix
  Update all chat_analysis records with NULL brand_id by looking up the brand_id
  from the corresponding chats table.
*/

UPDATE chat_analysis ca
SET brand_id = c.brand_id
FROM chats c
WHERE ca.chat_id = c.id
  AND ca.brand_id IS NULL
  AND c.brand_id IS NOT NULL;
