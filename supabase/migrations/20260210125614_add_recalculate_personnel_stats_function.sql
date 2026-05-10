/*
  # Add recalculate_personnel_stats function

  1. Functions
    - `recalculate_personnel_stats()` - Recalculates personnel statistics from chat_analysis table

  2. Purpose
    - Ensures accurate statistics after duplicate cleanup
    - Can be called manually or automatically
*/

-- Create function to recalculate personnel statistics
CREATE OR REPLACE FUNCTION recalculate_personnel_stats()
RETURNS void
LANGUAGE plpgsql
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
