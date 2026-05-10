/*
  # Add Dashboard Heavy Stats RPC Function

  ## Summary
  Creates a server-side SQL function that computes all expensive dashboard metrics
  in a single database query, avoiding repeated batch fetches from the client
  that were causing statement timeout errors.

  ## New Functions
  - `get_dashboard_heavy_stats()` — Returns a JSON object with:
    - `avg_score`: Average overall_score from chat_analysis
    - `avg_response_time`: Average first_response_time from chats
    - `total_likes`: Count of chats with rating_score >= 4
    - `total_dislikes`: Count of chats with rating_score between 1 and 2
    - `unique_chats`: Count of distinct chat_id values in chats

  ## Performance Notes
  - All aggregations run as a single server-side SQL query
  - Eliminates the need for the client to page through thousands of rows
*/

CREATE OR REPLACE FUNCTION get_dashboard_heavy_stats()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
    score_stats AS (
      SELECT COALESCE(ROUND(AVG(overall_score)::numeric, 0)::int, 0) AS avg_score
      FROM chat_analysis
      WHERE overall_score IS NOT NULL AND overall_score > 0
    ),
    response_stats AS (
      SELECT COALESCE(ROUND(AVG(first_response_time)::numeric, 0)::int, 0) AS avg_response_time
      FROM chats
      WHERE first_response_time IS NOT NULL AND first_response_time > 0
    ),
    rating_stats AS (
      SELECT
        COUNT(CASE WHEN rating_score >= 4 THEN 1 END)::int AS total_likes,
        COUNT(CASE WHEN rating_score IS NOT NULL AND rating_score > 0 AND rating_score <= 2 THEN 1 END)::int AS total_dislikes
      FROM chats
    ),
    unique_stats AS (
      SELECT COUNT(DISTINCT chat_id)::int AS unique_chats_count
      FROM chats
    )
  SELECT json_build_object(
    'avg_score', score_stats.avg_score,
    'avg_response_time', response_stats.avg_response_time,
    'total_likes', rating_stats.total_likes,
    'total_dislikes', rating_stats.total_dislikes,
    'unique_chats', unique_stats.unique_chats_count
  )
  FROM score_stats, response_stats, rating_stats, unique_stats;
$$;
