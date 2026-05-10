/*
  # Adaptive Chunk Size for cron_sync_all_brands

  ## Problem
  The cron synced 500 chats for Dil on first run (5 pages × 100), then set
  last_sync_at to today. Subsequent runs only checked the last 5 minutes,
  finding no new data. The remaining 2000+ historical chats are unreachable
  because the gap was > 24 hours and the 5-minute chunk never goes backward.

  ## Fix
  Make the chunk window adaptive based on how far behind last_sync_at is:

  - Gap > 24 hours → 6-hour chunk (historical catch-up mode)
    - Dil at ~30 chats/hour × 6 hours = ~180 chats → well within 500 limit
    - 2 months of history caught up in ~240 cron runs (~40 hours at 10-min cron)
  - Gap ≤ 24 hours → 5-minute chunk (live mode, safe for high-traffic brands)

  ## Changes
  - cron_sync_all_brands(): adaptive chunk_interval based on gap size
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
  chunk_interval interval;
  gap_seconds numeric;
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

    -- Adaptive chunk size:
    -- gap > 24 hours → 6-hour chunks (historical catch-up, safe for low-traffic brands)
    -- gap ≤ 24 hours → 5-minute chunks (live mode, safe for high-traffic brands)
    gap_seconds := EXTRACT(EPOCH FROM (end_time - start_time));
    IF gap_seconds > 86400 THEN
      chunk_interval := interval '6 hours';
    ELSE
      chunk_interval := interval '5 minutes';
    END IF;

    chunk_end_time := LEAST(end_time, start_time + chunk_interval);

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
    RAISE NOTICE 'Triggered sync for brand: % (%) - window: % to % (chunk: %)',
      brand_record.name,
      brand_record.id,
      start_date_param,
      end_date_param,
      chunk_interval;
  END LOOP;

  RAISE NOTICE 'cron_sync_all_brands completed: % triggered, % skipped (active), % skipped (current)',
    synced_count, skipped_active, skipped_current;
END;
$$;
