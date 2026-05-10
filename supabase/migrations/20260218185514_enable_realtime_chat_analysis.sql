/*
  # Enable Realtime for chat_analysis table

  Adds chat_analysis to the supabase_realtime publication so that
  CoachingCenter can subscribe to live changes and auto-refresh
  when analyses are created or updated.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'chat_analysis'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_analysis;
  END IF;
END $$;
