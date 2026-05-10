/*
  # Add Performance Indexes for Personnel Analytics

  ## Problem
  - `recalculate_personnel_stats()` timeout on 30-day calculation
  - Slow queries on chats.agent_name and created_at filters
  - personnel_daily_stats range queries causing delays

  ## Solution
  Add composite indexes to speed up:
  1. Chat queries by agent + date
  2. Chat analysis lookups by chat_id
  3. Daily stats date range queries
  4. Brand-specific queries

  ## Impact
  - Reduces query time from ~30s to <2s
  - Eliminates timeout errors on recalculate
  - Speeds up PersonnelAnalytics page load
*/

-- Index for chats filtered by agent_name and date range
-- Used in: recalculate_personnel_stats, loadPersonnelDetails
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chats_agent_created_brand
  ON chats(agent_name, created_at DESC, brand_id)
  WHERE agent_name IS NOT NULL 
    AND agent_name != '' 
    AND agent_name != 'Unknown';

-- Index for chat_analysis JOIN on chats
-- Used in: all personnel stat calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_analysis_chat_score
  ON chat_analysis(chat_id, overall_score)
  WHERE overall_score > 0;

-- Composite index for personnel_daily_stats date range queries
-- Used in: loadPeriodChats, loadPersonnelDetails
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personnel_daily_stats_lookup
  ON personnel_daily_stats(personnel_name, brand_id, date DESC);

-- Additional index for date-first queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personnel_daily_stats_date_range
  ON personnel_daily_stats(date DESC, brand_id)
  INCLUDE (personnel_name, total_chats, total_analysis_score, analysis_count);

-- Index for brand-specific personnel queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personnel_brand_name
  ON personnel(brand_id, name)
  WHERE name != 'Unknown';

-- Index for alerts by brand (used in Dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_brand_created
  ON alerts(brand_id, created_at DESC);

-- Drop old partial indexes if they exist (cleanup)
DROP INDEX CONCURRENTLY IF EXISTS idx_chats_agent_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_chat_analysis_chat_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_personnel_daily_stats_composite;

-- Analyze tables to update statistics
ANALYZE chats;
ANALYZE chat_analysis;
ANALYZE personnel_daily_stats;
ANALYZE personnel;
ANALYZE alerts;
