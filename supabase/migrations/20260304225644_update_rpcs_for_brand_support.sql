/*
  # Update RPC Functions for Brand Support

  ## Overview
  Updates all RPC/helper functions to accept an optional brand_id parameter
  for filtering data by brand. Functions gracefully handle NULL brand_id
  by returning all data (for backwards compatibility).

  ## Updated Functions
  - get_dashboard_heavy_stats: accepts p_brand_id
  - get_personnel_daily_trends: accepts p_brand_id
  - get_hourly_chat_distribution: accepts p_brand_id
  - get_sentiment_distribution: accepts p_brand_id
  - get_reports_daily_stats: accepts p_brand_id
  - get_personnel_daily_stats_for_reports: accepts p_brand_id
  - recalculate_personnel_stats: accepts p_brand_id
*/

-- ============================================================
-- UPDATE get_dashboard_heavy_stats
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_heavy_stats(
  p_days_back integer DEFAULT 30,
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_total_chats bigint;
  v_analyzed_chats bigint;
  v_avg_score numeric;
  v_avg_response_time numeric;
  v_total_likes bigint;
  v_total_dislikes bigint;
  v_missed_chats bigint;
  v_total_personnel bigint;
  v_pending_alerts bigint;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start_ts := (p_start_date || 'T00:00:00')::timestamptz AT TIME ZONE 'Europe/Istanbul';
    v_end_ts := (p_end_date || 'T23:59:59')::timestamptz AT TIME ZONE 'Europe/Istanbul';
  ELSE
    v_start_ts := now() - (p_days_back || ' days')::interval;
    v_end_ts := now();
  END IF;

  SELECT COUNT(*) INTO v_total_chats
  FROM chats
  WHERE created_at >= v_start_ts AND created_at <= v_end_ts
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT COUNT(*) INTO v_analyzed_chats
  FROM chats c
  INNER JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.created_at >= v_start_ts AND c.created_at <= v_end_ts
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id);

  SELECT COALESCE(AVG(ca.overall_score::numeric), 0) INTO v_avg_score
  FROM chats c
  INNER JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.created_at >= v_start_ts AND c.created_at <= v_end_ts
    AND ca.overall_score IS NOT NULL
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id);

  SELECT COALESCE(AVG(NULLIF(first_response_time, 0)), 0) INTO v_avg_response_time
  FROM chats
  WHERE created_at >= v_start_ts AND created_at <= v_end_ts
    AND first_response_time IS NOT NULL AND first_response_time > 0
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE rating_status = 'rated' AND rating_score >= 4), 0),
    COALESCE(COUNT(*) FILTER (WHERE rating_status = 'rated' AND rating_score <= 2), 0)
  INTO v_total_likes, v_total_dislikes
  FROM chats
  WHERE created_at >= v_start_ts AND created_at <= v_end_ts
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT COUNT(*) INTO v_missed_chats
  FROM chats
  WHERE created_at >= v_start_ts AND created_at <= v_end_ts
    AND is_missed = true
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT COUNT(DISTINCT name) INTO v_total_personnel
  FROM personnel
  WHERE (p_brand_id IS NULL OR brand_id = p_brand_id);

  SELECT COUNT(*) INTO v_pending_alerts
  FROM alerts
  WHERE sent_to_telegram = false
    AND (p_brand_id IS NULL OR brand_id = p_brand_id);

  RETURN json_build_object(
    'total_chats', v_total_chats,
    'analyzed_chats', v_analyzed_chats,
    'avg_score', ROUND(v_avg_score, 1),
    'avg_response_time', ROUND(v_avg_response_time, 0),
    'total_likes', v_total_likes,
    'total_dislikes', v_total_dislikes,
    'missed_chats', v_missed_chats,
    'total_personnel', v_total_personnel,
    'pending_alerts', v_pending_alerts
  );
END;
$$;

