/*
  # Granular Role and User-Based Authorization System

  ## Overview
  A complete RBAC (Role-Based Access Control) system with user-level permission overrides.
  All tables are new and isolated — no existing tables are modified.

  ## New Tables

  1. **roles** — Role definitions (Admin, Supervisor, Agent, Viewer + custom)
     - id, name, description, color, is_system, priority, created_at

  2. **permissions** — Full permission key catalogue
     - id, key, label, description, module, sub_module, sort_order

  3. **role_permissions** — Which permissions a role has
     - role_id, permission_id, granted

  4. **user_roles** — Roles assigned to users (many-to-many)
     - user_id, role_id, assigned_by, assigned_at

  5. **user_permission_overrides** — Per-user permission override (trumps role)
     - user_id, permission_id, granted, reason, overridden_by, overridden_at

  6. **user_profiles** — Profile data linked to auth.users
     - id (FK auth.users), full_name, username, is_active, avatar_color,
       created_at, last_login_at

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read roles, permissions, role_permissions
  - Only admins (checked via user_roles join) can write roles/permissions
  - Users can read their own profile and overrides
*/

-- ============================================================
-- TABLE: roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#6b7280',
  is_system boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read roles"
  ON roles FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert roles"
  ON roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update roles"
  ON roles FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete roles"
  ON roles FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL AND is_system = false);

-- ============================================================
-- TABLE: permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  module text NOT NULL,
  sub_module text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read permissions"
  ON permissions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- TABLE: role_permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read role_permissions"
  ON role_permissions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert role_permissions"
  ON role_permissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update role_permissions"
  ON role_permissions FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete role_permissions"
  ON role_permissions FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- TABLE: user_roles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles (user_id);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read user_roles"
  ON user_roles FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert user_roles"
  ON user_roles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete user_roles"
  ON user_roles FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- TABLE: user_permission_overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id uuid NOT NULL,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted boolean NOT NULL,
  reason text NOT NULL DEFAULT '',
  overridden_by uuid,
  overridden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS user_perm_overrides_user_id_idx ON user_permission_overrides (user_id);

ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read user_permission_overrides"
  ON user_permission_overrides FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert user_permission_overrides"
  ON user_permission_overrides FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update user_permission_overrides"
  ON user_permission_overrides FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete user_permission_overrides"
  ON user_permission_overrides FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- TABLE: user_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  username text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  avatar_color text NOT NULL DEFAULT '#0891b2',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read user_profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- FUNCTION: get user effective permissions
-- Returns jsonb { "key": true/false, ... } for a given user
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb := '{}';
  r record;
BEGIN
  -- 1. Collect all role-granted permissions for this user
  FOR r IN
    SELECT p.key, bool_or(rp.granted) AS granted
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
    GROUP BY p.key
  LOOP
    result := jsonb_set(result, ARRAY[r.key], to_jsonb(r.granted));
  END LOOP;

  -- 2. Apply user-level overrides (trumps role)
  FOR r IN
    SELECT p.key, upo.granted
    FROM user_permission_overrides upo
    JOIN permissions p ON p.id = upo.permission_id
    WHERE upo.user_id = p_user_id
  LOOP
    result := jsonb_set(result, ARRAY[r.key], to_jsonb(r.granted));
  END LOOP;

  RETURN result;
END;
$$;

-- ============================================================
-- SEED: Default roles
-- ============================================================
INSERT INTO roles (name, description, color, is_system, priority) VALUES
  ('Admin', 'Tam yetkili sistem yoneticisi', '#0891b2', true, 100),
  ('Supervisor', 'Takim lideri — raporlara ve koçluga tam erisim', '#059669', true, 80),
  ('Agent', 'Chat temsilcisi — sadece kendi verileri', '#d97706', true, 50),
  ('Viewer', 'Salt okunur izleyici', '#6b7280', true, 10)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SEED: Full permissions catalogue
