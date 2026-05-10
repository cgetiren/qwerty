/*
  # Replace Per-Brand Cron Functions with Universal cron_sync_all_brands()

  ## Summary
  Removes hardcoded per-brand cron functions (cron_sync_livechat, cron_sync_markbia)
  and replaces them with a single generic function that automatically loops through
  ALL active brands that have a livechat_api_key configured.

  ## Changes

  ### Removed
  - cron job: server-sync-livechat (hardcoded Marka Benja only)
  - cron job: server-sync-markbia (hardcoded MarkBia only)
  - function: cron_sync_livechat() (hardcoded brand ID)
  - function: cron_sync_markbia() (hardcoded brand ID)

  ### Added
  - function: cron_sync_all_brands() — queries brands table, loops through all
    active brands with livechat_api_key set, triggers sync-livechat for each
  - cron job: server-sync-all-brands (every 2 minutes)

  ## How It Works
  When a new brand is added with a livechat_api_key, the next cron run (max 2 min)
  will automatically pick it up and start syncing — no SQL migration required.

  ## Important Notes
  1. The brands table must have livechat_api_key populated for a brand to be synced
  2. The brand must have is_active = true
  3. The cron interval remains 2 minutes (same as before)
*/

-- ============================================================
-- 1. REMOVE OLD PER-BRAND CRON JOBS
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'server-sync-livechat') THEN
    PERFORM cron.unschedule('server-sync-livechat');
    RAISE NOTICE 'Unscheduled: server-sync-livechat';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'server-sync-markbia') THEN
    PERFORM cron.unschedule('server-sync-markbia');
    RAISE NOTICE 'Unscheduled: server-sync-markbia';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'server-sync-all-brands') THEN
    PERFORM cron.unschedule('server-sync-all-brands');
    RAISE NOTICE 'Unscheduled existing: server-sync-all-brands';
  END IF;
END $$;

-- ============================================================
-- 2. DROP OLD PER-BRAND CRON FUNCTIONS
-- ============================================================
DROP FUNCTION IF EXISTS cron_sync_livechat();
DROP FUNCTION IF EXISTS cron_sync_markbia();

-- ============================================================
-- 3. CREATE UNIVERSAL cron_sync_all_brands() FUNCTION
-- ============================================================
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

-- ============================================================
-- 4. SCHEDULE THE UNIVERSAL CRON JOB (every 2 minutes)
-- ============================================================
SELECT cron.schedule(
  'server-sync-all-brands',
  '*/2 * * * *',
  'SELECT cron_sync_all_brands()'
);
