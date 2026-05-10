/*
  # Add Helper Functions

  ## New Functions
  
  1. `upsert_daily_stats`
     - Inserts or updates personnel daily statistics
     - Parameters:
       - p_personnel_name: text
       - p_date: date
       - p_score: numeric
       - p_response_time: integer
     - Used by the analyze-chat edge function to update daily stats
*/

CREATE OR REPLACE FUNCTION upsert_daily_stats(
  p_personnel_name text,
  p_date date,
  p_score numeric,
  p_response_time integer
) RETURNS void AS $$
DECLARE
  v_current_chats integer;
  v_current_avg numeric;
BEGIN
  SELECT total_chats, average_score
  INTO v_current_chats, v_current_avg
  FROM personnel_daily_stats
  WHERE personnel_name = p_personnel_name AND date = p_date;

  IF FOUND THEN
    UPDATE personnel_daily_stats
    SET 
      total_chats = v_current_chats + 1,
      average_score = ((v_current_avg * v_current_chats) + p_score) / (v_current_chats + 1),
      average_response_time = ((average_response_time * v_current_chats) + p_response_time) / (v_current_chats + 1)
    WHERE personnel_name = p_personnel_name AND date = p_date;
  ELSE
    INSERT INTO personnel_daily_stats (personnel_name, date, total_chats, average_score, average_response_time)
    VALUES (p_personnel_name, p_date, 1, p_score, p_response_time);
  END IF;
END;
$$ LANGUAGE plpgsql;