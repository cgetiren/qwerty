/*
  # MarkBia LiveChat Integration Setup

  ## Summary
  Configures the LiveChat API integration for the MarkBia brand.

  ## Changes

  ### 1. brands table
  - Sets `livechat_api_key` for MarkBia brand

  ### 2. settings table
  - Creates a new settings row for MarkBia with the LiveChat API key
  - Inherits telegram settings from default brand (can be updated later)

  ### 3. New cron function: cron_sync_markbia()
  - Syncs the last 2 hours of LiveChat data for MarkBia
  - Calls sync-livechat edge function with brand_id parameter

  ### 4. New cron job: server-sync-markbia
  - Runs every 2 minutes, same frequency as Marka Benja sync
*/

-- ============================================================
-- 1. SET LIVECHAT API KEY ON MARKBIA BRAND RECORD
-- ============================================================
UPDATE brands
SET livechat_api_key = 's--i6eqeSYx-3SH9V_XWZ-PkDTTt08zCZCyn5ZdlC94'
WHERE id = 'c1fbe05a-a1f0-4811-af59-6aa8c79032ba';

-- ============================================================
-- 2. CREATE SETTINGS ROW FOR MARKBIA
-- ============================================================
INSERT INTO settings (brand_id, livechat_api_key, polling_interval)
VALUES (
  'c1fbe05a-a1f0-4811-af59-6aa8c79032ba',
  's--i6eqeSYx-3SH9V_XWZ-PkDTTt08zCZCyn5ZdlC94',
  60
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. CREATE CRON FUNCTION FOR MARKBIA SYNC
-- ============================================================
CREATE OR REPLACE FUNCTION cron_sync_markbia()
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
    RAISE NOTICE 'system_config not configured, skipping MarkBia sync';
    RETURN;
  END IF;

  full_url := base_url || '/sync-livechat'
    || '?brand_id=c1fbe05a-a1f0-4811-af59-6aa8c79032ba'
    || '&start_date=' || start_date_param
    || '&end_date=' || end_date_param;

  PERFORM net.http_get(
    url := full_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || auth_token,
      'Content-Type', 'application/json'
    )
  );

  RAISE NOTICE 'MarkBia sync triggered: % to %', start_date_param, end_date_param;
END;
$$;

-- ============================================================
-- 4. ADD CRON JOB FOR MARKBIA SYNC (every 2 minutes)
-- ============================================================
SELECT cron.schedule(
  'server-sync-markbia',
  '*/2 * * * *',
  'SELECT cron_sync_markbia()'
);
