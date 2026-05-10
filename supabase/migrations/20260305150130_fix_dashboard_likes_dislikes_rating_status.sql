/*
  # Fix Dashboard Likes/Dislikes Calculation

  ## Problem
  The get_dashboard_heavy_stats function (parameterized version) used
  `rating_status = 'rated'` as a filter condition for counting likes/dislikes.
  However, the actual data uses 'rated_good', 'rated_bad', and 'rated_commented'
  as rating_status values — none of which match 'rated'.
  This caused total_likes and total_dislikes to always return 0.

  ## Fix
  Replace `rating_status = 'rated'` with `rating_score IS NOT NULL AND rating_score > 0`
  to correctly count all rated chats.

  - Likes: rating_score >= 4 (score of 5)
  - Dislikes: rating_score <= 2 (score of 1)
*/

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
    COALESCE(COUNT(*) FILTER (WHERE rating_score IS NOT NULL AND rating_score >= 4), 0),
    COALESCE(COUNT(*) FILTER (WHERE rating_score IS NOT NULL AND rating_score > 0 AND rating_score <= 2), 0)
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
