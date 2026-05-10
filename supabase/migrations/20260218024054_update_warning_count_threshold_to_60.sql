/*
  # Update warning_count threshold from 50 to 60

  ## Summary
  Updates the recalculate_personnel_stats function to use the new score threshold.
  Previously chats with overall_score < 50 were counted as warnings.
  Now chats with overall_score < 60 are counted as warnings, aligned with the new score ranges:
    - 0-30: Kritik
    - 30-40: Dikkat
    - 40-60: Olumsuz
    - 60-70: Orta
    - 70-90: İyi
    - 90-100: Mükemmel
*/

CREATE OR REPLACE FUNCTION recalculate_personnel_stats(p_agent_name text, p_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_chats integer;
  v_avg_score numeric;
  v_warning_count integer;
  v_positive_count integer;
  v_negative_count integer;
  v_avg_response_time numeric;
BEGIN
  SELECT
    COUNT(DISTINCT c.id),
    AVG(ca.overall_score),
    COUNT(DISTINCT CASE WHEN ca.overall_score < 60 THEN c.id END),
    COUNT(DISTINCT CASE WHEN ca.sentiment = 'positive' THEN c.id END),
    COUNT(DISTINCT CASE WHEN ca.sentiment = 'negative' THEN c.id END),
    AVG(ca.first_response_time)
  INTO
    v_total_chats, v_avg_score, v_warning_count,
    v_positive_count, v_negative_count, v_avg_response_time
  FROM chats c
  LEFT JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.agent_name = p_agent_name
    AND DATE(c.created_at AT TIME ZONE 'Europe/Istanbul') = p_date
    AND ca.overall_score IS NOT NULL
    AND ca.overall_score > 0;

  INSERT INTO personnel_daily_stats (
    agent_name, stat_date, total_chats, avg_score,
    warning_count, positive_count, negative_count, avg_response_time, updated_at
  )
  VALUES (
    p_agent_name, p_date, COALESCE(v_total_chats, 0),
    COALESCE(v_avg_score, 0), COALESCE(v_warning_count, 0),
    COALESCE(v_positive_count, 0), COALESCE(v_negative_count, 0),
    COALESCE(v_avg_response_time, 0), NOW()
  )
  ON CONFLICT (agent_name, stat_date)
  DO UPDATE SET
    total_chats = EXCLUDED.total_chats,
    avg_score = EXCLUDED.avg_score,
    warning_count = EXCLUDED.warning_count,
    positive_count = EXCLUDED.positive_count,
    negative_count = EXCLUDED.negative_count,
    avg_response_time = EXCLUDED.avg_response_time,
    updated_at = NOW();
END;
$$;
