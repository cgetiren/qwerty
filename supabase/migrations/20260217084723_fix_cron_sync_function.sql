/*
  # Fix Cron Sync Function
  
  1. Changes
    - Fix cron_sync_livechat() function to use simple days parameter
    - Remove complex date calculation that was causing URL format errors
  
  2. Notes
    - Cron job was failing with "URL using bad/illegal format" error
    - Function was trying to use undefined start_time/end_time variables
    - Now uses simple 'days=1' parameter as originally intended
*/

CREATE OR REPLACE FUNCTION cron_sync_livechat()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM invoke_edge_function('sync-livechat', 'days=1');
END;
$$;
