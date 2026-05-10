/*
  # Create Audit Logs System

  Tracks all user actions in the panel for accountability and monitoring.
  - Who did what, when, on which entity
  - Old/new values for changes
  - Filterable by user, action, entity, brand, date
*/

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  user_name text,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_label text,
  description text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- 2. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_brand_id ON audit_logs(brand_id);

-- 3. Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin/founder can read all audit logs
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND (up.is_founder = true)
    )
    OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'Admin'
    )
  );

-- Any authenticated user can insert audit logs (their own actions)
CREATE POLICY "audit_logs_insert_authenticated" ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Add audit permission
INSERT INTO permissions (key, label, description, module, sub_module)
VALUES ('admin.audit.view', 'Denetim Gunlugu Goruntule', 'Audit log sayfasini goruntuleyebilir', 'admin', 'audit')
ON CONFLICT (key) DO NOTHING;

-- 5. Grant permission to Admin role
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, true
FROM roles r, permissions p
WHERE r.name = 'Admin' AND p.key = 'admin.audit.view'
ON CONFLICT DO NOTHING;

-- 6. Auto-cleanup: keep last 90 days (optional cron)
-- You can schedule: DELETE FROM audit_logs WHERE created_at < now() - interval '90 days';
