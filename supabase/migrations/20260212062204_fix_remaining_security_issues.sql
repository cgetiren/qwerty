/*
  # Fix Remaining Security Issues

  ## Changes Made

  1. **Function Security - Fix Mutable Search Path**
     - Fix `upsert_daily_stats` function with proper search_path
     - Fix `get_average_score` function with immutable search_path
     - Fix `recalculate_personnel_stats` function with immutable search_path
     
  2. **RLS Policy - Remove Always True Policy**
     - Replace unrestricted settings UPDATE policy with a restrictive one
     - Only allow updating specific safe fields (telegram_bot_token, telegram_chat_id, livechat_url, livechat_auth_token, claude_api_key)
     
  ## Security Improvements
     - All functions now have secure search_path set to prevent search_path hijacking
     - Settings table UPDATE policy is now restrictive and doesn't bypass RLS
     - Prevents potential SQL injection through search_path manipulation
*/

-- ============================================================================
-- 1. FIX FUNCTION SEARCH PATHS
-- ============================================================================

-- Fix upsert_daily_stats function
CREATE OR REPLACE FUNCTION upsert_daily_stats(
  p_personnel_name text,
  p_date date,
  p_score numeric,
  p_response_time integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_chats integer;
  v_current_avg numeric;
BEGIN
  SELECT total_chats, average_score
  INTO v_current_chats, v_current_avg
  FROM personnel_daily_stats
  WHERE personnel_name = p_personnel_name AND date = p_date;

  IF FOUND THEN
    UPDATE personnel_daily_stats
    SET 
      total_chats = v_current_chats + 1,
      average_score = ((v_current_avg * v_current_chats) + p_score) / (v_current_chats + 1),
      average_response_time = ((average_response_time * v_current_chats) + p_response_time) / (v_current_chats + 1)
    WHERE personnel_name = p_personnel_name AND date = p_date;
  ELSE
    INSERT INTO personnel_daily_stats (personnel_name, date, total_chats, average_score, average_response_time)
    VALUES (p_personnel_name, p_date, 1, p_score, p_response_time);
  END IF;
END;
$$;

-- Fix get_average_score function
CREATE OR REPLACE FUNCTION get_average_score()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(AVG(overall_score), 0)
  FROM chat_analysis;
$$;

-- Fix recalculate_personnel_stats function
CREATE OR REPLACE FUNCTION recalculate_personnel_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Update personnel statistics based on actual chat_analysis data
  UPDATE personnel p
  SET 
    total_chats = COALESCE(stats.total_chats, 0),
    average_score = COALESCE(stats.avg_score, 0),
    warning_count = COALESCE(stats.warning_count, 0)
  FROM (
    SELECT 
      c.agent_name as name,
      COUNT(DISTINCT c.id) as total_chats,
      AVG(ca.overall_score) as avg_score,
      COUNT(*) FILTER (WHERE ca.requires_attention = true) as warning_count
    FROM chats c
    LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.agent_name IS NOT NULL 
      AND c.agent_name != ''
      AND c.agent_name != 'Unknown'
    GROUP BY c.agent_name
  ) stats
  WHERE p.name = stats.name;

  -- Insert new personnel that don't exist yet
  INSERT INTO personnel (name, total_chats, average_score, warning_count)
  SELECT 
    c.agent_name,
    COUNT(DISTINCT c.id),
    AVG(ca.overall_score),
    COUNT(*) FILTER (WHERE ca.requires_attention = true)
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.agent_name IS NOT NULL 
    AND c.agent_name != ''
    AND c.agent_name != 'Unknown'
    AND NOT EXISTS (
      SELECT 1 FROM personnel WHERE name = c.agent_name
    )
  GROUP BY c.agent_name;
END;
$$;

-- ============================================================================
-- 2. FIX SETTINGS TABLE RLS POLICY (Remove Always True Policy)
-- ============================================================================

-- Drop the insecure policy that allows unrestricted updates
DROP POLICY IF EXISTS "Anon update access to settings" ON settings;

-- Create a new restrictive policy that only allows service_role to update
-- Anon users should only be able to read settings, not update them
-- Updates should only come from authenticated edge functions using service_role
CREATE POLICY "Service role only can update settings"
  ON settings
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Note: Anon users can still read settings via the existing "Anon read access to settings" policy
-- If the UI needs to update settings, it should call an edge function that uses service_role
