/*
  # Fix Personnel Stats Recalculation with Daily Stats
  
  1. Problem
    - personnel_daily_stats table is not being updated
    - When users click "Yenile" button, daily stats remain stale
    - This causes the UI to show outdated information even after recalculation
    
  2. Solution
    - Update recalculate_personnel_stats to also update personnel_daily_stats
    - Recalculate last 30 days of daily stats to ensure fresh data
    - This ensures both summary stats and daily breakdowns are in sync
    
  3. Security
    - Function remains SECURITY DEFINER with SET search_path for safety
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
    average_score = COALESCE(stats.avg_score, 50),
    warning_count = COALESCE(stats.warning_count, 0),
    updated_at = now()
  FROM (
    SELECT 
      c.agent_name as name,
      COUNT(DISTINCT c.id) as total_chats,
      CASE 
        WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
        ELSE 50
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

  -- Recalculate daily stats for last 30 days
  DELETE FROM personnel_daily_stats 
  WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::date;

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
    day_date::date as date,
    COUNT(DISTINCT c.id) as total_chats,
    CASE 
      WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
      ELSE 50
    END as average_score,
    COUNT(*) FILTER (WHERE ca.requires_attention = true) as total_issues,
    COALESCE(AVG(
      CASE 
        WHEN c.chat_data->'properties'->'raw_chat_data'->>'first_response_time_seconds' IS NOT NULL 
        THEN (c.chat_data->'properties'->'raw_chat_data'->>'first_response_time_seconds')::integer 
      END
    ), 0)::integer as average_response_time,
    COALESCE(AVG(
      CASE 
        WHEN c.chat_data->'properties'->'raw_chat_data'->>'chat_duration_seconds' IS NOT NULL 
        THEN (c.chat_data->'properties'->'raw_chat_data'->>'chat_duration_seconds')::integer 
      END
    ), 0)::integer as average_resolution_time,
    COALESCE(SUM(ca.overall_score), 0)::integer as total_analysis_score,
    COUNT(ca.id) FILTER (WHERE ca.overall_score IS NOT NULL) as analysis_count
  FROM personnel p
  CROSS JOIN generate_series(
    (CURRENT_DATE - INTERVAL '30 days')::date, 
    CURRENT_DATE, 
    '1 day'::interval
  ) AS day_date
  LEFT JOIN chats c ON c.agent_name = p.name 
    AND DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') = day_date::date
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE p.name != 'Unknown'
  GROUP BY p.name, day_date
  HAVING COUNT(DISTINCT c.id) > 0;
END;
$$;