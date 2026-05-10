/*
  # Fix callback_settings unique constraint for multi-brand support

  ## Summary
  The original unique constraint on callback_settings was on (category) alone,
  which prevents multiple brands from having the same category.

  This migration:
  1. Drops the old single-column unique constraint
  2. Adds a new composite unique constraint on (category, brand_id)
  3. Copies Marka Benja callback settings to MarkBia
  4. Backfills brand_id for callback_requests with NULL brand_id
*/

-- 1. Drop old unique constraint on category alone
ALTER TABLE callback_settings
  DROP CONSTRAINT IF EXISTS callback_settings_category_key;

-- 2. Add composite unique constraint on (category, brand_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'callback_settings_category_brand_id_key'
  ) THEN
    ALTER TABLE callback_settings
      ADD CONSTRAINT callback_settings_category_brand_id_key
      UNIQUE (category, brand_id);
  END IF;
END $$;

-- 3. Copy callback settings from Marka Benja to MarkBia
INSERT INTO callback_settings (category, label, keywords, send_telegram, min_urgency_for_alert, is_active, brand_id)
SELECT
  cs.category,
  cs.label,
  cs.keywords,
  cs.send_telegram,
  cs.min_urgency_for_alert,
  cs.is_active,
  'c1fbe05a-a1f0-4811-af59-6aa8c79032ba' AS brand_id
FROM callback_settings cs
WHERE cs.brand_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (category, brand_id) DO NOTHING;

-- 4. Backfill brand_id for callback_requests that have NULL brand_id
UPDATE callback_requests cr
SET brand_id = c.brand_id
FROM chats c
WHERE cr.chat_id = c.id
  AND cr.brand_id IS NULL
  AND c.brand_id IS NOT NULL;
