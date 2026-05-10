/*
  # Add Rating Columns to Chats Table

  ## Changes
  Add rating and survey information columns to the chats table to track customer satisfaction:
  
  1. New Columns
    - `rating_score` (integer) - Customer rating score (typically 1-5 or null if not rated)
    - `rating_status` (text) - Rating status: 'rated', 'not_rated', etc.
    - `rating_comment` (text) - Customer's rating comment/feedback
    - `has_rating_comment` (boolean) - Whether customer left a comment
    - `complaint_flag` (boolean) - Whether chat was flagged as complaint
  
  2. Purpose
    - Track customer satisfaction through ratings
    - Monitor service quality metrics
    - Identify complaints that need attention
    - Enable filtering by satisfaction level
  
  ## Notes
  - All columns are nullable as not all chats have ratings
  - Default values set appropriately for boolean fields
*/

-- Add rating columns to chats table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chats' AND column_name = 'rating_score'
  ) THEN
    ALTER TABLE chats ADD COLUMN rating_score integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chats' AND column_name = 'rating_status'
  ) THEN
    ALTER TABLE chats ADD COLUMN rating_status text DEFAULT 'not_rated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chats' AND column_name = 'rating_comment'
  ) THEN
    ALTER TABLE chats ADD COLUMN rating_comment text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chats' AND column_name = 'has_rating_comment'
  ) THEN
    ALTER TABLE chats ADD COLUMN has_rating_comment boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'chats' AND column_name = 'complaint_flag'
  ) THEN
    ALTER TABLE chats ADD COLUMN complaint_flag boolean DEFAULT false;
  END IF;
END $$;

-- Create index for rating queries
CREATE INDEX IF NOT EXISTS idx_chats_rating_score ON chats(rating_score) WHERE rating_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chats_rating_status ON chats(rating_status);
CREATE INDEX IF NOT EXISTS idx_chats_complaint_flag ON chats(complaint_flag) WHERE complaint_flag = true;