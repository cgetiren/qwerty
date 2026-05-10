/*
  # Fix cron_sync_livechat to pass Marka Benja brand_id

  ## Problem
  The old `cron_sync_livechat` function called sync-livechat without a brand_id,
  creating sync_jobs records with brand_id = NULL. These jobs would run but the
  sync-livechat function's running-job check was not brand-specific — so a stuck
  null-brand job would block MarkBia's sync from running, causing MarkBia to only
  sync once every 20-60 minutes instead of every 2 minutes.

  ## Fix
  Update `cron_sync_livechat` to pass Marka Benja's brand_id explicitly
  (00000000-0000-0000-0000-000000000001), so it behaves the same as `cron_sync_markbia`.
  This ensures jobs are brand-isolated and no longer interfere with each other.
*/

CREATE OR REPLACE FUNCTION cron_sync_livechat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_date_param text;
  end_date_param text;
  start_time timestamptz;
  end_time timestamptz;
  base_url text;
  auth_token text;
  full_url text;
BEGIN
  end_time := now();
  start_time := now() - interval '2 hours';

  start_date_param := to_char(start_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end_date_param := to_char(end_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  SELECT edge_function_base_url, edge_function_auth_token
  INTO base_url, auth_token
  FROM system_config
  WHERE id = 1;

  IF base_url IS NULL THEN
    RAISE NOTICE 'system_config not configured, skipping Marka Benja sync';
    RETURN;
  END IF;

  full_url := base_url || '/sync-livechat'
    || '?brand_id=00000000-0000-0000-0000-000000000001'
    || '&start_date=' || start_date_param
    || '&end_date=' || end_date_param;

  PERFORM net.http_get(
    url := full_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || auth_token,
      'Content-Type', 'application/json'
    )
  );

  RAISE NOTICE 'Marka Benja sync triggered: % to %', start_date_param, end_date_param;
END;
$$;
