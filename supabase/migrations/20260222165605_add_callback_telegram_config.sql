/*
  # Add Callback-Specific Telegram Configuration

  Adds two new columns to system_config so the callback queue can send
  alerts to a separate Telegram bot/channel, independent of the main bot.

  1. Changes
    - `callback_telegram_bot_token` (text, nullable) - Bot token for callback alerts
    - `callback_telegram_chat_id` (text, nullable) - Chat/channel ID for callback alerts

  2. Notes
    - If both columns are set, detect-callbacks uses them instead of the main bot
    - Falls back to the main bot if not configured
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_config' AND column_name = 'callback_telegram_bot_token'
  ) THEN
    ALTER TABLE system_config ADD COLUMN callback_telegram_bot_token text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_config' AND column_name = 'callback_telegram_chat_id'
  ) THEN
    ALTER TABLE system_config ADD COLUMN callback_telegram_chat_id text DEFAULT NULL;
  END IF;
END $$;
