/*
  # Prevent Duplicate Chat Analysis

  1. Changes
    - Add unique constraint on chat_analysis(chat_id) to prevent duplicate analysis
    - This ensures each chat has only one analysis record

  2. Security
    - No changes to RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chat_analysis_chat_id_unique'
  ) THEN
    ALTER TABLE chat_analysis 
    ADD CONSTRAINT chat_analysis_chat_id_unique UNIQUE (chat_id);
  END IF;
END $$;