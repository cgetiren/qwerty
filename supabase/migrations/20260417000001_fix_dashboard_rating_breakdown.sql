-- Fix: Dashboard rating breakdown - separate likes, dislikes, and commented ratings
-- Previously counted all rating_score >= 4 as likes (including rated_commented)
-- Now uses rating_status to match API provider's counts exactly

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
  v_unique_chats bigint;
  v_analyzed_chats bigint;
  v_avg_score numeric;
  v_avg_response_time numeric;
  v_total_likes bigint;
  v_total_dislikes bigint;
  v_total_commented bigint;
  v_commented_likes bigint;
  v_commented_dislikes bigint;
  v_missed_chats bigint;
  v_total_personnel bigint;
  v_pending_alerts bigint;
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start_ts := (p_start_date || 'T00:00:00')::timestamp AT TIME ZONE 'Europe/Istanbul';
    v_end_ts := (p_end_date || 'T23:59:59')::timestamp AT TIME ZONE 'Europe/Istanbul';
  ELSE
    v_start_ts := now() - (p_days_back || ' days')::interval;
    v_end_ts := now();
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT customer_name)
  INTO v_total_chats, v_unique_chats
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

  -- Rating breakdown: status bazli (API ile birebir eslesir)
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE rating_status = 'rated_good'), 0),
    COALESCE(COUNT(*) FILTER (WHERE rating_status = 'rated_bad'), 0),
    COALESCE(COUNT(*) FILTER (WHERE rating_status = 'rated_commented'), 0),
    COALESCE(COUNT(*) FILTER (WHERE rating_status = 'rated_commented' AND rating_score IS NOT NULL AND rating_score >= 4), 0),
    COALESCE(COUNT(*) FILTER (WHERE rating_status = 'rated_commented' AND rating_score IS NOT NULL AND rating_score <= 2), 0)
  INTO v_total_likes, v_total_dislikes, v_total_commented, v_commented_likes, v_commented_dislikes
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
    'unique_chats', v_unique_chats,
    'analyzed_chats', v_analyzed_chats,
    'avg_score', ROUND(v_avg_score, 1),
    'avg_response_time', ROUND(v_avg_response_time, 0),
    'total_likes', v_total_likes,
    'total_dislikes', v_total_dislikes,
    'total_commented', v_total_commented,
    'commented_likes', v_commented_likes,
    'commented_dislikes', v_commented_dislikes,
    'missed_chats', v_missed_chats,
    'total_personnel', v_total_personnel,
    'pending_alerts', v_pending_alerts
  );
END;
$$;
