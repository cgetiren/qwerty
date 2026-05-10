-- Add Foreign Key Relationship: chats.personnel_id -> personnel.id
-- This enables Supabase REST API auto-join feature

-- Check if FK already exists
DO $$
BEGIN
  -- Drop existing FK if it exists (in case of re-run)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_chats_personnel' AND table_name = 'chats'
  ) THEN
    ALTER TABLE chats DROP CONSTRAINT fk_chats_personnel;
  END IF;
END $$;

-- Add foreign key constraint
ALTER TABLE chats
  ADD CONSTRAINT fk_chats_personnel
  FOREIGN KEY (personnel_id)
  REFERENCES personnel(id)
  ON DELETE SET NULL  -- If personnel deleted, set chats.personnel_id to NULL
  ON UPDATE CASCADE;  -- If personnel.id changes, update chats.personnel_id

-- Create index for performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_chats_personnel_id ON chats(personnel_id);

-- Refresh Supabase schema cache (forces API to recognize new FK)
NOTIFY pgrst, 'reload schema';

COMMENT ON CONSTRAINT fk_chats_personnel ON chats IS 
  'Foreign key to personnel table. Enables Supabase REST API auto-join: chats.select("*, personnel:personnel_id(name, email)")';

-- Verify FK was created
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'chats'
  AND kcu.column_name = 'personnel_id';
