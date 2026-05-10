/*
  # Fix get_reports_daily_stats to Support Brand Filtering

  ## Problem
  The Reports page calls get_reports_daily_stats with parameters (p_days_ago, p_brand_id),
  but the function was replaced with an incompatible signature (p_start_date, p_end_date, p_brand_id)
  during multi-brand migration. This caused brand filtering to silently fail.

  ## Fix
  - Drop all existing overloads of get_reports_daily_stats
  - Create a single unified function matching what Reports.tsx expects:
    get_reports_daily_stats(p_days_ago integer, p_brand_id uuid)
  - Return columns match the original: date, total_chats, average_score,
    average_response_time, average_resolution_time
  - Properly filters by brand_id when provided
*/

DROP FUNCTION IF EXISTS get_reports_daily_stats(integer);
DROP FUNCTION IF EXISTS get_reports_daily_stats(date, date, uuid);
DROP FUNCTION IF EXISTS get_reports_daily_stats(integer, uuid);

CREATE OR REPLACE FUNCTION get_reports_daily_stats(
  p_days_ago integer DEFAULT 30,
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE (
  date text,
  total_chats bigint,
  average_score numeric,
  average_response_time numeric,
  average_resolution_time numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - make_interval(days => p_days_ago);

  RETURN QUERY
  SELECT
    to_char(c.created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS date,
    COUNT(c.id)::bigint AS total_chats,
    COALESCE(
      AVG(CASE WHEN ca.overall_score::numeric > 0 THEN ca.overall_score::numeric END),
      0
    )::numeric AS average_score,
    COALESCE(
      AVG(CASE WHEN c.first_response_time > 0 THEN c.first_response_time::numeric END),
      0
    )::numeric AS average_response_time,
    COALESCE(
      AVG(
        CASE
          WHEN c.ended_at IS NOT NULL
            AND EXTRACT(EPOCH FROM (c.ended_at - c.created_at)) > 0
          THEN EXTRACT(EPOCH FROM (c.ended_at - c.created_at))
        END
      ),
      0
    )::numeric AS average_resolution_time
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.created_at >= v_cutoff
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id)
  GROUP BY to_char(c.created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD')
  ORDER BY date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reports_daily_stats(integer, uuid) TO authenticated;
