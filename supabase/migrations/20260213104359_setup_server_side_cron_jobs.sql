/*
  # Setup Server-Side Cron Jobs for Automatic Sync

  1. New Tables
    - `system_config` - stores edge function base URL and auth token for cron jobs
      - `id` (integer, primary key)
      - `edge_function_base_url` (text) - Supabase project URL + /functions/v1
      - `edge_function_auth_token` (text) - Supabase anon key for authorization
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. New Functions
    - `invoke_edge_function(func_name text)` - helper to call edge functions via pg_net
    - `cron_sync_livechat()` - wrapper for sync-livechat cron
    - `cron_analyze_chats()` - wrapper for analyze-chat cron
    - `cron_send_telegram_alerts()` - wrapper for send-telegram-alerts cron

  3. Cron Jobs
    - `server-sync-livechat` - runs every 2 minutes to sync LiveChat data
    - `server-analyze-chats` - runs every 5 minutes to analyze unanalyzed chats
    - `server-send-telegram-alerts` - runs every 5 minutes to send pending alerts

  4. Security
    - RLS enabled on system_config
    - Only service_role can read/write system_config
    - Authenticated users can read system_config

  5. Notes
    - These cron jobs run server-side, independent of browser/frontend
    - Uses pg_net extension to make HTTP requests to edge functions
    - Uses pg_cron extension for scheduling
*/

CREATE TABLE IF NOT EXISTS system_config (
  id integer PRIMARY KEY DEFAULT 1,
  edge_function_base_url text NOT NULL,
  edge_function_auth_token text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to system_config"
  ON system_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read system_config"
  ON system_config FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION invoke_edge_function(func_name text, query_params text DEFAULT '')
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  base_url text;
  auth_token text;
  full_url text;
  request_id bigint;
BEGIN
  SELECT edge_function_base_url, edge_function_auth_token
  INTO base_url, auth_token
  FROM system_config
  WHERE id = 1;

  IF base_url IS NULL THEN
    RAISE NOTICE 'system_config not configured';
    RETURN NULL;
  END IF;

  full_url := base_url || '/' || func_name;
  IF query_params != '' THEN
    full_url := full_url || '?' || query_params;
  END IF;

  SELECT net.http_get(
    url := full_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || auth_token,
      'Content-Type', 'application/json'
    )
  ) INTO request_id;

  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION cron_sync_livechat()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM invoke_edge_function('sync-livechat', 'days=1');
END;
$$;

CREATE OR REPLACE FUNCTION cron_analyze_chats()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  unanalyzed_count integer;
BEGIN
  SELECT count(*) INTO unanalyzed_count
  FROM chats
  WHERE analyzed = false;

  IF unanalyzed_count > 0 THEN
    PERFORM invoke_edge_function('analyze-chat');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION cron_send_telegram_alerts()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  pending_count integer;
BEGIN
  SELECT count(*) INTO pending_count
  FROM alerts
  WHERE sent_to_telegram = false;

  IF pending_count > 0 THEN
    PERFORM invoke_edge_function('send-telegram-alerts');
  END IF;
END;
$$;

SELECT cron.schedule(
  'server-sync-livechat',
  '*/2 * * * *',
  $$SELECT cron_sync_livechat()$$
);

SELECT cron.schedule(
  'server-analyze-chats',
  '*/5 * * * *',
  $$SELECT cron_analyze_chats()$$
);

SELECT cron.schedule(
  'server-send-telegram-alerts',
  '*/5 * * * *',
  $$SELECT cron_send_telegram_alerts()$$
);
