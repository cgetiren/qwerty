/*
  # Fix get_personnel_daily_trends column names

  ## Problem
  There are two overloaded versions of get_personnel_daily_trends.
  The brand-filtered version returns columns named "trend_date" and "daily_score",
  but the Dashboard expects "day_date", "day_sort_ts", and "avg_score".
  This causes the chart to appear empty when a brand is selected.

  ## Fix
  Drop and recreate the brand-aware function with the correct column names
  matching what the Dashboard frontend expects.
*/

DROP FUNCTION IF EXISTS get_personnel_daily_trends(integer, uuid);

CREATE OR REPLACE FUNCTION get_personnel_daily_trends(
  p_days_back integer DEFAULT 30,
  p_brand_id  uuid    DEFAULT NULL
)
RETURNS TABLE(
  agent_name  text,
  day_date    text,
  day_sort_ts bigint,
  avg_score   numeric,
  chat_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.agent_name,
    to_char((c.created_at AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD') AS day_date,
    EXTRACT(EPOCH FROM (c.created_at AT TIME ZONE 'Europe/Istanbul')::date::timestamptz)::bigint AS day_sort_ts,
    ROUND(AVG(ca.overall_score::numeric), 1) AS avg_score,
    COUNT(*)::bigint AS chat_count
  FROM chats c
  INNER JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.created_at >= now() - (p_days_back || ' days')::interval
    AND ca.overall_score IS NOT NULL
    AND c.agent_name IS NOT NULL AND c.agent_name != ''
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id)
  GROUP BY c.agent_name, (c.created_at AT TIME ZONE 'Europe/Istanbul')::date
  ORDER BY c.agent_name, (c.created_at AT TIME ZONE 'Europe/Istanbul')::date;
END;
$$;
