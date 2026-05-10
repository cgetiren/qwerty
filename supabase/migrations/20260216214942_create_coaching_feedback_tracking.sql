/*
  # Coaching Feedback Tracking System

  1. New Tables
    - `coaching_feedbacks`
      - `id` (uuid, primary key)
      - `chat_id` (text, reference to chats)
      - `agent_name` (text)
      - `agent_email` (text)
      - `coaching_suggestion` (text)
      - `sent_at` (timestamptz) - when the coaching was sent
      - `sent_by` (uuid) - user who sent the feedback
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `coaching_feedbacks` table
    - Add policy for authenticated users to read all coaching feedbacks
    - Add policy for authenticated users to insert coaching feedbacks
    - Add policy for authenticated users to update their own sent feedbacks

  3. Indexes
    - Index on chat_id for faster lookups
    - Index on agent_email for personnel tracking
    - Index on sent_at for time-based queries

  4. Important Notes
    - This table tracks which coaching suggestions have been sent to personnel
    - Used for measuring personnel improvement over time
    - Helps distinguish between new and already-sent coaching suggestions
*/

CREATE TABLE IF NOT EXISTS coaching_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  agent_name text NOT NULL,
  agent_email text NOT NULL,
  coaching_suggestion text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE coaching_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all coaching feedbacks"
  ON coaching_feedbacks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert coaching feedbacks"
  ON coaching_feedbacks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sent_by);

CREATE POLICY "Users can update their own coaching feedbacks"
  ON coaching_feedbacks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sent_by)
  WITH CHECK (auth.uid() = sent_by);

CREATE INDEX IF NOT EXISTS idx_coaching_feedbacks_chat_id ON coaching_feedbacks(chat_id);
CREATE INDEX IF NOT EXISTS idx_coaching_feedbacks_agent_email ON coaching_feedbacks(agent_email);
CREATE INDEX IF NOT EXISTS idx_coaching_feedbacks_sent_at ON coaching_feedbacks(sent_at);

CREATE OR REPLACE FUNCTION get_personnel_improvement_report(
  p_agent_email text,
  p_days_before int DEFAULT 30,
  p_days_after int DEFAULT 30
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_coaching_date timestamptz;
  v_before_stats json;
  v_after_stats json;
  v_result json;
BEGIN
  SELECT MIN(sent_at) INTO v_first_coaching_date
  FROM coaching_feedbacks
  WHERE agent_email = p_agent_email;

  IF v_first_coaching_date IS NULL THEN
    RETURN json_build_object(
      'has_data', false,
      'message', 'No coaching feedback found for this agent'
    );
  END IF;

  SELECT json_build_object(
    'average_score', COALESCE(AVG(average_score), 0),
    'total_chats', COALESCE(SUM(total_chats), 0),
    'average_response_time', COALESCE(AVG(average_response_time), 0),
    'average_resolution_time', COALESCE(AVG(average_resolution_time), 0),
    'total_analysis_score', COALESCE(AVG(total_analysis_score), 0)
  ) INTO v_before_stats
  FROM personnel_daily_stats
  WHERE agent_email = p_agent_email
    AND date >= (v_first_coaching_date - (p_days_before || ' days')::interval)::date
    AND date < v_first_coaching_date::date;

  SELECT json_build_object(
    'average_score', COALESCE(AVG(average_score), 0),
    'total_chats', COALESCE(SUM(total_chats), 0),
    'average_response_time', COALESCE(AVG(average_response_time), 0),
    'average_resolution_time', COALESCE(AVG(average_resolution_time), 0),
    'total_analysis_score', COALESCE(AVG(total_analysis_score), 0)
  ) INTO v_after_stats
  FROM personnel_daily_stats
  WHERE agent_email = p_agent_email
    AND date >= v_first_coaching_date::date
    AND date <= (v_first_coaching_date + (p_days_after || ' days')::interval)::date;

  RETURN json_build_object(
    'has_data', true,
    'agent_email', p_agent_email,
    'first_coaching_date', v_first_coaching_date,
    'before_coaching', v_before_stats,
    'after_coaching', v_after_stats,
    'total_coaching_sent', (
      SELECT COUNT(*) FROM coaching_feedbacks WHERE agent_email = p_agent_email
    )
  );
END;
$$;