/*
  # Callback Call Logs & Assignment System

  1. Changes to `callback_requests`
     - `assigned_to_user_id` (uuid) - who is handling this request
     - `assigned_to_name` (text) - display name of assignee
     - `assigned_at` (timestamptz) - when it was assigned
     - `call_count` (int) - total number of call attempts logged
     - `last_called_at` (timestamptz) - when the last call attempt was made

  2. New Table: `callback_call_logs`
     - `id` (uuid PK)
     - `callback_request_id` (uuid FK → callback_requests)
     - `agent_user_id` (uuid FK → user_profiles)
     - `agent_name` (text)
     - `called_at` (timestamptz)
     - `outcome` (text) - answered, no_answer, busy, voicemail, wrong_number, callback_scheduled
     - `note` (text)
     - `created_at` (timestamptz)

  3. Security
     - RLS enabled on callback_call_logs
     - Authenticated users can read and insert
     - Users can only update/delete their own log entries
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'callback_requests' AND column_name = 'assigned_to_user_id'
  ) THEN
    ALTER TABLE callback_requests
      ADD COLUMN assigned_to_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
      ADD COLUMN assigned_to_name text,
      ADD COLUMN assigned_at timestamptz,
      ADD COLUMN call_count int NOT NULL DEFAULT 0,
      ADD COLUMN last_called_at timestamptz;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS callback_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  callback_request_id uuid NOT NULL REFERENCES callback_requests(id) ON DELETE CASCADE,
  agent_user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  agent_name text NOT NULL DEFAULT '',
  called_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL DEFAULT 'no_answer',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_callback_call_logs_request_id ON callback_call_logs(callback_request_id);
CREATE INDEX IF NOT EXISTS idx_callback_call_logs_called_at ON callback_call_logs(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_callback_call_logs_agent ON callback_call_logs(agent_user_id);

ALTER TABLE callback_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read call logs"
  ON callback_call_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert call logs"
  ON callback_call_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Agents can update their own call logs"
  ON callback_call_logs FOR UPDATE
  TO authenticated
  USING (agent_user_id = auth.uid())
  WITH CHECK (agent_user_id = auth.uid());

CREATE POLICY "Agents can delete their own call logs"
  ON callback_call_logs FOR DELETE
  TO authenticated
  USING (agent_user_id = auth.uid());
