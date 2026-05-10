/*
  # Fix chat_messages with wrong chat_id (safe version)
  
  1. Problem
    - Many messages have incorrect chat_id values
    - message_id format is "CHAT_ID_NUMBER" but chat_id doesn't match
  
  2. Solution
    - Extract correct chat_id from message_id
    - Only update if the correct chat_id exists in chats table
  
  3. Safety
    - Only updates messages where:
      - chat_id doesn't match message_id prefix
      - correct chat_id exists in chats table
*/

UPDATE chat_messages cm
SET chat_id = LEFT(cm.message_id, POSITION('_' IN cm.message_id) - 1)
WHERE cm.chat_id != LEFT(cm.message_id, POSITION('_' IN cm.message_id) - 1)
  AND POSITION('_' IN cm.message_id) > 0
  AND EXISTS (
    SELECT 1 FROM chats c 
    WHERE c.id = LEFT(cm.message_id, POSITION('_' IN cm.message_id) - 1)
  );