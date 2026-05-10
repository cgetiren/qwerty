/*
  # Remove anonymous read access - require authentication for all tables

  Security hardening: Previously, anonymous (unauthenticated) users could
  read data from 7 tables using only the public anon key. This migration
  removes all anon read policies so that only authenticated users can
  access any data.

  ## Policies Removed (anon role)
  - alerts: "Anon read access to alerts"
  - chat_analysis: "Anon read access to chat_analysis"
  - chat_messages: "Anon read access to chat_messages"
  - chats: "Anon read access to chats"
  - personnel: "Anon read access to personnel"
  - personnel_daily_stats: "Anon read access to personnel_daily_stats"
  - settings: "Anon read access to settings"

  ## Result
  All data now requires a valid Supabase auth session to access.
  Edge functions using service_role key are unaffected.
*/

DROP POLICY IF EXISTS "Anon read access to alerts" ON alerts;
DROP POLICY IF EXISTS "Anon read access to chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Anon read access to chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Anon read access to chats" ON chats;
DROP POLICY IF EXISTS "Anon read access to personnel" ON personnel;
DROP POLICY IF EXISTS "Anon read access to personnel_daily_stats" ON personnel_daily_stats;
DROP POLICY IF EXISTS "Anon read access to settings" ON settings;
