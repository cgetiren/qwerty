/*
  # Add Trailing Window to Cron Sync

  ## Problem
  Chats that appear in the LiveChat API with a delay (API indexing lag) get missed.
  When the cron advances `last_sync_at` past a time window and a chat later appears
  in that window, it is never fetched.

  ## Fix
  When a brand is "current" (gap between last_sync_at and now is less than 5 minutes),
  the cron now always looks back an extra 20 minutes before the last_sync_at. This
  creates a rolling overlap window that catches any delayed chats without risk of
  data loss (upsert handles duplicates safely).

  For brands that are catching up (large gap), behavior is unchanged - they process
  forward in chunks.
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

    -- When the brand is current (gap < 5 min), always re-check the last 20 minutes
    -- to catch chats that were delayed in the LiveChat API index.
    -- For catching-up brands, use normal forward chunk logic.
    IF gap_seconds < 300 THEN
      start_time := end_time - interval '20 minutes';
      chunk_end_time := end_time;
      RAISE NOTICE 'Brand % is current — using trailing window: last 20 minutes', brand_record.name;
    ELSE
      -- Cap chunk at 5 minutes when catching up to prevent timeout
      chunk_end_time := LEAST(end_time, start_time + interval '5 minutes');
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
      EXTRACT(EPOCH FROM (chunk_end_time - start_time)) / 60;
  END LOOP;

  RAISE NOTICE 'cron_sync_all_brands completed: % triggered, % skipped (active), % skipped (current)',
    synced_count, skipped_active, skipped_current;
END;
$$;
