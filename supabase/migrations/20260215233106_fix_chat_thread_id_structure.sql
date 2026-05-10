/*
  # Fix Chat/Thread ID Structure

  ## Problem
  LiveChat API returns a Chat with multiple Threads. Each Thread is a separate conversation.
  Currently we use chat.id as primary key, causing Thread data to overwrite each other.
  
  Example:
  - Chat ID: TA5IINASEO (container)
    - Thread 1: TA5IINASFO (conversation at 20:05)
    - Thread 2: TA5IJWW1H2 (conversation at 23:03)
  
  When Thread 2 syncs, it overwrites Thread 1 data because both have the same Chat ID.

  ## Solution
  1. Add `chat_id` column to store the parent Chat ID
  2. Current `id` column now stores Thread ID (primary key)
  3. Update constraints to allow multiple threads per chat
  4. Populate existing records with chat_id from their id (for backward compatibility)

  ## Changes
  - Add `chat_id` column (nullable, will be populated during sync)
  - Add index on `chat_id` for queries
  - Add index on `(chat_id, created_at)` for thread ordering
  - Keep existing data intact (id stays as thread_id)
*/

-- Add chat_id column to store parent chat container ID
ALTER TABLE chats ADD COLUMN IF NOT EXISTS chat_id text;

-- Create index on chat_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_chats_chat_id ON chats(chat_id);

-- Create composite index for thread ordering within a chat
CREATE INDEX IF NOT EXISTS idx_chats_chat_id_created_at ON chats(chat_id, created_at DESC);

-- For existing records without chat_id, use their id as chat_id (backward compatibility)
-- This ensures old data works, new data will have separate chat_id and thread_id
UPDATE chats 
SET chat_id = id 
WHERE chat_id IS NULL;

-- Add comment to clarify column purposes
COMMENT ON COLUMN chats.id IS 'Thread ID (primary key) - each thread is a separate conversation';
COMMENT ON COLUMN chats.chat_id IS 'Parent Chat ID - groups multiple threads from same customer session';
