
/*
  # Fix Cron Chunk Size for Medium Gaps

  ## Problem
  When a brand's last_sync_at falls behind by several hours (but less than 24h),
  the cron uses 5-minute chunks. This means a 9-hour gap requires:
  - 9h × 60min / 5min = 108 runs
  - At 2min intervals = 216 real-time minutes (~3.5 hours) to catch up

  ## Fix
  Add a medium-gap tier using 30-minute chunks:
  - Gap > 24h  → 1-day chunks   (historical catch-up)
  - Gap > 1h   → 30-min chunks  (medium catch-up: 9h gap clears in 18 runs = 36 min)
  - Gap ≤ 1h   → 5-min chunks   (live mode, accurate near-real-time)

  ## Safety
  Even with 30-min chunks, Dil (~15 chats/hour → ~7 chats/30min) is well within
  the 500-chat page limit. High-traffic brands (Benja/MarkBia) are always up to
  date so they use 5-min chunks anyway.
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
    -- gap > 24 hours → 1-day chunks   (historical catch-up, safe for all brands)
    -- gap > 1 hour   → 30-min chunks  (medium catch-up: ~18 runs to close a 9h gap)
    -- gap ≤ 1 hour   → 5-min chunks   (live mode for accurate near-real-time)
    gap_seconds := EXTRACT(EPOCH FROM (end_time - start_time));
    IF gap_seconds > 86400 THEN
      chunk_interval := interval '1 day';
    ELSIF gap_seconds > 3600 THEN
      chunk_interval := interval '30 minutes';
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
