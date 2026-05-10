/*
  # Enable pg_cron and pg_net for automatic scheduling

  ## Extensions
  - `pg_cron` - Job scheduler for PostgreSQL
  - `pg_net` - Async HTTP client for making edge function calls from database

  ## Cron Job
  - Runs the sync-livechat pipeline every 1 minute
  - Automatically syncs chats, analyzes new ones, and sends Telegram alerts
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'livechat-pipeline',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-livechat',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
    )
  );
  $$
);