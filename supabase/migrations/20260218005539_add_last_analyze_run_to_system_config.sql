
/*
  # Add last_analyze_run column to system_config

  Adds a timestamp column to track when the analyze-chat edge function last ran.
  Used for debugging/monitoring purposes.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_config' AND column_name = 'last_analyze_run'
  ) THEN
    ALTER TABLE system_config ADD COLUMN last_analyze_run timestamptz;
  END IF;
END $$;
