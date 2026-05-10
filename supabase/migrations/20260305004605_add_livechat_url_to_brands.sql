/*
  # Add livechat_url to brands table

  ## Summary
  Each brand can have its own LiveChat server URL. This migration adds a
  `livechat_url` column to the `brands` table and populates the known values.

  ## Changes
  - `brands.livechat_url` (text, nullable) — the base URL of the brand's LiveChat server
    e.g. "https://livechat.systemtest.store"

  ## Data
  - Marka Benja → https://livechat.systemtest.store
  - MarkBia     → https://livechatbia.systemtest.store
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'livechat_url'
  ) THEN
    ALTER TABLE brands ADD COLUMN livechat_url text;
  END IF;
END $$;

UPDATE brands SET livechat_url = 'https://livechat.systemtest.store'    WHERE slug = 'markbenja';
UPDATE brands SET livechat_url = 'https://livechatbia.systemtest.store' WHERE slug = 'markbia';
