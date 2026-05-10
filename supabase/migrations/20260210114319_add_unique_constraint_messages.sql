/*
  # Add unique constraint to chat_messages
  
  Add unique constraint on message_id to prevent duplicate messages.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_message_id_key'
  ) THEN
    ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_id_key UNIQUE (message_id);
  END IF;
END $$;