/*
  # Fix Cron Sync: Chunking + last_sync_at + Skip Active Jobs

  ## Problem
  Marka Benja sync jobs have been timing out (Job timeout - exceeded 10 minutes).
  The cron was passing a 30-minute window, but Benja's LiveChat API returns too
  many pages for a single Edge Function execution to handle within 10 minutes.

  ## Fix
  Replace the fixed 30-minute lookback window with a smart chunking approach:

  1. **Skip active jobs**: If a brand already has a "processing" sync job, skip it
     entirely. This prevents job pile-ups when a brand is slow.

  2. **Use last_sync_at as start**: Use the brand's last successful sync time as
     the start of the next window. This ensures no data is missed and no data is
     double-fetched unnecessarily.

  3. **Cap each chunk at 5 minutes**: If the gap since last_sync_at is larger than
     5 minutes, only sync the first 5 minutes. The cron runs every 2 minutes, so
     successive runs will fill in the remaining chunks automatically.
     - Example: 3 hours of backlog → 36 chunks × 5 min, one chunk every 2 min
       → fully caught up in ~72 minutes without any single job timing out.

  4. **Minimum gap check**: Don't trigger a sync if there's less than 30 seconds
     of new data to fetch.

  ## Changes
  - cron_sync_all_brands(): Complete rewrite with chunking logic
*/

CREATE OR REPLACE FUNCTION cron_sync_all_brands()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  brand_record RECORD;
  start_time timestamptz;
  end_time timestamptz;
  chunk_end_time timestamptz;
  start_date_param text;
  end_date_param text;
  base_url text;
  auth_token text;
  full_url text;
  synced_count integer := 0;
  skipped_active integer := 0;
  skipped_current integer := 0;
  has_active_job boolean;
BEGIN
  SELECT edge_function_base_url, edge_function_auth_token
  INTO base_url, auth_token
  FROM system_config
  WHERE id = 1;

  IF base_url IS NULL THEN
    RAISE NOTICE 'system_config not configured, skipping all brand syncs';
    RETURN;
  END IF;

  end_time := now();

  FOR brand_record IN
    SELECT id, name, last_sync_at
    FROM brands
    WHERE is_active = true
      AND livechat_api_key IS NOT NULL
      AND livechat_api_key != ''
    ORDER BY name
  LOOP
    -- Check if a sync job is already processing for this brand
    SELECT EXISTS (
      SELECT 1 FROM sync_jobs
      WHERE brand_id = brand_record.id
        AND status = 'processing'
        AND started_at > now() - interval '10 minutes'
    ) INTO has_active_job;

    IF has_active_job THEN
      skipped_active := skipped_active + 1;
      RAISE NOTICE 'Skipping % - sync job already running', brand_record.name;
      CONTINUE;
    END IF;

    -- Determine start time: use last_sync_at or fall back to 10 minutes ago
    IF brand_record.last_sync_at IS NOT NULL THEN
      start_time := brand_record.last_sync_at;
    ELSE
      start_time := end_time - interval '10 minutes';
    END IF;

    -- Don't sync if less than 30 seconds of new data
    IF start_time >= end_time - interval '30 seconds' THEN
      skipped_current := skipped_current + 1;
      RAISE NOTICE 'Skipping % - already up to date (last sync: %)', brand_record.name, brand_record.last_sync_at;
      CONTINUE;
    END IF;

    -- Cap chunk at 5 minutes to prevent timeout
    chunk_end_time := LEAST(end_time, start_time + interval '5 minutes');

    start_date_param := to_char(start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end_date_param := to_char(chunk_end_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

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
    RAISE NOTICE 'Triggered sync for brand: % (%) - window: % to % (% min)',
      brand_record.name,
      brand_record.id,
      start_date_param,
      end_date_param,
      EXTRACT(EPOCH FROM (chunk_end_time - start_time)) / 60;
  END LOOP;

  RAISE NOTICE 'cron_sync_all_brands completed: % triggered, % skipped (active), % skipped (current)',
    synced_count, skipped_active, skipped_current;
END;
$$;
