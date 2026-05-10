/*
  # Add get_reports_daily_stats RPC

  ## Purpose
  Calculates daily report statistics server-side to bypass PostgREST's max_rows limit.
  Returns per-day aggregates: chat count, avg analysis score, avg response time, avg resolution time.

  ## Parameters
  - p_days_ago: integer - how many days back to fetch (default 30)

  ## Returns
  Table with columns: date, total_chats, average_score, average_response_time, average_resolution_time
*/

CREATE OR REPLACE FUNCTION get_reports_daily_stats(p_days_ago integer DEFAULT 30)
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
  v_cutoff := (NOW() AT TIME ZONE 'UTC')
    - make_interval(days => p_days_ago);

  RETURN QUERY
  SELECT
    to_char(c.created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS date,
    COUNT(c.id) AS total_chats,
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
  GROUP BY to_char(c.created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD')
  ORDER BY date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reports_daily_stats(integer) TO authenticated;
