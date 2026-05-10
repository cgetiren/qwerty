/*
  # Fix Cron Sync to Use 2 Hours Window
  
  1. Changes
    - Update cron_sync_livechat() to call sync without parameters (defaults to 2 hours)
    - Remove days=1 parameter that was causing timeouts
  
  2. Notes
    - days=1 was trying to fetch 24 hours of data, causing Edge Function timeout
    - Default behavior now fetches last 2 hours, which completes within timeout
    - Cron runs every 2 minutes, so 2-hour window ensures no data is missed
*/

CREATE OR REPLACE FUNCTION cron_sync_livechat()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM invoke_edge_function('sync-livechat');
END;
$$;
