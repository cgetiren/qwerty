/*
  # Fix coaching_feedbacks Table - Make chat_id and agent_email Nullable

  1. Problem
    - coaching_feedbacks.chat_id was storing fake values like "manual_1234567890"
      because coaching sessions are about a person, not a specific single chat
    - coaching_feedbacks.agent_email was storing fabricated emails like
      "ad.soyad@company.com" because the system doesn't track agent emails
    - These fake values create dirty/misleading data in the database

  2. Solution
    - Make chat_id nullable (coaching session records are not tied to one chat)
    - Make agent_email nullable (we don't have real agent emails in the system)
    - Clean up existing fake data: set chat_id to NULL where it starts with "manual_"
    - Clean up existing fake data: set agent_email to NULL where it ends with "@company.com"

  3. No Data Loss
    - All real coaching history records (agent_name, sent_at, coaching_suggestion) are preserved
    - Only the fabricated/placeholder values are nulled out
*/

-- Make chat_id nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coaching_feedbacks' AND column_name = 'chat_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE coaching_feedbacks ALTER COLUMN chat_id DROP NOT NULL;
  END IF;
END $$;

-- Make agent_email nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coaching_feedbacks' AND column_name = 'agent_email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE coaching_feedbacks ALTER COLUMN agent_email DROP NOT NULL;
  END IF;
END $$;

-- Clean up existing fake chat_ids (manual_*)
UPDATE coaching_feedbacks
SET chat_id = NULL
WHERE chat_id LIKE 'manual_%';

-- Clean up existing fabricated emails (@company.com)
UPDATE coaching_feedbacks
SET agent_email = NULL
WHERE agent_email LIKE '%@company.com';