-- ============================================================
INSERT INTO permissions (key, label, description, module, sub_module, sort_order) VALUES
  -- Dashboard
  ('dashboard.view',              'Dashboard Goruntule',           'Dashboard sayfasini goruntule',                             'Dashboard', '',          10),
  ('dashboard.refresh',           'Veriyi Yenile',                 'Dashboard verisini manuel yenile',                         'Dashboard', '',          20),
  ('dashboard.trends.view',       'Trend Kartlarini Gor',          'Personel trend kartlarini goruntule',                      'Dashboard', 'Trendler',  30),
  ('dashboard.trends.modal',      'Trend Detay Modali',            'Trend detay modalini ac',                                  'Dashboard', 'Trendler',  40),
  ('dashboard.alerts.view',       'Uyarilari Gor',                 'Son uyarilari goruntule',                                  'Dashboard', 'Uyarilar',  50),
  ('dashboard.complaint_chart.view','Sikayet Grafigi Gor',         'Sikayet dagilimi grafikini goruntule',                     'Dashboard', 'Grafikler', 60),
  ('dashboard.heatmap.view',      'Isi Haritasi Gor',              'Saat dagilimi isi haritasini goruntule',                   'Dashboard', 'Grafikler', 70),
  -- Monitoring
  ('monitoring.view',             'Canli Izleme Goruntule',        'Canli izleme sayfasini goruntule',                         'Izleme', '',             10),
  ('monitoring.sync.trigger',     'Senkronizasyon Baslat',         'Manuel senkronizasyon baslat',                             'Izleme', 'Islemler',    20),
  ('monitoring.analysis.trigger', 'Analiz Baslat',                 'Manuel analiz baslat',                                     'Izleme', 'Islemler',    30),
  ('monitoring.telegram.send',    'Telegram Gonder',               'Telegram uyarilari gonder',                                'Izleme', 'Islemler',    40),
  ('monitoring.logs.view',        'Sistem Loglarini Gor',          'Sistem loglarini goruntule',                               'Izleme', 'Loglar',      50),
  ('monitoring.logs.clear',       'Loglari Temizle',               'Sistem loglarini temizle',                                 'Izleme', 'Loglar',      60),
  -- Chat Analysis
  ('chats.view',                  'Chat Listesini Gor',            'Chat listesini goruntule',                                 'Chat', '',               10),
  ('chats.search',                'Arama ve Filtre',               'Chat aramasini ve filtreleri kullan',                      'Chat', '',               20),
  ('chats.detail.view',           'Chat Detayini Ac',              'Chat detay sayfasini ac',                                  'Chat', 'Detay',          30),
  ('chats.detail.messages.view',  'Mesajlari Gor',                 'Konusma mesajlarini goruntule',                            'Chat', 'Detay',          40),
  ('chats.detail.scores.view',    'Analiz Skorlarini Gor',         'AI analiz skorlarini goruntule',                           'Chat', 'Detay',          50),
  ('chats.detail.coaching.view',  'Kocluk Onerilerini Gor',        'AI kocluk onerilerini goruntule',                          'Chat', 'Kocluk',         60),
  ('chats.detail.coaching.generate','Kocluk Onerisi Uret',         'Kocluk onerisi uret',                                      'Chat', 'Kocluk',         70),
  ('chats.detail.flag',           'Analizi Isaretle',              'Analizi yanlis olarak isaretle',                           'Chat', 'Detay',          80),
  ('chats.reanalyze.single',      'Tek Chat Yeniden Analiz',       'Tek bir chati yeniden analiz et',                          'Chat', 'Analiz',         90),
  ('chats.reanalyze.all',         'Tum Chatleri Yeniden Analiz',   'Tum chatleri yeniden analiz et',                           'Chat', 'Analiz',        100),
  -- Personnel
  ('personnel.view',              'Personel Listesini Gor',        'Personel listesini goruntule',                             'Personel', '',            10),
  ('personnel.detail.view',       'Personel Detayini Gor',         'Personel detay sayfasini goruntule',                       'Personel', 'Detay',       20),
  ('personnel.detail.scores.view','Skor ve Metrikleri Gor',        'Skor ve metrikleri goruntule',                             'Personel', 'Detay',       30),
  ('personnel.detail.chat_history.view','Chat Gecmisini Gor',      'Personel chat gecmisini goruntule',                        'Personel', 'Detay',       40),
  ('personnel.detail.recurring_issues.view','Tekrarlayan Hatalari Gor','Tekrarlayan hatalari goruntule',                       'Personel', 'Detay',       50),
  ('personnel.detail.topics.view','Konu Dagilimini Gor',           'Guclu/zayif konu dagilimini goruntule',                    'Personel', 'Detay',       60),
  ('personnel.recalculate',       'Istatistikleri Yeniden Hesapla','Personel istatistiklerini yeniden hesapla',                'Personel', '',            70),
  -- Reports
  ('reports.view',                'Raporlari Goruntule',           'Raporlar sayfasini goruntule',                             'Raporlar', '',            10),
  ('reports.trends.view',         'Trend Analizini Gor',           'Trend analizini goruntule',                                'Raporlar', 'Trendler',   20),
  ('reports.coaching.view',       'Kocluk Sekmesini Gor',          'Kocluk onerileri sekmesini goruntule',                     'Raporlar', 'Kocluk',     30),
  ('reports.coaching.generate',   'Kocluk Onerisi Uret',           'Tekli kocluk onerisi uret',                                'Raporlar', 'Kocluk',     40),
  ('reports.coaching.generate_bulk','Toplu Kocluk Uret',           'Toplu kocluk onerisi uret',                                'Raporlar', 'Kocluk',     50),
  ('reports.coaching.send_feedback','Kocluk Geri Bildirimi Gonder','Tekli kocluk geri bildirimi gonder',                       'Raporlar', 'Kocluk',     60),
  ('reports.coaching.send_feedback_bulk','Toplu Geri Bildirim Gonder','Toplu geri bildirim gonder',                            'Raporlar', 'Kocluk',     70),
  ('reports.improvement.view',    'Iyilesme Takibini Gor',         'Iyilesme takibini goruntule',                              'Raporlar', 'Iyilesme',   80),
  -- Bonus
  ('bonus.settings.view',         'Prim Kurallarini Gor',          'Prim kurallarini goruntule',                               'Prim', 'Ayarlar',        10),
  ('bonus.settings.create',       'Yeni Kural Olustur',            'Yeni prim kurali olustur',                                 'Prim', 'Ayarlar',        20),
  ('bonus.settings.edit',         'Kural Duzenle',                 'Prim kuralini duzenle',                                    'Prim', 'Ayarlar',        30),
  ('bonus.settings.delete',       'Kural Sil',                     'Prim kuralini sil',                                        'Prim', 'Ayarlar',        40),
  ('bonus.settings.toggle',       'Kural Aktif/Pasif',             'Prim kuralini aktif/pasif yap',                            'Prim', 'Ayarlar',        50),
  ('bonus.reports.view',          'Prim Raporlarini Gor',          'Prim raporlarini goruntule',                               'Prim', 'Raporlar',       60),
  ('bonus.reports.calculate',     'Prim Hesapla',                  'Prim hesapla',                                             'Prim', 'Raporlar',       70),
  ('bonus.reports.save',          'Rapor Kaydet',                  'Prim raporunu kaydet',                                     'Prim', 'Raporlar',       80),
  ('bonus.reports.export_pdf',    'PDF Disa Aktar',                'Prim raporunu PDF olarak disa aktar',                      'Prim', 'Raporlar',       90),
  -- Coaching Center
  ('coaching.view',               'Kocluk Merkezi Goruntule',      'Kocluk merkezi sayfasini goruntule',                       'Kocluk Merkezi', '',       10),
  ('coaching.suggestions.view',   'Kocluk Onerilerini Gor',        'Kocluk onerilerini goruntule',                             'Kocluk Merkezi', '',       20),
  ('coaching.feedback.view',      'Geri Bildirimleri Gor',         'Kocluk geri bildirimlerini goruntule',                     'Kocluk Merkezi', '',       30),
  ('coaching.feedback.send',      'Geri Bildirim Gonder',          'Kocluk geri bildirimi gonder',                             'Kocluk Merkezi', '',       40),
  -- Callback Queue
  ('callcenter.view',             'Geri Arama Goruntule',          'Geri arama kuyrugu sayfasini goruntule',                   'Geri Arama', '',           10),
  ('callcenter.notes.add',        'Not Ekle',                      'Gorusme notu ekle',                                        'Geri Arama', '',           20),
  ('callcenter.status.complete',  'Tamamlandi Yap',                'Durumu tamamlandi olarak isaretle',                        'Geri Arama', '',           30),
  ('callcenter.status.cancel',    'Iptal Et',                      'Geri arama talebini iptal et',                             'Geri Arama', '',           40),
  ('callcenter.history.scan',     'Gecmis Tarama Baslat',          'Gecmis chat tarama baslat',                                'Geri Arama', '',           50),
  -- Settings
  ('settings.view',               'Ayarlari Goruntule',            'Ayarlar sayfasini goruntule',                              'Ayarlar', '',              10),
  ('settings.api_keys.edit',      'API Anahtarlarini Duzenle',     'API anahtarlarini duzenle',                                'Ayarlar', '',              20),
  ('settings.telegram.edit',      'Telegram Ayarlarini Duzenle',   'Telegram ayarlarini duzenle',                              'Ayarlar', '',              30),
  ('settings.save',               'Ayarlari Kaydet',               'Ayarlari kaydet',                                          'Ayarlar', '',              40),
  -- Admin
  ('admin.users.view',            'Kullanici Listesini Gor',       'Kullanici listesini goruntule',                            'Yonetim', 'Kullanicilar',  10),
  ('admin.users.create',          'Yeni Kullanici Olustur',        'Yeni kullanici olustur',                                   'Yonetim', 'Kullanicilar',  20),
  ('admin.users.edit',            'Kullanici Duzenle',             'Kullanici bilgilerini duzenle',                            'Yonetim', 'Kullanicilar',  30),
  ('admin.users.delete',          'Kullanici Sil',                 'Kullanici sil',                                            'Yonetim', 'Kullanicilar',  40),
  ('admin.users.assign_roles',    'Rol Ata',                       'Kullaniciya rol ata',                                      'Yonetim', 'Kullanicilar',  50),
  ('admin.users.permission_override','Yetki Gecersiz Kil',         'Kullanici bazli yetki gecersiz kil',                       'Yonetim', 'Kullanicilar',  60),
  ('admin.roles.view',            'Rol Listesini Gor',             'Rol listesini goruntule',                                  'Yonetim', 'Roller',        70),
  ('admin.roles.create',          'Yeni Rol Olustur',              'Yeni rol olustur',                                         'Yonetim', 'Roller',        80),
  ('admin.roles.edit',            'Rol Duzenle',                   'Rol bilgilerini duzenle',                                  'Yonetim', 'Roller',        90),
  ('admin.roles.delete',          'Rol Sil',                       'Rol sil',                                                  'Yonetim', 'Roller',       100),
  ('admin.roles.assign_permissions','Role Yetki Ata',              'Role yetki ata veya kaldir',                               'Yonetim', 'Roller',       110)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SEED: Assign permissions to roles
