/*
  # Fix recalculate_personnel_stats function

  1. Problem
    - The existing function references non-existent columns (`personnel_name`, `positive_feedback`, `negative_feedback`)
    - This causes a 400 error when calling the function from the frontend

  2. Fix
    - Rewrite the function to use correct column names from `chat_analysis` and `personnel` tables
    - Join `chat_analysis` with `chats` to get agent_name
    - Update `total_chats`, `average_score`, `warning_count` on the `personnel` table
    - Insert new personnel records for agents not yet tracked
*/

CREATE OR REPLACE FUNCTION recalculate_personnel_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE personnel p
  SET 
    total_chats = COALESCE(stats.total_chats, 0),
    average_score = COALESCE(stats.avg_score, 0),
    warning_count = COALESCE(stats.warning_count, 0),
    updated_at = now()
  FROM (
    SELECT 
      c.agent_name as name,
      COUNT(DISTINCT c.id) as total_chats,
      ROUND(AVG(ca.overall_score), 2) as avg_score,
      COUNT(*) FILTER (WHERE ca.requires_attention = true) as warning_count
    FROM chats c
    LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.agent_name IS NOT NULL 
      AND c.agent_name != ''
      AND c.agent_name != 'Unknown'
    GROUP BY c.agent_name
  ) stats
  WHERE p.name = stats.name;

  INSERT INTO personnel (name, total_chats, average_score, warning_count)
  SELECT 
    c.agent_name,
    COUNT(DISTINCT c.id),
    ROUND(AVG(ca.overall_score), 2),
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
