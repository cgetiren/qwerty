/*
  # Add Claude API Key to Settings

  ## Changes
  - Add `claude_api_key` column to settings table to support Claude AI for chat analysis
  - This replaces ChatGPT as the AI provider for analyzing customer service conversations
  
  ## Migration Details
  - Adds text column for storing Claude API key
  - Safely checks if column exists before adding (idempotent)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'claude_api_key'
  ) THEN
    ALTER TABLE settings ADD COLUMN claude_api_key text;
  END IF;
END $$;