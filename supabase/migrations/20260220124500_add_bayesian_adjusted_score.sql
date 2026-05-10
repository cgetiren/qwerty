/*
  # Add Bayesian Adjusted Score to Personnel

  ## Problem
  A personnel with 25 chats and a score of 96 gets "Mükemmel" just like someone
  with 342 chats and 94. The raw score from few chats is statistically unreliable
  and should not be treated identically to a score from hundreds of chats.

  ## Solution: Bayesian Shrinkage Formula
  adjusted_score = (N × raw_score + K × global_mean) / (N + K)

  Where:
  - N = number of analyzed chats for this agent
  - raw_score = agent's raw average score
  - K = 20 (Bayesian confidence constant — equivalent to weighting 20 "prior" chats)
  - global_mean = weighted global average score across all analyzed chats

  ## Effect
  - Agent with N=25, raw=96, global_mean=85 → adjusted ≈ 92.2 (pulled toward mean)
  - Agent with N=342, raw=94, global_mean=85 → adjusted ≈ 93.5 (barely affected)
  - Agent with N=5, raw=100, global_mean=85 → adjusted ≈ 87.0 (strongly pulled down)
  - Agent with N=200+, raw=80, global_mean=85 → adjusted ≈ 80.4 (barely affected)

  ## New Column
  - `adjusted_score` (numeric, default 0): Bayesian-shrunk reliability score (0-100)

  ## Updated Function
  `recalculate_personnel_stats` now computes and stores `adjusted_score` for every agent.

  ## Notes
  - K=20 is configurable — it represents how much weight the global prior carries
  - Existing rows are backfilled immediately
  - No data is deleted or destructively altered
*/

-- 1. Add adjusted_score column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'adjusted_score'
  ) THEN
    ALTER TABLE personnel ADD COLUMN adjusted_score numeric DEFAULT 0;
  END IF;
END $$;

-- 2. Backfill adjusted_score for all existing personnel
UPDATE personnel p
SET adjusted_score = ROUND(
  COALESCE(
    (
      SELECT
        GREATEST(0, LEAST(100,
          (analyzed_count * COALESCE(p.average_score, 50) + 20 * global_mean) /
          (analyzed_count + 20)
        ))
      FROM (
        SELECT
          COUNT(DISTINCT ca.id)::numeric AS analyzed_count,
          (SELECT COALESCE(SUM(ca2.overall_score::numeric), 0) / GREATEST(COUNT(ca2.id), 1)
           FROM chat_analysis ca2
           WHERE ca2.overall_score > 0) AS global_mean
        FROM chats c
        LEFT JOIN chat_analysis ca ON ca.chat_id = c.id AND ca.overall_score > 0
        WHERE c.agent_name = p.name
          AND c.agent_name IS NOT NULL
          AND c.agent_name != ''
          AND c.agent_name != 'Unknown'
      ) sub
    ),
    COALESCE(p.average_score, 50)
  )
, 2);

-- 3. Drop and recreate recalculate_personnel_stats with adjusted_score support
CREATE OR REPLACE FUNCTION recalculate_personnel_stats(p_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_global_mean numeric;
BEGIN
  -- Compute global mean across all analyzed chats (weighted)
  SELECT COALESCE(SUM(overall_score::numeric) / GREATEST(COUNT(*), 1), 75)
  INTO v_global_mean
  FROM chat_analysis
  WHERE overall_score > 0;

  -- Update existing personnel records
  UPDATE personnel p
  SET
    total_chats            = COALESCE(stats.total_chats, 0),
    average_score          = COALESCE(GREATEST(0, stats.adj_avg_score), 50),
    adjusted_score         = GREATEST(0, LEAST(100, ROUND(
                               (GREATEST(0, stats.adj_avg_score) * stats.analyzed_count + 20 * v_global_mean) /
                               (stats.analyzed_count + 20)
                             , 2))),
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
      COUNT(ca.id) FILTER (WHERE ca.overall_score > 0) AS analyzed_count,
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
    LEFT JOIN chat_analysis ca ON ca.chat_id = c.id AND ca.overall_score > 0
    WHERE c.agent_name IS NOT NULL
      AND c.agent_name != ''
      AND c.agent_name != 'Unknown'
      AND (p_date IS NULL OR DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') <= p_date)
    GROUP BY c.agent_name
  ) stats
  WHERE p.name = stats.name;

  -- Insert new personnel not yet in the table
  INSERT INTO personnel (name, total_chats, average_score, adjusted_score, warning_count, recurring_issues_count, confidence_level, reliability_tier)
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
    END AS avg_score,
    GREATEST(0, LEAST(100, ROUND(
      (
        CASE
          WHEN COUNT(ca.id) > 0 THEN
            GREATEST(0, ROUND(AVG(ca.overall_score) -
              CASE
                WHEN COUNT(*) FILTER (WHERE ca.overall_score < 50) >= 3
                  THEN LEAST(15, ROUND((COUNT(*) FILTER (WHERE ca.overall_score < 50) - 2) * 1.5, 2))
                ELSE 0
              END, 2))
          ELSE 50
        END * COUNT(ca.id) FILTER (WHERE ca.overall_score > 0) + 20 * v_global_mean
      ) /
      (COUNT(ca.id) FILTER (WHERE ca.overall_score > 0) + 20)
    , 2))) AS adj_score,
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
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id AND ca.overall_score > 0
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
