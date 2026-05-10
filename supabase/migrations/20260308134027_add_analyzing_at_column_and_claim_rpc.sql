/*
  # Add analyzing_at Column and claim_unanalyzed_chats RPC

  ## Problem
  The analyze-chat edge function runs every 2 minutes via cron. There is no
  concurrency guard — if two invocations overlap, both query the same
  `analyzed = false` chats and send them to Claude API simultaneously,
  burning tokens for duplicate work.

  ## Solution
  1. Add `analyzing_at` (nullable timestamptz) to the `chats` table.
     This acts as a soft lock: when a job claims a chat for processing it
     sets this timestamp. Any concurrent job will skip chats that have been
     claimed in the last 10 minutes. If the job crashes or times out, the
     lock expires automatically after 10 minutes.

  2. Create `claim_unanalyzed_chats(p_limit)` — an atomic UPDATE…RETURNING
     RPC that claims up to `p_limit` chats in one statement.
     Because it is a single UPDATE, two concurrent calls are serialised by
     PostgreSQL and will each receive a distinct set of rows.

  ## Changes
  - `chats` table: new nullable column `analyzing_at timestamptz`
  - New function: `claim_unanalyzed_chats(p_limit integer)` → SETOF chats
*/

-- 1. Add the soft-lock column (safe, nullable, no default needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'analyzing_at'
  ) THEN
    ALTER TABLE chats ADD COLUMN analyzing_at timestamptz;
  END IF;
END $$;

-- 2. Index so the WHERE clause in the RPC is fast
CREATE INDEX IF NOT EXISTS idx_chats_analyzing_at ON chats (analyzing_at)
  WHERE analyzed = false;

-- 3. Atomic claim function
CREATE OR REPLACE FUNCTION claim_unanalyzed_chats(p_limit integer DEFAULT 20)
RETURNS SETOF chats
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE chats
  SET analyzing_at = now()
  WHERE id IN (
    SELECT id FROM chats
    WHERE
      analyzed = false
      AND (analyzing_at IS NULL OR analyzing_at < now() - interval '10 minutes')
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
