/*
  # Add authenticated user read policies

  1. Changes
    - Add SELECT policies for `authenticated` role on all main tables
    - Tables affected: chats, chat_messages, chat_analysis, personnel, personnel_daily_stats, alerts, settings

  2. Security
    - Authenticated users can read all data from these tables
    - This mirrors the existing anon read access but for logged-in users
*/

CREATE POLICY "Authenticated read access to chats"
  ON chats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read access to chat_messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read access to chat_analysis"
  ON chat_analysis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read access to personnel"
  ON personnel FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read access to personnel_daily_stats"
  ON personnel_daily_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read access to alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated read access to settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);
