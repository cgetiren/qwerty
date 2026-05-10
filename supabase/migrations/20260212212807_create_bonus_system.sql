/*
  # Create Bonus System

  1. New Tables
    - `bonus_rules`
      - `id` (uuid, primary key)
      - `rule_name` (text) - Descriptive name for the rule
      - `metric_type` (text) - Which metric to evaluate (total_chats, avg_score, avg_satisfaction, etc.)
      - `condition_type` (text) - Comparison type (greater_than, less_than, between)
      - `threshold_min` (numeric) - Minimum threshold value
      - `threshold_max` (numeric) - Maximum threshold value (for 'between' condition)
      - `bonus_amount` (numeric) - Bonus amount in currency
      - `period_type` (text) - Calculation period (daily, weekly, monthly)
      - `is_active` (boolean) - Whether rule is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `bonus_calculations`
      - `id` (uuid, primary key)
      - `personnel_id` (uuid, foreign key to personnel)
      - `period_type` (text) - daily, weekly, monthly
      - `period_start` (timestamptz) - Start of calculation period
      - `period_end` (timestamptz) - End of calculation period
      - `total_bonus_amount` (numeric) - Total bonus earned
      - `calculation_details` (jsonb) - Detailed breakdown of which rules contributed
      - `metrics_snapshot` (jsonb) - Snapshot of metrics used in calculation
      - `calculated_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage rules
    - Add policies for viewing calculations

  3. Indexes
    - Add indexes for common queries on bonus_calculations
*/

-- Create bonus_rules table
CREATE TABLE IF NOT EXISTS bonus_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  metric_type text NOT NULL,
  condition_type text NOT NULL CHECK (condition_type IN ('greater_than', 'less_than', 'between', 'equals')),
  threshold_min numeric NOT NULL,
  threshold_max numeric,
  bonus_amount numeric NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create bonus_calculations table
CREATE TABLE IF NOT EXISTS bonus_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_bonus_amount numeric DEFAULT 0,
  calculation_details jsonb DEFAULT '[]'::jsonb,
  metrics_snapshot jsonb DEFAULT '{}'::jsonb,
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(personnel_id, period_type, period_start, period_end)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bonus_calculations_personnel ON bonus_calculations(personnel_id);
CREATE INDEX IF NOT EXISTS idx_bonus_calculations_period ON bonus_calculations(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_bonus_calculations_period_type ON bonus_calculations(period_type);
CREATE INDEX IF NOT EXISTS idx_bonus_rules_active ON bonus_rules(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE bonus_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_calculations ENABLE ROW LEVEL SECURITY;

-- Policies for bonus_rules (all authenticated users can manage rules)
CREATE POLICY "Authenticated users can view bonus rules"
  ON bonus_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bonus rules"
  ON bonus_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bonus rules"
  ON bonus_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete bonus rules"
  ON bonus_rules FOR DELETE
  TO authenticated
  USING (true);

-- Policies for bonus_calculations
CREATE POLICY "Authenticated users can view all bonus calculations"
  ON bonus_calculations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bonus calculations"
  ON bonus_calculations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bonus calculations"
  ON bonus_calculations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete bonus calculations"
  ON bonus_calculations FOR DELETE
  TO authenticated
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bonus_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS bonus_rules_updated_at ON bonus_rules;
CREATE TRIGGER bonus_rules_updated_at
  BEFORE UPDATE ON bonus_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_bonus_rules_updated_at();