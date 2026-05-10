/*
  # Add Recurring Issues Penalty to Personnel Score Calculation

  1. Problem
    - Personnel scores were calculated as a pure average of chat analysis scores
    - If an agent repeated the same critical mistake in 3, 5, or 10 chats, their
      score only reflected those individual chats being low — the PATTERN of
      repetition had no additional weight
    - This meant a "consistent low performer" and a "one-time low performer"
      could have the same score, even though the former is objectively worse

  2. Solution: Recurring Issues Penalty
    - For each DISTINCT critical error that appears in 3 or more analyzed chats,
      apply a -3 point penalty to the overall average score
    - Maximum total penalty is capped at -15 points (so max 5 recurring issues penalized)
    - Formula: adjusted_score = max(0, avg_score - min(15, count_of_recurring_issues * 3))
    - Example: agent with avg 72, has 4 recurring critical issues → 72 - (4*3) = 60

  3. New Column
    - personnel.recurring_issues_count: integer - how many distinct critical errors
      this agent has repeated 3+ times. Shown in UI for transparency.

  4. Updated Tables
    - personnel: added recurring_issues_count column
    - recalculate_personnel_stats function: updated to apply penalty

  5. Important Notes
    - "Recurring" means the SAME (case-insensitive) critical error text appears
      in issues_detected->critical_errors across 3 or more different chats
    - Daily stats (personnel_daily_stats) are NOT penalized — only the overall
      summary score in personnel table gets the adjustment for the full period
    - Running recalculate_personnel_stats() after this migration will update all existing scores
*/

-- Add recurring_issues_count column to personnel table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'recurring_issues_count'
  ) THEN
    ALTER TABLE personnel ADD COLUMN recurring_issues_count integer DEFAULT 0;
  END IF;
END $$;

-- Update recalculate_personnel_stats function with recurring issues penalty
CREATE OR REPLACE FUNCTION recalculate_personnel_stats(p_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Update existing personnel records with penalty-adjusted scores
  UPDATE personnel p
  SET 
    total_chats = COALESCE(stats.total_chats, 0),
    average_score = COALESCE(GREATEST(0, stats.adj_avg_score), 50),
    warning_count = COALESCE(stats.warning_count, 0),
    recurring_issues_count = COALESCE(stats.recurring_count, 0),
    updated_at = now()
  FROM (
    WITH base_stats AS (
      SELECT 
        c.agent_name AS name,
        COUNT(DISTINCT c.id) AS total_chats,
        CASE 
          WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
          ELSE 50
        END AS avg_score,
        COUNT(*) FILTER (WHERE ca.requires_attention = true) AS warning_count
      FROM chats c
      LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
      WHERE c.agent_name IS NOT NULL 
        AND c.agent_name != ''
        AND c.agent_name != 'Unknown'
        AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
      GROUP BY c.agent_name
    ),
    error_occurrences AS (
      SELECT 
        c.agent_name,
        lower(trim(err_text)) AS issue_text,
        COUNT(*) AS cnt
      FROM chats c
      JOIN chat_analysis ca ON ca.chat_id = c.id
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE 
          WHEN ca.issues_detected IS NOT NULL 
            AND jsonb_typeof(ca.issues_detected->'critical_errors') = 'array'
          THEN ca.issues_detected->'critical_errors'
          ELSE '[]'::jsonb
        END
      ) AS err_text
      WHERE c.agent_name IS NOT NULL 
        AND c.agent_name != ''
        AND c.agent_name != 'Unknown'
        AND ca.overall_score > 0
        AND length(trim(err_text)) >= 5
        AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
      GROUP BY c.agent_name, lower(trim(err_text))
      HAVING COUNT(*) >= 3
    ),
    penalties AS (
      SELECT 
        agent_name,
        COUNT(*)::integer AS recurring_count,
        LEAST(15, COUNT(*) * 3)::integer AS penalty
      FROM error_occurrences
      GROUP BY agent_name
    )
    SELECT 
      b.name,
      b.total_chats,
      ROUND(b.avg_score - COALESCE(pen.penalty, 0), 2) AS adj_avg_score,
      b.warning_count,
      COALESCE(pen.recurring_count, 0)::integer AS recurring_count
    FROM base_stats b
    LEFT JOIN penalties pen ON pen.agent_name = b.name
  ) stats
  WHERE p.name = stats.name;

  -- Insert new personnel records
  INSERT INTO personnel (name, total_chats, average_score, warning_count, recurring_issues_count)
  WITH base_stats AS (
    SELECT 
      c.agent_name AS name,
      COUNT(DISTINCT c.id) AS total_chats,
      CASE 
        WHEN COUNT(ca.id) > 0 THEN ROUND(AVG(ca.overall_score), 2)
        ELSE 50
      END AS avg_score,
      COUNT(*) FILTER (WHERE ca.requires_attention = true) AS warning_count
    FROM chats c
    LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.agent_name IS NOT NULL 
      AND c.agent_name != ''
      AND c.agent_name != 'Unknown'
      AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
    GROUP BY c.agent_name
  ),
  error_occurrences AS (
    SELECT 
      c.agent_name,
      lower(trim(err_text)) AS issue_text,
      COUNT(*) AS cnt
    FROM chats c
    JOIN chat_analysis ca ON ca.chat_id = c.id
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE 
        WHEN ca.issues_detected IS NOT NULL 
          AND jsonb_typeof(ca.issues_detected->'critical_errors') = 'array'
        THEN ca.issues_detected->'critical_errors'
        ELSE '[]'::jsonb
      END
    ) AS err_text
    WHERE c.agent_name IS NOT NULL 
      AND c.agent_name != ''
      AND c.agent_name != 'Unknown'
      AND ca.overall_score > 0
      AND length(trim(err_text)) >= 5
      AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
    GROUP BY c.agent_name, lower(trim(err_text))
    HAVING COUNT(*) >= 3
  ),
  penalties AS (
    SELECT 
      agent_name,
      COUNT(*)::integer AS recurring_count,
      LEAST(15, COUNT(*) * 3)::integer AS penalty
    FROM error_occurrences
    GROUP BY agent_name
  )
  SELECT 
    b.name,
    b.total_chats,
    GREATEST(0, ROUND(b.avg_score - COALESCE(pen.penalty, 0), 2)),
    b.warning_count,
    COALESCE(pen.recurring_count, 0)::integer
  FROM base_stats b
  LEFT JOIN penalties pen ON pen.agent_name = b.name
  WHERE NOT EXISTS (
    SELECT 1 FROM personnel WHERE name = b.name
  );

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
