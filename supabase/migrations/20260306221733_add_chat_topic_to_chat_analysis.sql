/*
  # Add chat_topic to chat_analysis

  ## Summary
  Adds a `chat_topic` text column to the `chat_analysis` table so that
  the AI can identify and store what the conversation was about
  (e.g. "Para yatırma gecikmesi", "Bonus talebinin karşılanmaması").

  ## Changes
  - `chat_analysis` table: new nullable `chat_topic` column

  ## Notes
  - No destructive changes; existing rows will have NULL topic (graceful fallback)
  - Telegram alerts will show the topic only when it is populated (new analyses)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'chat_topic'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN chat_topic text;
  END IF;
END $$;
