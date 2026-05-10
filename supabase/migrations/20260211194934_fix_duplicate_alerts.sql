/*
  # Fix Duplicate Alerts and Add Unique Constraint
  
  ## Changes
  1. Remove duplicate alerts, keeping only the oldest one for each (chat_id, alert_type) combination
  2. Add unique constraint on (chat_id, alert_type) to prevent future duplicates
  
  ## Notes
  - This will clean up existing duplicate Telegram notifications
  - After this migration, duplicate alerts for the same chat cannot be created
*/

-- Delete duplicate alerts, keeping only the first (oldest) one
DELETE FROM alerts a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (chat_id, alert_type) id
  FROM alerts
  ORDER BY chat_id, alert_type, created_at ASC
);

-- Add unique constraint to prevent duplicate alerts for the same chat and alert type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'alerts_chat_id_alert_type_unique'
  ) THEN
    ALTER TABLE alerts 
    ADD CONSTRAINT alerts_chat_id_alert_type_unique 
    UNIQUE (chat_id, alert_type);
  END IF;
END $$;