/*
  # Add get_average_score function

  1. Functions
    - `get_average_score()` - Returns the average overall_score from chat_analysis table

  2. Purpose
    - Provides accurate average score calculation for dashboard
    - Avoids duplicate counting issues
*/

-- Create function to get average score
CREATE OR REPLACE FUNCTION get_average_score()
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(AVG(overall_score), 0)
  FROM chat_analysis;
$$;
