/*
  # Fix Recurring Issues Penalty - Use Score Pattern Instead of Text Matching

  1. Problem
    - The AI generates unique descriptive text for each chat's issues_detected field
    - So the same "type" of error appears as slightly different text in each chat
    - Exact text matching found no recurring issues across agents
    
  2. Better Approach: Score Pattern Penalty
    - Instead of matching exact error text, count how many chats have overall_score < 50
      (these are "critical" chats with serious problems)
    - If an agent has 3 or more critical-score chats, it signals a pattern of recurring issues
    - Penalty formula: (count_of_critical_chats - 2) * 1.5, capped at 15 points
    - Example: 5 critical chats → (5-2) * 1.5 = 4.5 points penalty
    - Example: 10 critical chats → LEAST(15, (10-2)*1.5) = 12 points penalty
    
  3. recurring_issues_count Column
    - Now stores the count of critical-score chats (overall_score < 50)
    - This is an honest, visible metric: "this agent had X chats with critical scores"
    - Shown in UI with the penalty applied
    
  4. Score threshold rationale
    - overall_score < 50 aligns with the existing warning system (requires_attention)
    - It represents chats where the agent clearly failed to meet standards
    - Having 3+ such chats in a period is a clear pattern, not bad luck
*/

CREATE OR REPLACE FUNCTION recalculate_personnel_stats(p_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Update existing personnel records with pattern-based penalty for critical-score chats
  UPDATE personnel p
  SET 
    total_chats = COALESCE(stats.total_chats, 0),
    average_score = COALESCE(GREATEST(0, stats.adj_avg_score), 50),
    warning_count = COALESCE(stats.warning_count, 0),
    recurring_issues_count = COALESCE(stats.critical_chat_count, 0),
    updated_at = now()
  FROM (
    SELECT 
      c.agent_name AS name,
      COUNT(DISTINCT c.id) AS total_chats,
      CASE 
        WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
        ELSE 50
      END AS avg_score,
      COUNT(*) FILTER (WHERE ca.requires_attention = true) AS warning_count,
      COUNT(*) FILTER (WHERE ca.overall_score < 50) AS critical_chat_count,
      CASE
        WHEN COUNT(*) FILTER (WHERE ca.overall_score < 50) >= 3
        THEN LEAST(15, ROUND((COUNT(*) FILTER (WHERE ca.overall_score < 50) - 2) * 1.5, 2))
        ELSE 0
      END AS penalty,
      CASE 
        WHEN COUNT(ca.id) > 0 THEN 
          GREATEST(0, ROUND(AVG(ca.overall_score) - 
            CASE
              WHEN COUNT(*) FILTER (WHERE ca.overall_score < 50) >= 3
              THEN LEAST(15, ROUND((COUNT(*) FILTER (WHERE ca.overall_score < 50) - 2) * 1.5, 2))
              ELSE 0
            END, 2))
        ELSE 50
      END AS adj_avg_score
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
  INSERT INTO personnel (name, total_chats, average_score, warning_count, recurring_issues_count)
  SELECT 
    c.agent_name,
    COUNT(DISTINCT c.id),
    CASE 
      WHEN COUNT(ca.id) > 0 THEN 
        GREATEST(0, ROUND(AVG(ca.overall_score) - 
          CASE
            WHEN COUNT(*) FILTER (WHERE ca.overall_score < 50) >= 3
            THEN LEAST(15, ROUND((COUNT(*) FILTER (WHERE ca.overall_score < 50) - 2) * 1.5, 2))
            ELSE 0
          END, 2))
      ELSE 50
    END,
    COUNT(*) FILTER (WHERE ca.requires_attention = true),
    COUNT(*) FILTER (WHERE ca.overall_score < 50)
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

  -- Recalculate daily stats for last 30 days (no penalty on daily - shows raw daily quality)
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
    p.name AS personnel_name,
    day_date::date AS date,
    COUNT(DISTINCT c.id) AS total_chats,
    CASE 
      WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
      ELSE 50
    END AS average_score,
    COUNT(*) FILTER (WHERE ca.requires_attention = true) AS total_issues,
    COALESCE(AVG(
      CASE 
        WHEN c.chat_data->'properties'->'raw_chat_data'->>'first_response_time_seconds' IS NOT NULL 
        THEN (c.chat_data->'properties'->'raw_chat_data'->>'first_response_time_seconds')::integer 
      END
    ), 0)::integer AS average_response_time,
    COALESCE(AVG(
      CASE 
        WHEN c.chat_data->'properties'->'raw_chat_data'->>'chat_duration_seconds' IS NOT NULL 
        THEN (c.chat_data->'properties'->'raw_chat_data'->>'chat_duration_seconds')::integer 
      END
    ), 0)::integer AS average_resolution_time,
    COALESCE(SUM(ca.overall_score), 0)::integer AS total_analysis_score,
    COUNT(ca.id) FILTER (WHERE ca.overall_score IS NOT NULL) AS analysis_count
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
