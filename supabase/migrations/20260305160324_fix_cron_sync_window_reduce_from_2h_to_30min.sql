/*
  # Fix Cron Sync Timeout - Reduce Window from 2 Hours to 30 Minutes

  ## Problem
  Marka Benja sync jobs have been failing with "Job timeout - exceeded 10 minutes"
  for the past 2+ hours. The cron function triggers sync with a 2-hour lookback
  window, which returns too many pages from the LiveChat API for Benja, causing
  the Edge Function to exceed its 10-minute execution limit.

  MarkBia (60 successful jobs in 2 hours) handles the 2-hour window fine, but
  Benja's LiveChat server is slower or returns more pages.

  ## Fix
  Reduce the lookback window in cron_sync_all_brands() from 2 hours to 30 minutes.
  Since the cron runs every 2 minutes, a 30-minute overlap is more than sufficient
  to ensure no chats are missed while keeping each job well within the time limit.

  ## Changes
  - cron_sync_all_brands(): start_time changed from now() - 2 hours to now() - 30 minutes
*/

CREATE OR REPLACE FUNCTION cron_sync_all_brands()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  brand_record RECORD;
  start_date_param text;
  end_date_param text;
  start_time timestamptz;
  end_time timestamptz;
  base_url text;
  auth_token text;
  full_url text;
  synced_count integer := 0;
BEGIN
  end_time := now();
  start_time := now() - interval '30 minutes';

  start_date_param := to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end_date_param := to_char(end_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  SELECT edge_function_base_url, edge_function_auth_token
  INTO base_url, auth_token
  FROM system_config
  WHERE id = 1;

  IF base_url IS NULL THEN
    RAISE NOTICE 'system_config not configured, skipping all brand syncs';
    RETURN;
  END IF;

  FOR brand_record IN
    SELECT id, name
    FROM brands
    WHERE is_active = true
      AND livechat_api_key IS NOT NULL
      AND livechat_api_key != ''
    ORDER BY name
  LOOP
    full_url := base_url || '/sync-livechat'
      || '?brand_id=' || brand_record.id::text
      || '&start_date=' || start_date_param
      || '&end_date=' || end_date_param;

    PERFORM net.http_get(
      url := full_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || auth_token,
        'Content-Type', 'application/json'
      )
    );

    synced_count := synced_count + 1;
    RAISE NOTICE 'Triggered sync for brand: % (%)', brand_record.name, brand_record.id;
  END LOOP;

  RAISE NOTICE 'cron_sync_all_brands completed: % brands triggered', synced_count;
END;
$$;
