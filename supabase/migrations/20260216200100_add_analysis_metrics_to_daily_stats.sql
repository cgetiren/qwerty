/*
  # Add Analysis Metrics to Personnel Daily Stats

  1. Changes
    - Add `total_analysis_score` column to track cumulative analysis scores
    - Add `analysis_count` column to track number of analyzed chats
    
  2. Purpose
    - Enable tracking of analysis scores separately from personnel scores
    - Support detailed reporting with both analysis and personnel metrics
*/

-- Add analysis metrics columns
ALTER TABLE personnel_daily_stats 
ADD COLUMN IF NOT EXISTS total_analysis_score integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS analysis_count integer DEFAULT 0;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_personnel_daily_stats_date 
ON personnel_daily_stats(date DESC);
