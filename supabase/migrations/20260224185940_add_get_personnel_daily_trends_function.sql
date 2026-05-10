/*
  # Add get_personnel_daily_trends RPC Function

  ## Summary
  Creates a SQL function that summarizes the last N days of data from
  the personnel_daily_stats table, returning one row per agent per day.

  ## New Functions
  - `get_personnel_daily_trends(days_back integer)`:
    - Reads from `personnel_daily_stats`
    - Filters to the last `days_back` days
    - Returns agent_name, formatted date, sort timestamp, avg_score, chat_count
    - Used by the Dashboard page to render the Personnel Daily Trend chart

  ## Return Columns
  - `agent_name` text       - the personnel name
  - `day_date`   text       - date formatted as YYYY-MM-DD
  - `day_sort_ts` bigint    - unix epoch ms for client-side sorting
  - `avg_score`  numeric    - average_score for that day
  - `chat_count` integer    - total_chats for that day

  ## Security
  - Function is SECURITY DEFINER so authenticated users can read
    aggregated stats without needing direct table access
  - Marked STABLE (no side effects, same inputs = same outputs within a transaction)
*/

CREATE OR REPLACE FUNCTION get_personnel_daily_trends(days_back integer DEFAULT 30)
RETURNS TABLE (
  agent_name  text,
  day_date    text,
  day_sort_ts bigint,
  avg_score   numeric,
  chat_count  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pds.personnel_name                                         AS agent_name,
    to_char(pds.date, 'YYYY-MM-DD')                           AS day_date,
    EXTRACT(EPOCH FROM pds.date::timestamptz)::bigint * 1000  AS day_sort_ts,
    pds.average_score                                          AS avg_score,
    pds.total_chats                                            AS chat_count
  FROM personnel_daily_stats pds
  WHERE pds.date >= (CURRENT_DATE - (days_back - 1) * INTERVAL '1 day')
  ORDER BY pds.personnel_name, pds.date;
$$;
