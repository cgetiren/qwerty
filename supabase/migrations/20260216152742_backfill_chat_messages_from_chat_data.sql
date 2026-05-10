/*
  # Backfill chat messages from chat_data
  
  1. Purpose
    - Extract messages from existing chats' chat_data field
    - Populate chat_messages table with historical messages
    - Fix 0-score chats that have messages but weren't analyzed
  
  2. Process
    - Read all chats with messages in chat_data
    - Extract messages from all_messages array
    - Insert into chat_messages table
*/

DO $$
DECLARE
  chat_record RECORD;
  message_record json;
  messages_array json[];
BEGIN
  RAISE NOTICE 'Starting backfill of chat messages...';
  
  FOR chat_record IN 
    SELECT 
      id,
      chat_data->'properties'->'full_chat_data'->'all_messages' as all_messages
    FROM chats
    WHERE chat_data->'properties'->'full_chat_data'->'all_messages' IS NOT NULL
      AND jsonb_array_length(chat_data->'properties'->'full_chat_data'->'all_messages') > 0
      AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = chats.id)
  LOOP
    RAISE NOTICE 'Processing chat: %', chat_record.id;
    
    FOR message_record IN 
      SELECT * FROM json_array_elements(chat_record.all_messages::json)
    LOOP
      IF message_record->>'type' = 'message' THEN
        INSERT INTO chat_messages (chat_id, message_id, author_id, author_type, text, created_at, is_system)
        VALUES (
          chat_record.id,
          message_record->>'id',
          message_record->>'author_id',
          CASE 
            WHEN (message_record->>'author_id') LIKE '%@%' THEN 'agent'
            ELSE 'customer'
          END,
          message_record->>'text',
          (message_record->>'created_at')::timestamptz,
          false
        )
        ON CONFLICT (message_id) DO NOTHING;
      ELSIF message_record->>'type' = 'system_message' THEN
        INSERT INTO chat_messages (chat_id, message_id, author_id, author_type, text, created_at, is_system)
        VALUES (
          chat_record.id,
          message_record->>'id',
          'system',
          'system',
          message_record->>'text',
          (message_record->>'created_at')::timestamptz,
          true
        )
        ON CONFLICT (message_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Backfill completed!';
END $$;