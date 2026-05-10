/*
  # Update Recalculate Personnel Stats to Include Analysis Scores

  1. Changes
    - Update `recalculate_personnel_stats` function to calculate analysis scores
    - Track both analysis scores and personnel scores separately
    
  2. Purpose
    - Enable detailed reporting with analysis metrics
    - Support comprehensive daily statistics
*/

CREATE OR REPLACE FUNCTION recalculate_personnel_stats(p_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := COALESCE(p_date, (CURRENT_DATE AT TIME ZONE 'Europe/Istanbul')::date);

  DELETE FROM personnel_daily_stats WHERE date = target_date;

  INSERT INTO personnel_daily_stats (
    personnel_name,
    date,
    total_chats,
    average_score,
    total_issues,
    average_response_time,
    average_resolution_time,
    total_analysis_score,
    analysis_count
  )
  SELECT 
    p.name as personnel_name,
    target_date as date,
    COUNT(DISTINCT c.id) as total_chats,
    COALESCE(AVG(p.average_score), 0) as average_score,
    COUNT(DISTINCT ca.id) FILTER (WHERE ca.has_critical_issue = true) as total_issues,
    COALESCE(AVG(c.average_response_time), 0)::integer as average_response_time,
    COALESCE(AVG(c.average_resolution_time), 0)::integer as average_resolution_time,
    COALESCE(SUM(ca.overall_score), 0)::integer as total_analysis_score,
    COUNT(DISTINCT ca.id) FILTER (WHERE ca.overall_score IS NOT NULL) as analysis_count
  FROM personnel p
  LEFT JOIN chats c ON c.agent_name = p.name 
    AND (c.started_at AT TIME ZONE 'Europe/Istanbul')::date = target_date
  LEFT JOIN chat_analyses ca ON ca.chat_id = c.id
  WHERE p.name != 'Unknown'
  GROUP BY p.name;

  UPDATE personnel p
  SET 
    total_chats = stats.total_chats,
    average_score = stats.avg_score,
    last_updated = NOW()
  FROM (
    SELECT 
      personnel_name,
      SUM(total_chats) as total_chats,
      AVG(average_score) as avg_score
    FROM personnel_daily_stats
    GROUP BY personnel_name
  ) stats
  WHERE p.name = stats.personnel_name;
END;
$$;
