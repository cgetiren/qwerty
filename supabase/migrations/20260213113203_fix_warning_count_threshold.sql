/*
  # Fix warning count threshold in recalculate_personnel_stats

  1. Changes
    - Update warning_count calculation to use `overall_score < 50` instead of `requires_attention = true`
    - This ensures only truly unacceptable chats (score below 50) are counted as warnings
    - Consistent with the new 4-tier scoring system:
      - 80+: Kabul Edilebilir (green)
      - 65-79: Orta (blue)
      - 50-64: Gelismeli (yellow)
      - Below 50: Kabul Edilemez (red)
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
      COUNT(*) FILTER (WHERE ca.overall_score IS NOT NULL AND ca.overall_score < 50) as warning_count
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
    COUNT(*) FILTER (WHERE ca.overall_score IS NOT NULL AND ca.overall_score < 50)
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
