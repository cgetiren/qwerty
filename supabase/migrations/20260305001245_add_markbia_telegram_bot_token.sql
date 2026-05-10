/*
  # Add MarkBia Telegram Bot Token

  Updates MarkBia's settings with the Telegram bot token.
  The telegram_chat_id will be auto-configured when the bot receives its first message.
*/

UPDATE settings
SET telegram_bot_token = '8717733515:AAGR4yFob5wntD_gP4yQV48XCP2046n4VGs'
WHERE brand_id = 'c1fbe05a-a1f0-4811-af59-6aa8c79032ba';
