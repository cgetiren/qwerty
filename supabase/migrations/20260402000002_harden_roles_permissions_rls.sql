-- Fix: roles ve permissions tablolarına admin-only write kısıtlaması ekle
-- Mevcut durum: herhangi bir authenticated kullanıcı yetki sistemiyle oynayabiliyor

-- Helper: Kullanıcının founder veya admin olup olmadığını kontrol eden fonksiyon
CREATE OR REPLACE FUNCTION is_admin_or_founder()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_founder = true
  )
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'Admin', 'Yönetici')
  );
$$;

-- ============ ROLES TABLOSU ============
-- Read: herkes okuyabilir (mevcut, dokunma)
-- Write: sadece admin/founder

DROP POLICY IF EXISTS "Authenticated users can insert roles" ON roles;
DROP POLICY IF EXISTS "Authenticated users can update roles" ON roles;
DROP POLICY IF EXISTS "Authenticated users can delete roles" ON roles;

CREATE POLICY "Admins can insert roles"
ON roles FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_founder());

CREATE POLICY "Admins can update roles"
ON roles FOR UPDATE
TO authenticated
USING (is_admin_or_founder());

CREATE POLICY "Admins can delete roles"
ON roles FOR DELETE
TO authenticated
USING (is_admin_or_founder());

-- ============ PERMISSIONS TABLOSU ============
-- Permissions normalde seed data, ama yine de koruyalım

DROP POLICY IF EXISTS "Authenticated users can insert permissions" ON permissions;
DROP POLICY IF EXISTS "Authenticated users can update permissions" ON permissions;
DROP POLICY IF EXISTS "Authenticated users can delete permissions" ON permissions;

CREATE POLICY "Admins can manage permissions"
ON permissions FOR ALL
TO authenticated
USING (is_admin_or_founder())
WITH CHECK (is_admin_or_founder());

-- Read policy'si mevcut, dokunmuyoruz (herkes okuyabilir)

-- ============ ROLE_PERMISSIONS TABLOSU ============

DROP POLICY IF EXISTS "Authenticated users can insert role_permissions" ON role_permissions;
DROP POLICY IF EXISTS "Authenticated users can update role_permissions" ON role_permissions;
DROP POLICY IF EXISTS "Authenticated users can delete role_permissions" ON role_permissions;

CREATE POLICY "Admins can insert role_permissions"
ON role_permissions FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_founder());

CREATE POLICY "Admins can update role_permissions"
ON role_permissions FOR UPDATE
TO authenticated
USING (is_admin_or_founder());

CREATE POLICY "Admins can delete role_permissions"
ON role_permissions FOR DELETE
TO authenticated
USING (is_admin_or_founder());

-- ============ USER_ROLES TABLOSU ============

DROP POLICY IF EXISTS "Authenticated users can insert user_roles" ON user_roles;
DROP POLICY IF EXISTS "Authenticated users can delete user_roles" ON user_roles;

CREATE POLICY "Admins can insert user_roles"
ON user_roles FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_founder());

CREATE POLICY "Admins can delete user_roles"
ON user_roles FOR DELETE
TO authenticated
USING (is_admin_or_founder());
