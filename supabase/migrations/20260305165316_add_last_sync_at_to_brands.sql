/*
  # Add last_sync_at to brands table

  ## Summary
  Adds a `last_sync_at` timestamp column to the `brands` table to track when
  each brand was last successfully synced from LiveChat API.

  ## Changes
  - `brands` table: Add `last_sync_at` (timestamptz, nullable) column
    - Stores the end_date of the most recently completed successful sync job
    - Used by the cron function to determine the start of the next sync window
    - Prevents re-fetching already synced data
    - Falls back to now() - 10 minutes if NULL (first sync for a brand)

  ## Notes
  - Column is nullable: NULL means the brand has never been synced
  - Updated by sync-livechat edge function after each successful sync
  - Enables smart incremental sync: each run only fetches new data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'last_sync_at'
  ) THEN
    ALTER TABLE brands ADD COLUMN last_sync_at timestamptz;
  END IF;
END $$;
