/*
  # Add Finance Telegram Bot Support

  ## Summary
  Adds dedicated Telegram bot fields for finance team notifications.
  When a chat analysis scores below 70 and its topic is finance-related,
  the system sends a notification to a separate finance team Telegram group.

  ## Changes

  ### brands table
  - `telegram_finance_bot_token` - Bot token for finance group notifications
  - `telegram_finance_chat_id` - Telegram group chat ID for finance team

  ### chat_analysis table
  - `finance_telegram_sent` (boolean, default false) - Tracks whether this analysis
    has already been sent to the finance group, preventing duplicate messages

  ### Data
  - Sets BIA brand (MarkBia) finance bot token to the provided token
  - finance_telegram_chat_id remains NULL until admin configures the group ID
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'telegram_finance_bot_token'
  ) THEN
    ALTER TABLE brands ADD COLUMN telegram_finance_bot_token text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'telegram_finance_chat_id'
  ) THEN
    ALTER TABLE brands ADD COLUMN telegram_finance_chat_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'finance_telegram_sent'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN finance_telegram_sent boolean DEFAULT false;
  END IF;
END $$;

UPDATE brands
SET telegram_finance_bot_token = '8709782092:AAH4G2rRjnC4c5qELSoA44_hvWrcXxEdG7U'
WHERE id = 'c1fbe05a-a1f0-4811-af59-6aa8c79032ba'
  AND (telegram_finance_bot_token IS NULL OR telegram_finance_bot_token = '');
