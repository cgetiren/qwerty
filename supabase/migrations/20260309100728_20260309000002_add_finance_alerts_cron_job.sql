/*
  # Add Finance Alerts Cron Job

  Schedules the send-finance-alerts edge function to run every 2 minutes.
  This will automatically check for low-scoring finance-related chat analyses
  and send notifications to the configured finance team Telegram groups.
*/

SELECT cron.schedule(
  'server-send-finance-alerts',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT edge_function_base_url FROM system_config LIMIT 1) || '/send-finance-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT edge_function_auth_token FROM system_config LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'server-send-finance-alerts'
);