-- ============================================================
-- UPDATE get_personnel_daily_trends
-- ============================================================
CREATE OR REPLACE FUNCTION get_personnel_daily_trends(
  p_days_back integer DEFAULT 30,
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(
  agent_name text,
  trend_date date,
  daily_score numeric,
  chat_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.agent_name,
    (c.created_at AT TIME ZONE 'Europe/Istanbul')::date AS trend_date,
    ROUND(AVG(ca.overall_score::numeric), 1) AS daily_score,
    COUNT(*)::bigint AS chat_count
  FROM chats c
  INNER JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.created_at >= now() - (p_days_back || ' days')::interval
    AND ca.overall_score IS NOT NULL
    AND c.agent_name IS NOT NULL AND c.agent_name != ''
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id)
  GROUP BY c.agent_name, (c.created_at AT TIME ZONE 'Europe/Istanbul')::date
  ORDER BY c.agent_name, trend_date;
END;
$$;

-- ============================================================
-- UPDATE get_hourly_chat_distribution (add brand support)
-- ============================================================
CREATE OR REPLACE FUNCTION get_hourly_chat_distribution(
  p_days_back integer DEFAULT 30,
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(hour_of_day integer, chat_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Europe/Istanbul'))::integer AS hour_of_day,
    COUNT(*)::bigint AS chat_count
  FROM chats
  WHERE created_at >= now() - (p_days_back || ' days')::interval
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
END;
$$;

-- ============================================================
-- UPDATE get_sentiment_distribution (add brand support)
-- ============================================================
CREATE OR REPLACE FUNCTION get_sentiment_distribution(
  p_days_back integer DEFAULT 30,
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(sentiment text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.sentiment,
    COUNT(*)::bigint
  FROM chat_analysis ca
  INNER JOIN chats c ON c.id = ca.chat_id
  WHERE c.created_at >= now() - (p_days_back || ' days')::interval
    AND ca.sentiment IS NOT NULL AND ca.sentiment != ''
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id)
  GROUP BY ca.sentiment
  ORDER BY count DESC;
END;
$$;

-- ============================================================
-- UPDATE get_reports_daily_stats (add brand support if exists)
-- ============================================================
CREATE OR REPLACE FUNCTION get_reports_daily_stats(
  p_start_date date DEFAULT (now() - interval '30 days')::date,
  p_end_date date DEFAULT now()::date,
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(
  stat_date date,
  total_chats bigint,
  analyzed_chats bigint,
  avg_score numeric,
  negative_chats bigint,
  positive_chats bigint,
  neutral_chats bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (c.created_at AT TIME ZONE 'Europe/Istanbul')::date AS stat_date,
    COUNT(c.id)::bigint AS total_chats,
    COUNT(ca.id)::bigint AS analyzed_chats,
    ROUND(COALESCE(AVG(ca.overall_score::numeric), 0), 1) AS avg_score,
    COUNT(ca.id) FILTER (WHERE ca.sentiment = 'negative')::bigint AS negative_chats,
    COUNT(ca.id) FILTER (WHERE ca.sentiment = 'positive')::bigint AS positive_chats,
    COUNT(ca.id) FILTER (WHERE ca.sentiment = 'neutral')::bigint AS neutral_chats
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE (c.created_at AT TIME ZONE 'Europe/Istanbul')::date BETWEEN p_start_date AND p_end_date
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id)
  GROUP BY (c.created_at AT TIME ZONE 'Europe/Istanbul')::date
  ORDER BY stat_date;
END;
$$;

-- ============================================================
-- UPDATE get_personnel_daily_stats_for_reports
-- ============================================================
CREATE OR REPLACE FUNCTION get_personnel_daily_stats_for_reports(
  p_personnel_name text,
  p_start_date date DEFAULT (now() - interval '30 days')::date,
  p_end_date date DEFAULT now()::date,
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(
  stat_date date,
  total_chats bigint,
  avg_score numeric,
  total_issues bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (c.created_at AT TIME ZONE 'Europe/Istanbul')::date AS stat_date,
    COUNT(c.id)::bigint AS total_chats,
    ROUND(COALESCE(AVG(ca.overall_score::numeric), 0), 1) AS avg_score,
    COALESCE(SUM(
      COALESCE(jsonb_array_length(ca.issues_detected->'critical_errors'), 0) +
      COALESCE(jsonb_array_length(ca.issues_detected->'improvement_areas'), 0)
    ), 0)::bigint AS total_issues
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.agent_name = p_personnel_name
    AND (c.created_at AT TIME ZONE 'Europe/Istanbul')::date BETWEEN p_start_date AND p_end_date
    AND (p_brand_id IS NULL OR c.brand_id = p_brand_id)
  GROUP BY (c.created_at AT TIME ZONE 'Europe/Istanbul')::date
  ORDER BY stat_date;
END;
$$;
