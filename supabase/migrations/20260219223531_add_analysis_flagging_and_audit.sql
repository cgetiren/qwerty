/*
  # Add Analysis Flagging and Audit Columns

  ## Purpose
  Enables human oversight of AI-generated chat analysis by allowing managers to
  flag incorrect or disputed analyses. Adds audit trail fields to track when and
  why an analysis was flagged.

  ## Changes

  ### Modified Table: chat_analysis
  - `is_flagged` (boolean, default false) — Whether this analysis has been marked as disputed/incorrect by a human reviewer
  - `flag_reason` (text, nullable) — The reason provided by the reviewer when flagging this analysis
  - `flag_date` (timestamptz, nullable) — When the analysis was flagged
  - `flag_resolved` (boolean, default false) — Whether the flag has been reviewed and resolved
  - `flag_resolution_note` (text, nullable) — Notes from the resolution

  ## Security
  - Existing RLS policies on chat_analysis will cover these new columns automatically
  - No new policies needed

  ## Notes
  - This enables the "human override" capability needed for trustworthy AI-assisted systems
  - Flagged analyses can still be displayed but should be visually marked as disputed
  - All columns are nullable/default to avoid breaking existing records
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'is_flagged'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN is_flagged boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'flag_reason'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN flag_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'flag_date'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN flag_date timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'flag_resolved'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN flag_resolved boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_analysis' AND column_name = 'flag_resolution_note'
  ) THEN
    ALTER TABLE chat_analysis ADD COLUMN flag_resolution_note text;
  END IF;
END $$;
