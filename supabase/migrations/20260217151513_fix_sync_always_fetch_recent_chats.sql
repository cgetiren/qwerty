/*
  # Fix Sync to Always Fetch Recent Chats

  1. Problem
    - Smart incremental sync relies on completed sync jobs
    - When all syncs fail, it falls back to 7 days ago
    - This causes it to skip recent chats (last 3 hours were missed)

  2. Solution
    - Simplify cron sync to always fetch last 2 hours
    - This ensures we never miss recent chats
    - Previous smart sync logic was too complex and fragile

  3. Changes
    - Update cron_sync_livechat() to always sync last 2 hours
    - Remove dependency on failed/completed sync job tracking
    - More reliable, simpler approach
*/

CREATE OR REPLACE FUNCTION cron_sync_livechat()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  start_date_param text;
  end_date_param text;
  start_time timestamptz;
  end_time timestamptz;
BEGIN
  -- Always sync last 2 hours to ensure we don't miss any chats
  end_time := now();
  start_time := now() - interval '2 hours';

  -- Convert to ISO format for URL parameters
  start_date_param := to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end_date_param := to_char(end_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  -- Call sync with date range
  PERFORM invoke_edge_function(
    'sync-livechat',
    'start_date=' || start_date_param || '&end_date=' || end_date_param
  );

  -- Log for monitoring
  RAISE NOTICE 'Sync triggered: % to % (last 2 hours)', start_date_param, end_date_param;
END;
$$;