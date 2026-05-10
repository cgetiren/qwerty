/*
  Fix: Cron sync must work with APIs that send Istanbul time as UTC.

  Problem: last_sync_at was set to now() or endDate after sync.
  But if the API sends Istanbul timestamps as UTC (e.g., Istanbul 11:34
  stored as 08:34Z), then last_sync_at=now()=10:14Z means we skip
  chats with created_at=09:00Z because 09:00 < 10:14.

  The Edge Function fix handles last_sync_at advancement based on
  newestChatDate instead of now(). This cron fix ensures we always
  scan a reasonable window and never skip due to timezone mismatch.
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

    -- Always scan at least last 60 minutes to catch delayed API chats
    -- LiveChat API can delay chat visibility by 10-60 minutes
    IF brand_record.last_sync_at IS NOT NULL THEN
      start_time := LEAST(brand_record.last_sync_at, end_time - interval '60 minutes');
    ELSE
      start_time := end_time - interval '10 minutes';
    END IF;

    gap_seconds := EXTRACT(EPOCH FROM (end_time - start_time));

    IF gap_seconds > 7200 THEN
      chunk_end_time := LEAST(end_time, start_time + interval '30 minutes');
      RAISE NOTICE 'Brand % is far behind (% min) — 30-min chunk', brand_record.name, round(gap_seconds/60);
    ELSIF gap_seconds > 1800 THEN
      chunk_end_time := LEAST(end_time, start_time + interval '15 minutes');
      RAISE NOTICE 'Brand % is moderately behind (% min) — 15-min chunk', brand_record.name, round(gap_seconds/60);
    ELSIF gap_seconds > 300 THEN
      chunk_end_time := LEAST(end_time, start_time + interval '5 minutes');
    ELSE
      chunk_end_time := end_time;
      RAISE NOTICE 'Brand % is current — syncing % to %', brand_record.name, start_time, end_time;
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
    RAISE NOTICE 'Triggered sync for brand: % — window: % to %',
      brand_record.name, start_date_param, end_date_param;
  END LOOP;

  RAISE NOTICE 'cron_sync_all_brands completed: % triggered, % skipped (active)',
    synced_count, skipped_active;
END;
$$;
