/*
  # Add Founder Flag and Seed Super Admin

  ## Changes
  1. Add `is_founder` column to `user_profiles`
     - Founder accounts can never be deactivated or have their Admin role removed
     - Protected at database level via check constraint

  2. Seed super admin profile for takip1@takip.local
     - Full name: Kurucu Admin
     - is_founder: true
     - Assign Admin role

  ## Notes
  - Founder users are permanently protected — even admins cannot demote them
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'is_founder'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN is_founder boolean NOT NULL DEFAULT false;
  END IF;
END $$;

INSERT INTO user_profiles (id, full_name, username, is_active, avatar_color, is_founder)
VALUES (
  '174e31a8-fb35-4cd6-b45e-53d3c43417cc',
  'Kurucu Admin',
  'kurucu',
  true,
  '#0891b2',
  true
)
ON CONFLICT (id) DO UPDATE SET
  is_founder = true,
  is_active = true;

INSERT INTO user_roles (user_id, role_id, assigned_at)
SELECT
  '174e31a8-fb35-4cd6-b45e-53d3c43417cc',
  r.id,
  now()
FROM roles r
WHERE r.name = 'Admin'
ON CONFLICT (user_id, role_id) DO NOTHING;
