/*
  # Add confidence_level and reliability_tier to personnel

  ## Problem
  The frontend reads `confidence_level` and `reliability_tier` from the `personnel`
  table, but these columns never existed in the schema. As a result, all personnel
  showed 0% confidence ("Güvenilirlik: 0%") and no tier label.

  ## Changes

  ### New Columns on `personnel`
  - `confidence_level` (numeric, default 0): Statistical confidence percentage (0-99)
    based on how many chats have been analyzed. Derived from standard error formula:
    `100 * (1 - 1/sqrt(analyzed_chats))` — capped at 99, floored at 10.
    Examples:
      4 chats  → 50%
      25 chats → 80%
      100 chats → 90%
      374 chats (Deren) → ~95%
  - `reliability_tier` (text, default 'D'): Letter tier based on confidence_level.
      A = 90%+ (En Güvenilir)
      B = 75%+ (Güvenilir)
      C = 50%+ (Orta Güvenilir)
      D = <50%  (Düşük Güvenilir)

  ### Updated Function: recalculate_personnel_stats
  Now calculates and writes both new columns on every recalculation run.

  ## Notes
  - Existing rows are backfilled immediately after column creation
  - No data is deleted or destructively altered
  - Cast to numeric is required because SQRT returns double precision
*/

-- 1. Add columns if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'confidence_level'
  ) THEN
    ALTER TABLE personnel ADD COLUMN confidence_level numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'reliability_tier'
  ) THEN
    ALTER TABLE personnel ADD COLUMN reliability_tier text DEFAULT 'D';
  END IF;
END $$;

-- Helper macro: compute confidence given an analyzed_count expression
-- conf = LEAST(99, GREATEST(10, ROUND( (100*(1-1/sqrt(n)))::numeric, 0 )))

-- 2. Backfill existing rows right away
UPDATE personnel p
SET
  confidence_level = sub.conf,
  reliability_tier = CASE
    WHEN sub.conf >= 90 THEN 'A'
    WHEN sub.conf >= 75 THEN 'B'
    WHEN sub.conf >= 50 THEN 'C'
    ELSE 'D'
  END
FROM (
  SELECT
    c.agent_name AS name,
    LEAST(99, GREATEST(10, ROUND(
      (100.0 * (1.0 - 1.0 / SQRT(GREATEST(1, COUNT(DISTINCT ca.id))::numeric)))::numeric
    , 0))) AS conf
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.agent_name IS NOT NULL
    AND c.agent_name != ''
    AND c.agent_name != 'Unknown'
  GROUP BY c.agent_name
) sub
WHERE p.name = sub.name;

-- 3. Drop and recreate the function so it now writes confidence_level + reliability_tier
CREATE OR REPLACE FUNCTION recalculate_personnel_stats(p_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update existing personnel records
  UPDATE personnel p
  SET
    total_chats            = COALESCE(stats.total_chats, 0),
    average_score          = COALESCE(GREATEST(0, stats.adj_avg_score), 50),
    warning_count          = COALESCE(stats.warning_count, 0),
    recurring_issues_count = COALESCE(stats.critical_chat_count, 0),
    confidence_level       = stats.conf,
    reliability_tier       = CASE
                               WHEN stats.conf >= 90 THEN 'A'
                               WHEN stats.conf >= 75 THEN 'B'
                               WHEN stats.conf >= 50 THEN 'C'
                               ELSE 'D'
                             END,
    updated_at             = now()
  FROM (
    SELECT
      c.agent_name AS name,
      COUNT(DISTINCT c.id) AS total_chats,
      COUNT(*) FILTER (WHERE ca.requires_attention = true) AS warning_count,
      COUNT(*) FILTER (WHERE ca.overall_score < 50) AS critical_chat_count,
      CASE
        WHEN COUNT(ca.id) > 0 THEN
          GREATEST(0, ROUND(AVG(ca.overall_score) -
            CASE
              WHEN COUNT(*) FILTER (WHERE ca.overall_score < 50) >= 3
                THEN LEAST(15, ROUND((COUNT(*) FILTER (WHERE ca.overall_score < 50) - 2) * 1.5, 2))
              ELSE 0
            END, 2))
        ELSE 50
      END AS adj_avg_score,
      LEAST(99, GREATEST(10, ROUND(
        (100.0 * (1.0 - 1.0 / SQRT(GREATEST(1, COUNT(DISTINCT ca.id))::numeric)))::numeric
      , 0))) AS conf
    FROM chats c
    LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.agent_name IS NOT NULL
      AND c.agent_name != ''
      AND c.agent_name != 'Unknown'
      AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
    GROUP BY c.agent_name
  ) stats
  WHERE p.name = stats.name;

  -- Insert new personnel records not yet in the table
  INSERT INTO personnel (name, total_chats, average_score, warning_count, recurring_issues_count, confidence_level, reliability_tier)
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
    COUNT(*) FILTER (WHERE ca.overall_score < 50),
    LEAST(99, GREATEST(10, ROUND(
      (100.0 * (1.0 - 1.0 / SQRT(GREATEST(1, COUNT(DISTINCT ca.id))::numeric)))::numeric
    , 0))),
    CASE
      WHEN LEAST(99, GREATEST(10, ROUND((100.0 * (1.0 - 1.0 / SQRT(GREATEST(1, COUNT(DISTINCT ca.id))::numeric)))::numeric, 0))) >= 90 THEN 'A'
      WHEN LEAST(99, GREATEST(10, ROUND((100.0 * (1.0 - 1.0 / SQRT(GREATEST(1, COUNT(DISTINCT ca.id))::numeric)))::numeric, 0))) >= 75 THEN 'B'
      WHEN LEAST(99, GREATEST(10, ROUND((100.0 * (1.0 - 1.0 / SQRT(GREATEST(1, COUNT(DISTINCT ca.id))::numeric)))::numeric, 0))) >= 50 THEN 'C'
      ELSE 'D'
    END
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

  -- Recalculate daily stats for last 30 days (raw daily quality, no penalty)
  DELETE FROM personnel_daily_stats
  WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::date;

  INSERT INTO personnel_daily_stats (
    personnel_name, date, total_chats, average_score, total_issues,
    average_response_time, average_resolution_time, total_analysis_score, analysis_count
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
  LEFT JOIN chats c
    ON c.agent_name = p.name
    AND DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') = day_date::date
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE p.name != 'Unknown'
  GROUP BY p.name, day_date
  HAVING COUNT(DISTINCT c.id) > 0;
END;
$$;
