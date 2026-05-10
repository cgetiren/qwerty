-- Create sync_jobs table for background sync tracking
--
-- 1. New Tables
--    - sync_jobs: Track background synchronization jobs
--      - id (uuid, primary key): Unique job identifier
--      - status (text): Job status - pending, processing, completed, failed
--      - start_date (timestamptz): Sync start date parameter
--      - end_date (timestamptz): Sync end date parameter
--      - days (integer, nullable): Days parameter (alternative to date range)
--      - result (jsonb, nullable): Job result data when completed
--      - error (text, nullable): Error message if failed
--      - created_at (timestamptz): Job creation time
--      - started_at (timestamptz, nullable): Job processing start time
--      - completed_at (timestamptz, nullable): Job completion time
--      - created_by (uuid, nullable): User who created the job
--
-- 2. Security
--    - Enable RLS on sync_jobs table
--    - Add policy for authenticated users to read all sync jobs
--    - Add policy for service role to manage sync jobs
--
-- 3. Indexes
--    - Index on status for efficient filtering
--    - Index on created_at for sorting

CREATE TABLE IF NOT EXISTS sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  days integer,
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid
);

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all sync jobs"
  ON sync_jobs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage sync jobs"
  ON sync_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON sync_jobs(created_at DESC);