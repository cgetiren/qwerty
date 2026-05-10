/*
  # Add Dashboard Chart Stats RPC Functions

  ## Summary
  Creates server-side SQL functions for sentiment distribution and hourly
  distribution charts, replacing expensive client-side batch fetching that
  caused statement timeout errors.

  ## New Functions
  - `get_sentiment_distribution()` — Returns score-tier counts from chat_analysis
  - `get_hourly_chat_distribution()` — Returns chat counts grouped by Istanbul hour (last 30 days)
*/

CREATE OR REPLACE FUNCTION get_sentiment_distribution()
RETURNS TABLE(score_min int, score_max int, chat_count int)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    CASE
      WHEN overall_score >= 90 THEN 90
      WHEN overall_score >= 70 THEN 70
      WHEN overall_score >= 60 THEN 60
      WHEN overall_score >= 40 THEN 40
      WHEN overall_score >= 30 THEN 30
      ELSE 0
    END AS score_min,
    CASE
      WHEN overall_score >= 90 THEN 100
      WHEN overall_score >= 70 THEN 89
      WHEN overall_score >= 60 THEN 69
      WHEN overall_score >= 40 THEN 59
      WHEN overall_score >= 30 THEN 39
      ELSE 29
    END AS score_max,
    COUNT(*)::int AS chat_count
  FROM chat_analysis
  WHERE overall_score IS NOT NULL AND overall_score > 0
  GROUP BY score_min, score_max
  ORDER BY score_min DESC;
$$;

CREATE OR REPLACE FUNCTION get_hourly_chat_distribution(days_back int DEFAULT 30)
RETURNS TABLE(hour_of_day int, chat_count int)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Istanbul')::int AS hour_of_day,
    COUNT(*)::int AS chat_count
  FROM chats
  WHERE created_at >= NOW() - (days_back || ' days')::interval
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
$$;
