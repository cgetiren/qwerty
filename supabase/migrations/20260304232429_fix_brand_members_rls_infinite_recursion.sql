/*
  # Fix brand_members SELECT policy infinite recursion

  ## Problem
  The "Users can view members of their brands" policy on brand_members queries
  brand_members again inside itself (via alias bm2), which PostgreSQL RLS
  evaluates recursively, causing a 500 infinite-recursion error.

  ## Fix
  Replace the self-referencing policy with a simple:
    - Users can see rows where they are the member (user_id = auth.uid())
    - Founders can see all rows

  This removes the circular dependency entirely.
*/

DROP POLICY IF EXISTS "Users can view members of their brands" ON brand_members;

CREATE POLICY "Users can view own brand memberships"
  ON brand_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_founder = true
    )
  );
