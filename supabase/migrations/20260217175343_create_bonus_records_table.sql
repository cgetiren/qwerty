/*
  # Create Bonus Records Table

  ## Purpose
  This table stores finalized/saved bonus reports at the end of each period.
  - bonus_calculations: Temporary preview calculations (can be recalculated)
  - bonus_records: Final saved reports (permanent, historical)

  ## New Tables
  - `bonus_records`
    - `id` (uuid, primary key)
    - `personnel_id` (uuid, references personnel)
    - `personnel_name` (text, denormalized for historical accuracy)
    - `period_type` (text: daily/weekly/monthly)
    - `period_start` (timestamptz)
    - `period_end` (timestamptz)
    - `total_bonus_amount` (numeric)
    - `calculation_details` (jsonb, breakdown of rules applied)
    - `metrics_snapshot` (jsonb, personnel metrics at time of save)
    - `saved_at` (timestamptz, when the report was finalized)
    - `saved_by` (uuid, references auth.users, who saved it)
    - `notes` (text, optional notes)
    - `created_at` (timestamptz)

  ## Security
  - Enable RLS on bonus_records table
  - Only authenticated users can read bonus records
*/

-- Create bonus_records table
CREATE TABLE IF NOT EXISTS bonus_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id uuid REFERENCES personnel(id),
  personnel_name text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_bonus_amount numeric DEFAULT 0,
  calculation_details jsonb DEFAULT '[]'::jsonb,
  metrics_snapshot jsonb DEFAULT '{}'::jsonb,
  saved_at timestamptz DEFAULT now(),
  saved_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(personnel_id, period_type, period_start, period_end)
);

-- Enable RLS
ALTER TABLE bonus_records ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read bonus records
CREATE POLICY "Authenticated users can read bonus records"
  ON bonus_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert bonus records
CREATE POLICY "Authenticated users can insert bonus records"
  ON bonus_records
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_bonus_records_period ON bonus_records(period_type, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_bonus_records_personnel ON bonus_records(personnel_id);
CREATE INDEX IF NOT EXISTS idx_bonus_records_saved_at ON bonus_records(saved_at DESC);
