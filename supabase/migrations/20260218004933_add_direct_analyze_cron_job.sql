
/*
  # Add direct HTTP cron job for analyze-chat

  Adds a direct net.http_get cron job for analyze-chat, similar to livechat-pipeline.
  Runs every 2 minutes to clear the backlog faster.
  Also drops the old SQL-function-based analyze cron that was unreliable.
*/

SELECT cron.unschedule('server-analyze-chats');

SELECT cron.schedule(
  'analyze-chats-direct',
  '*/2 * * * *',
  $$
  SELECT net.http_get(
    url := (SELECT edge_function_base_url FROM system_config WHERE id = 1) || '/analyze-chat',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT edge_function_auth_token FROM system_config WHERE id = 1),
      'Content-Type', 'application/json'
    )
  );
  $$
);
