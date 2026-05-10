/*
  Fix: Cron trailing window was skipping chats between last_sync_at and now-20min.

  Problem: When gap < 5min, cron used a fixed "last 20 minutes" window
  (end_time - 20min → end_time). If a brand had no chats for 3 hours overnight,
  last_sync_at kept advancing but chats from 05:00-07:40 were never fetched
  because the 20-min window only covered 07:40-08:00.

  Fix: Always start from last_sync_at, use trailing window only to extend
  the end time slightly beyond now to catch delayed API chats.
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
  chunk_minutes numeric;
  start_date_param text;
  end_date_param text;
  base_url text;
  auth_token text;
  full_url text;
  synced_count integer := 0;
  skipped_active integer := 0;
  skipped_current integer := 0;
  has_active_job boolean;
  gap_seconds numeric;
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

    gap_seconds := EXTRACT(EPOCH FROM (end_time - start_time));

    IF gap_seconds < 30 THEN
      skipped_current := skipped_current + 1;
      RAISE NOTICE 'Skipping % - already up to date (last sync: %)', brand_record.name, brand_record.last_sync_at;
      CONTINUE;
    END IF;

    -- Always start from last_sync_at to avoid gaps
    -- Chunk size varies based on how far behind we are
    IF gap_seconds > 7200 THEN
      -- More than 2 hours behind: use 30-minute chunks to catch up fast
      chunk_minutes := 30;
      chunk_end_time := LEAST(end_time, start_time + (chunk_minutes || ' minutes')::interval);
      RAISE NOTICE 'Brand % is far behind (% min) — using 30-min chunk', brand_record.name, round(gap_seconds/60);
    ELSIF gap_seconds > 1800 THEN
      -- 30 min to 2 hours behind: use 15-minute chunks
      chunk_minutes := 15;
      chunk_end_time := LEAST(end_time, start_time + (chunk_minutes || ' minutes')::interval);
      RAISE NOTICE 'Brand % is moderately behind (% min) — using 15-min chunk', brand_record.name, round(gap_seconds/60);
    ELSIF gap_seconds > 300 THEN
      -- 5-30 min behind: use 5-minute chunks
      chunk_minutes := 5;
      chunk_end_time := LEAST(end_time, start_time + (chunk_minutes || ' minutes')::interval);
    ELSE
      -- Brand is current (gap < 5 min): scan from last_sync_at to now
      -- This ensures no chats are missed between last_sync_at and now
      chunk_end_time := end_time;
      chunk_minutes := round(gap_seconds / 60.0);
      RAISE NOTICE 'Brand % is current — syncing from last_sync_at to now (% sec gap)', brand_record.name, round(gap_seconds);
    END IF;

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
      round(EXTRACT(EPOCH FROM (chunk_end_time - start_time)) / 60);
  END LOOP;

  RAISE NOTICE 'cron_sync_all_brands completed: % triggered, % skipped (active), % skipped (current)',
    synced_count, skipped_active, skipped_current;
END;
$$;
