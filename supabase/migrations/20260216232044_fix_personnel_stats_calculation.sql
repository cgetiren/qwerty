/*
  # Fix Personnel Stats Calculation
  
  1. Problem
    - Personnel scores show 0 when there are no analyzed chats
    - The function should handle cases where analysis data doesn't exist yet
    
  2. Solution
    - Update personnel stats calculation to show basic metrics even without analysis
    - Use a default neutral score (50) when no analysis data exists
    - This allows the system to show personnel activity before analysis is complete
*/

CREATE OR REPLACE FUNCTION recalculate_personnel_stats(p_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Update existing personnel records
  UPDATE personnel p
  SET 
    total_chats = COALESCE(stats.total_chats, 0),
    average_score = COALESCE(stats.avg_score, 50), -- Default to neutral score if no analysis
    warning_count = COALESCE(stats.warning_count, 0),
    updated_at = now()
  FROM (
    SELECT 
      c.agent_name as name,
      COUNT(DISTINCT c.id) as total_chats,
      CASE 
        WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
        ELSE 50 -- Default neutral score when no analysis exists
      END as avg_score,
      COUNT(*) FILTER (WHERE ca.requires_attention = true) as warning_count
    FROM chats c
    LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.agent_name IS NOT NULL 
      AND c.agent_name != ''
      AND c.agent_name != 'Unknown'
      AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
    GROUP BY c.agent_name
  ) stats
  WHERE p.name = stats.name;

  -- Insert new personnel records
  INSERT INTO personnel (name, total_chats, average_score, warning_count)
  SELECT 
    c.agent_name,
    COUNT(DISTINCT c.id),
    CASE 
      WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
      ELSE 50
    END,
    COUNT(*) FILTER (WHERE ca.requires_attention = true)
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.agent_name IS NOT NULL 
    AND c.agent_name != ''
    AND c.agent_name != 'Unknown'
    AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
    AND NOT EXISTS (
      SELECT 1 FROM personnel WHERE name = c.agent_name
    )
  GROUP BY c.agent_name;
END;
$$;
