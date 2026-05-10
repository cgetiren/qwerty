
/*
  # Add last_analyze_error column to system_config

  Stores the last Claude API error for debugging.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_config' AND column_name = 'last_analyze_error'
  ) THEN
    ALTER TABLE system_config ADD COLUMN last_analyze_error text;
  END IF;
END $$;
