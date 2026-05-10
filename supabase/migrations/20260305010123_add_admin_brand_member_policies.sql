/*
  # Extend brand_members RLS to include Admin users

  ## Changes
  - Add SELECT policy so admins can read all brand memberships (needed to manage user-brand assignments)
  - Add INSERT policy so admins can add users to brands
  - Add UPDATE policy so admins can activate/deactivate memberships
  - DELETE policy for admins (optional, we use soft-delete via is_active)

  ## Notes
  - "Admin" is determined by having the Admin role in user_roles table
  - Founders retain their existing unrestricted access via separate policies
*/

CREATE OR REPLACE FUNCTION is_admin_or_founder()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_founder = true
  ) OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'Admin'
  );
$$;

CREATE POLICY "Admins can view all brand memberships"
  ON brand_members FOR SELECT
  TO authenticated
  USING (is_admin_or_founder());

CREATE POLICY "Admins can insert brand members"
  ON brand_members FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_founder());

CREATE POLICY "Admins can update brand members"
  ON brand_members FOR UPDATE
  TO authenticated
  USING (is_admin_or_founder())
  WITH CHECK (is_admin_or_founder());
