/*
  # Fix personnel unique constraint for multi-brand support

  ## Problem
  The personnel table has a global UNIQUE constraint on `name`, which prevents
  the same agent name from existing in different brands. When a new agent (e.g. "Duru")
  is added and their name already exists in another brand, the upsert fails silently
  (ignoreDuplicates=true) and the agent never appears in the personnel table.

  ## Fix
  1. Drop the old single-column UNIQUE constraint on `name`
  2. Add a composite UNIQUE constraint on `(name, brand_id)`
  3. Fix recalculate_personnel_stats to include brand_id when inserting new personnel
*/

-- 1. Drop old unique constraint on name alone
ALTER TABLE personnel
  DROP CONSTRAINT IF EXISTS personnel_name_key;

-- 2. Add composite unique constraint on (name, brand_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'personnel_name_brand_id_key'
  ) THEN
    ALTER TABLE personnel
      ADD CONSTRAINT personnel_name_brand_id_key
      UNIQUE (name, brand_id);
  END IF;
END $$;

-- 3. Fix recalculate_personnel_stats to include brand_id when inserting new personnel
CREATE OR REPLACE FUNCTION public.recalculate_personnel_stats(p_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
v_global_mean numeric;
BEGIN
-- Compute global mean across all analyzed chats (weighted)
SELECT COALESCE(SUM(overall_score::numeric) / GREATEST(COUNT(*), 1), 75)
INTO v_global_mean
FROM chat_analysis
WHERE overall_score > 0;

-- Update existing personnel records (now brand-aware)
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
c.brand_id,
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
GROUP BY c.agent_name, c.brand_id
) stats
WHERE p.name = stats.name
AND (p.brand_id = stats.brand_id OR (p.brand_id IS NULL AND stats.brand_id IS NULL));

-- Insert new personnel not yet in the table (now includes brand_id)
INSERT INTO personnel (name, brand_id, total_chats, average_score, adjusted_score, warning_count, recurring_issues_count, confidence_level, reliability_tier)
SELECT
c.agent_name,
c.brand_id,
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
SELECT 1 FROM personnel WHERE name = c.agent_name AND (brand_id = c.brand_id OR (brand_id IS NULL AND c.brand_id IS NULL))
)
GROUP BY c.agent_name, c.brand_id;

-- Recalculate daily stats for last 30 days (includes brand_id)
DELETE FROM personnel_daily_stats
WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::date;

INSERT INTO personnel_daily_stats (
  personnel_name, date, total_chats, average_score, total_issues,
  average_response_time, average_resolution_time, total_analysis_score, analysis_count,
  brand_id
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
COUNT(ca.id) FILTER (WHERE ca.overall_score IS NOT NULL) AS analysis_count,
p.brand_id
FROM personnel p
CROSS JOIN generate_series(
(CURRENT_DATE - INTERVAL '30 days')::date,
CURRENT_DATE,
'1 day'::interval
) AS day_date
LEFT JOIN chats c
ON c.agent_name = p.name
AND DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') = day_date::date
AND (p.brand_id IS NULL OR c.brand_id = p.brand_id)
LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
WHERE p.name != 'Unknown'
GROUP BY p.name, p.brand_id, day_date
HAVING COUNT(DISTINCT c.id) > 0;
END;
$function$;
