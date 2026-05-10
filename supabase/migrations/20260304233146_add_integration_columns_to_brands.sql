/*
  # Add integration configuration columns to brands table

  ## Changes
  - Adds the following columns to `brands`:
    - `livechat_api_key` (text) – LiveChat API key for this brand
    - `claude_api_key` (text) – Claude / Anthropic API key for AI analysis
    - `telegram_alert_bot_token` (text) – Telegram bot token for alert notifications
    - `telegram_alert_chat_id` (text) – Telegram chat/channel ID for alerts
    - `telegram_callback_bot_token` (text) – Telegram bot token for callback queue
    - `telegram_callback_chat_id` (text) – Telegram chat/channel ID for callbacks
    - `polling_interval` (integer, default 5) – Sync interval in minutes
    - `is_system` (boolean, default false) – Marks the built-in system brand
    - `is_default` (boolean, default false) – Marks the currently active default brand

  ## Data Migration
  Copies the existing LiveChat / Claude / Telegram / polling config from the
  `settings` table into the Default Brand row so nothing is lost.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'livechat_api_key') THEN
    ALTER TABLE brands ADD COLUMN livechat_api_key text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'claude_api_key') THEN
    ALTER TABLE brands ADD COLUMN claude_api_key text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'telegram_alert_bot_token') THEN
    ALTER TABLE brands ADD COLUMN telegram_alert_bot_token text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'telegram_alert_chat_id') THEN
    ALTER TABLE brands ADD COLUMN telegram_alert_chat_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'telegram_callback_bot_token') THEN
    ALTER TABLE brands ADD COLUMN telegram_callback_bot_token text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'telegram_callback_chat_id') THEN
    ALTER TABLE brands ADD COLUMN telegram_callback_chat_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'polling_interval') THEN
    ALTER TABLE brands ADD COLUMN polling_interval integer DEFAULT 5;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'is_system') THEN
    ALTER TABLE brands ADD COLUMN is_system boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'is_default') THEN
    ALTER TABLE brands ADD COLUMN is_default boolean DEFAULT false;
  END IF;
END $$;

UPDATE brands b
SET
  livechat_api_key           = s.livechat_api_key,
  claude_api_key             = s.claude_api_key,
  telegram_alert_bot_token   = s.telegram_bot_token,
  telegram_alert_chat_id     = s.telegram_chat_id,
  polling_interval           = COALESCE(s.polling_interval, 5),
  is_default                 = true,
  is_system                  = true
FROM settings s
WHERE b.slug = 'default'
  AND s.brand_id IS NULL;
