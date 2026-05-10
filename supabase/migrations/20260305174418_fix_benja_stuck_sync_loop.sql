/*
  # Fix Marka Benja Stuck Sync Loop

  ## Problem
  Marka Benja has been stuck in an infinite retry loop because:
  1. Every sync job times out (edge function fetches from LiveChat API with no timeout, so it hangs indefinitely)
  2. When the function is killed by Supabase wall-clock limit, the job stays "processing"
  3. last_sync_at is NEVER updated (only updated on successful completion)
  4. Next job falls back to NULL → uses now-10min window → same issue repeats

  ## Changes
  1. Mark any stuck processing/pending Benja jobs as failed
  2. Set last_sync_at for Marka Benja to NOW so the next cron run starts
     from a tiny recent window (2 minutes of data) instead of null-fallback
  3. This breaks the infinite loop immediately

  ## Brands
  - Marka Benja brand_id: 00000000-0000-0000-0000-000000000001
*/

-- 1. Clear any stuck jobs for Marka Benja
UPDATE sync_jobs
SET 
  status = 'failed',
  completed_at = now(),
  error = 'Manually cleared - stuck in processing loop, last_sync_at reset to break cycle'
WHERE brand_id = '00000000-0000-0000-0000-000000000001'
  AND status IN ('processing', 'pending');

-- 2. Set last_sync_at for Marka Benja to now so next cron uses a small recent window
UPDATE brands
SET last_sync_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
