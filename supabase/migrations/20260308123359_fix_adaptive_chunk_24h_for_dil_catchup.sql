/*
  # Fix Adaptive Chunk Size: 1-day chunks for historical gaps

  ## Problem
  Previous fix used 6-hour chunks for gaps > 24 hours. With last_sync_at
  reset to 2026-01-01 (67 days back), that requires 268 cron runs = ~44 hours.

  ## Analysis
  Dil brand has ~15 chats/hour. Over 24 hours = ~360 chats, well within the
  500-chat page limit per run. Using 1-day chunks is safe for Dil.

  last_sync_at was reset to 2026-03-01, so only 7 days to catch up:
  - 7 chunks × 1 day = 7 cron runs × 10 min = ~70 minutes to full catch-up

  ## Fix
  - Gap > 24 hours → 1-day chunks (historical catch-up mode)
  - Gap ≤ 24 hours → 5-minute chunks (live mode, safe for high-traffic brands)
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

    IF brand_record.last_sync_at IS NOT NULL THEN
      start_time := brand_record.last_sync_at;
    ELSE
      start_time := end_time - interval '10 minutes';
    END IF;

    IF start_time >= end_time - interval '30 seconds' THEN
      skipped_current := skipped_current + 1;
      RAISE NOTICE 'Skipping % - already up to date (last sync: %)', brand_record.name, brand_record.last_sync_at;
      CONTINUE;
    END IF;

    -- Adaptive chunk size:
    -- gap > 24 hours → 1-day chunks (safe for Dil at ~360 chats/day, within 500 limit)
    -- gap ≤ 24 hours → 5-minute chunks (live mode, safe for high-traffic brands like Benja)
    gap_seconds := EXTRACT(EPOCH FROM (end_time - start_time));
    IF gap_seconds > 86400 THEN
      chunk_interval := interval '1 day';
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
