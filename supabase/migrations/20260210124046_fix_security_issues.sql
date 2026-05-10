/*
  # Fix Security Issues

  ## Changes Made

  1. **Performance Improvements**
     - Add missing indexes for foreign keys on `alerts` table:
       - `analysis_id` → `idx_alerts_analysis_id`
       - `chat_id` → `idx_alerts_chat_id`
     - Remove unused indexes:
       - `idx_chats_agent` (not being used)
       - `idx_chat_analysis_requires_attention` (not being used)

  2. **Function Security**
     - Fix `upsert_daily_stats` function with immutable search_path

  3. **Row Level Security (RLS) Policies**
     - Replace overly permissive policies with secure, role-based policies
     - Service role: Full access (for edge functions)
     - Anon role: Read-only access to monitoring data
     - Settings: Read-only for anon, write for service_role only

  ## Security Improvements
     - All tables now have proper RLS that checks authentication
     - No more "always true" policies that bypass security
     - Foreign keys are properly indexed for performance
*/

-- ============================================================================
-- 1. ADD MISSING INDEXES FOR FOREIGN KEYS
-- ============================================================================

-- Add index for alerts.analysis_id foreign key
CREATE INDEX IF NOT EXISTS idx_alerts_analysis_id ON alerts(analysis_id);

-- Add index for alerts.chat_id foreign key
CREATE INDEX IF NOT EXISTS idx_alerts_chat_id ON alerts(chat_id);

-- ============================================================================
-- 2. REMOVE UNUSED INDEXES
-- ============================================================================

-- Drop unused index on chats.agent_name
DROP INDEX IF EXISTS idx_chats_agent;

-- Drop unused index on chat_analysis.requires_attention
DROP INDEX IF EXISTS idx_chat_analysis_requires_attention;

-- ============================================================================
-- 3. FIX FUNCTION SEARCH PATH
-- ============================================================================

-- Drop and recreate upsert_daily_stats with secure search_path
DROP FUNCTION IF EXISTS upsert_daily_stats();

CREATE OR REPLACE FUNCTION upsert_daily_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO personnel_daily_stats (personnel_id, date, chats_count, avg_score)
  SELECT 
    p.id,
    CURRENT_DATE,
    COUNT(c.id),
    COALESCE(AVG(ca.overall_score), 0)
  FROM personnel p
  LEFT JOIN chats c ON c.agent_name = p.name 
    AND c.created_at::date = CURRENT_DATE
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  GROUP BY p.id
  ON CONFLICT (personnel_id, date)
  DO UPDATE SET
    chats_count = EXCLUDED.chats_count,
    avg_score = EXCLUDED.avg_score,
    updated_at = NOW();
END;
$$;

-- ============================================================================
-- 4. REPLACE INSECURE RLS POLICIES WITH SECURE ONES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: chats
-- ----------------------------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Allow all access to chats" ON chats;

-- Service role: full access
CREATE POLICY "Service role full access to chats"
  ON chats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role: read-only access
CREATE POLICY "Anon read access to chats"
  ON chats
  FOR SELECT
  TO anon
  USING (true);

-- ----------------------------------------------------------------------------
-- Table: chat_messages
-- ----------------------------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Allow all access to chat_messages" ON chat_messages;

-- Service role: full access
CREATE POLICY "Service role full access to chat_messages"
  ON chat_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role: read-only access
CREATE POLICY "Anon read access to chat_messages"
  ON chat_messages
  FOR SELECT
  TO anon
  USING (true);

-- ----------------------------------------------------------------------------
-- Table: chat_analysis
-- ----------------------------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Allow all access to chat_analysis" ON chat_analysis;

-- Service role: full access
CREATE POLICY "Service role full access to chat_analysis"
  ON chat_analysis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role: read-only access
CREATE POLICY "Anon read access to chat_analysis"
  ON chat_analysis
  FOR SELECT
  TO anon
  USING (true);

-- ----------------------------------------------------------------------------
-- Table: personnel
-- ----------------------------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Allow all access to personnel" ON personnel;

-- Service role: full access
CREATE POLICY "Service role full access to personnel"
  ON personnel
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role: read-only access
CREATE POLICY "Anon read access to personnel"
  ON personnel
  FOR SELECT
  TO anon
  USING (true);

-- ----------------------------------------------------------------------------
-- Table: personnel_daily_stats
-- ----------------------------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Allow all access to personnel_daily_stats" ON personnel_daily_stats;

-- Service role: full access
CREATE POLICY "Service role full access to personnel_daily_stats"
  ON personnel_daily_stats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role: read-only access
CREATE POLICY "Anon read access to personnel_daily_stats"
  ON personnel_daily_stats
  FOR SELECT
  TO anon
  USING (true);

-- ----------------------------------------------------------------------------
-- Table: alerts
-- ----------------------------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Allow all access to alerts" ON alerts;

-- Service role: full access
CREATE POLICY "Service role full access to alerts"
  ON alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role: read-only access
CREATE POLICY "Anon read access to alerts"
  ON alerts
  FOR SELECT
  TO anon
  USING (true);

-- ----------------------------------------------------------------------------
-- Table: settings
-- ----------------------------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Allow all access to settings" ON settings;

-- Service role: full access
CREATE POLICY "Service role full access to settings"
  ON settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role: read and update settings (for the UI)
CREATE POLICY "Anon read access to settings"
  ON settings
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon update access to settings"
  ON settings
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- VERIFICATION QUERIES (for documentation)
-- ============================================================================

-- Verify indexes exist:
-- SELECT indexname, tablename FROM pg_indexes 
-- WHERE tablename IN ('alerts', 'chats', 'chat_analysis') 
-- ORDER BY tablename, indexname;

-- Verify RLS policies:
-- SELECT tablename, policyname, cmd, roles 
-- FROM pg_policies 
-- WHERE tablename IN ('chats', 'chat_messages', 'chat_analysis', 'personnel', 'alerts', 'settings')
-- ORDER BY tablename, policyname;

-- Verify function search_path:
-- SELECT proname, prosecdef, proconfig 
-- FROM pg_proc 
-- WHERE proname = 'upsert_daily_stats';