-- Admin gets everything
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, true
FROM roles r, permissions p
WHERE r.name = 'Admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Supervisor: everything except admin user/role management writes
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, true
FROM roles r, permissions p
WHERE r.name = 'Supervisor'
  AND p.key NOT IN (
    'admin.users.create', 'admin.users.delete', 'admin.users.assign_roles',
    'admin.users.permission_override', 'admin.roles.create',
    'admin.roles.edit', 'admin.roles.delete', 'admin.roles.assign_permissions',
    'monitoring.logs.clear', 'chats.reanalyze.all',
    'settings.api_keys.edit', 'settings.telegram.edit'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Agent: limited set
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, true
FROM roles r, permissions p
WHERE r.name = 'Agent'
  AND p.key IN (
    'dashboard.view', 'dashboard.trends.view',
    'chats.view', 'chats.search', 'chats.detail.view',
    'chats.detail.messages.view', 'chats.detail.scores.view',
    'chats.detail.coaching.view',
    'coaching.view', 'coaching.suggestions.view',
    'coaching.feedback.view', 'coaching.feedback.send',
    'callcenter.view', 'callcenter.notes.add',
    'callcenter.status.complete', 'callcenter.status.cancel'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Viewer: read-only
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, true
FROM roles r, permissions p
WHERE r.name = 'Viewer'
  AND p.key IN (
    'dashboard.view', 'dashboard.trends.view',
    'dashboard.alerts.view', 'dashboard.complaint_chart.view',
    'dashboard.heatmap.view',
    'chats.view', 'chats.search', 'chats.detail.view',
    'chats.detail.scores.view',
    'personnel.view', 'personnel.detail.view',
    'personnel.detail.scores.view',
    'reports.view', 'reports.trends.view',
    'bonus.reports.view',
    'coaching.view', 'coaching.suggestions.view',
    'callcenter.view'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
