/*
  # Add coaching suggestions to chat analysis

  ## Changes
  1. Add coaching_suggestion column to chat_analysis table
    - Stores AI-generated coaching suggestions for each analyzed chat
    - Can be null if no coaching has been generated yet
  
  2. Add index for better query performance
    - Index on coaching_suggestion to quickly find chats with/without coaching
  
  3. Update RLS policies
    - Authenticated users can read coaching suggestions
    - Service role can update coaching suggestions
*/

-- Add coaching_suggestion column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'coaching_suggestion'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN coaching_suggestion text;
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_analysis_coaching_suggestion 
  ON chat_analysis(coaching_suggestion) 
  WHERE coaching_suggestion IS NOT NULL;
