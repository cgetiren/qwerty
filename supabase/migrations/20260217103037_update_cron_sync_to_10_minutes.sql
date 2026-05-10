/*
  # Update Cron Sync to Use 10 Minutes Window
  
  1. Changes
    - Update cron_sync_livechat() to call sync without parameters (defaults to 10 minutes)
    - 10-minute window ensures fast execution (15-20 seconds) and avoids timeouts
    - With cron running every 2 minutes, 10-minute window ensures overlap and no missed data
  
  2. Notes
    - Previous setting used 2 hours which was taking too long and timing out
    - Default behavior now fetches last 10 minutes (~5-15 chats typically)
    - Cron runs every 2 minutes, so overlapping windows ensure all data is captured
    - For manual sync of larger time ranges, use start_date/end_date parameters
*/

CREATE OR REPLACE FUNCTION cron_sync_livechat()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM invoke_edge_function('sync-livechat');
END;
$$;
