-- Performance Indexes for Personnel Analytics
-- Run this in Supabase SQL Editor

-- 1. Index for chats by agent + date + brand
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chats_agent_created_brand
  ON chats(agent_name, created_at DESC, brand_id)
  WHERE agent_name IS NOT NULL 
    AND agent_name != '' 
    AND agent_name != 'Unknown';

-- 2. Index for chat_analysis JOIN
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_analysis_chat_score
  ON chat_analysis(chat_id, overall_score)
  WHERE overall_score > 0;

-- 3. Personnel daily stats by name + brand + date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personnel_daily_stats_lookup
  ON personnel_daily_stats(personnel_name, brand_id, date DESC);

-- 4. Personnel daily stats by date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personnel_daily_stats_date_range
  ON personnel_daily_stats(date DESC, brand_id)
  INCLUDE (personnel_name, total_chats, total_analysis_score, analysis_count);

-- 5. Personnel by brand
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personnel_brand_name
  ON personnel(brand_id, name)
  WHERE name != 'Unknown';

-- 6. Alerts by brand + date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_brand_created
  ON alerts(brand_id, created_at DESC);

-- Update statistics
ANALYZE chats;
ANALYZE chat_analysis;
ANALYZE personnel_daily_stats;
ANALYZE personnel;
ANALYZE alerts;

-- Check index creation status
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND schemaname = 'public'
ORDER BY tablename, indexname;
