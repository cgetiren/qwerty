/*
  # Add Detect Callbacks Cron Job

  Adds an automatic cron job that runs every 2 minutes to detect
  callback requests in chats and send Telegram notifications.
  Previously this had to be triggered manually.
*/

SELECT cron.schedule(
  'server-detect-callbacks',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT edge_function_base_url FROM system_config LIMIT 1) || '/detect-callbacks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT edge_function_auth_token FROM system_config LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'server-detect-callbacks'
);
