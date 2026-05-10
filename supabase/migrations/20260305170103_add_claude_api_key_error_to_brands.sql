/*
  # Add claude_api_key_error to brands table

  ## Summary
  Adds a `claude_api_key_error` column to `brands` to store the last Claude API
  error (e.g. "credit balance too low"). This makes billing/auth issues visible
  in the Brand Management UI without having to dig through function logs.

  ## Changes
  - `brands` table: Add `claude_api_key_error` (text, nullable)
    - Populated by analyze-chat when Claude returns HTTP 4xx
    - Cleared (set to NULL) when a chat is successfully analyzed for that brand
    - Displayed as a warning banner in the Brand Management page
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'claude_api_key_error'
  ) THEN
    ALTER TABLE brands ADD COLUMN claude_api_key_error text DEFAULT NULL;
  END IF;
END $$;
