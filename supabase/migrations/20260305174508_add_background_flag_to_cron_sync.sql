/*
  # Add background=true to cron_sync_all_brands()

  ## Problem
  The universal cron calls sync-livechat WITHOUT background=true, meaning the edge
  function runs SYNCHRONOUSLY and must return a response before pg_net times out.
  If the LiveChat API is slow, the function gets stuck and killed mid-execution.

  ## Fix
  Add &background=true to the URL built by cron_sync_all_brands(). This makes the
  edge function:
  1. Create the job
  2. Launch the work via EdgeRuntime.waitUntil() (background)
  3. Return a fast 200 response IMMEDIATELY to pg_net
  4. Work continues in background until Supabase wall-clock limit

  This prevents pg_net from timing out and ensures jobs always get a proper
  status update (completed or failed) rather than hanging as "processing".

  ## Changes
  - Recreates cron_sync_all_brands() with &background=true in the URL
  - Reschedules the cron job (same interval: every 2 minutes)
*/

-- Drop and recreate with background=true
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
  start_time := now() - interval '2 hours';

  start_date_param := to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end_date_param   := to_char(end_time,   'YYYY-MM-DD"T"HH24:MI:SS"Z"');

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
      || '?brand_id='    || brand_record.id::text
      || '&start_date='  || start_date_param
      || '&end_date='    || end_date_param
      || '&background=true';

    PERFORM net.http_get(
      url     := full_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || auth_token,
        'Content-Type',  'application/json'
      )
    );

    synced_count := synced_count + 1;
    RAISE NOTICE 'Triggered background sync for brand: % (%)', brand_record.name, brand_record.id;
  END LOOP;

  RAISE NOTICE 'cron_sync_all_brands completed: % brands triggered', synced_count;
END;
$$;
