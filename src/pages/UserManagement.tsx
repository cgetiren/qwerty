import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Plus, CreditCard as Edit2, Search, Check, X, Shield, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Minus, Crown, Building2, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PermissionGate } from '../components/PermissionGate';
import { logAudit } from '../lib/auditLogger';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  username: string | null;
  is_active: boolean;
  is_founder: boolean;
  avatar_color: string;
  last_login_at: string | null;
  created_at: string;
  roles: { role_id: string; role_name: string; role_color: string }[];
}

interface Role {
  id: string;
  name: string;
  color: string;
  description: string;
}

interface Permission {
  id: string;
  key: string;
  label: string;
  module: string;
  sub_module: string;
  sort_order: number;
}

interface PermissionOverride {
  user_id: string;
  permission_id: string;
  granted: boolean;
  reason: string;
}

interface Brand {
  id: string;
  name: string;
  color: string;
  slug: string;
  is_active: boolean;
}

const AVATAR_COLORS = [
  '#0891b2', '#059669', '#d97706', '#dc2626',
  '#db2777', '#0284c7', '#65a30d', '#6b7280',
];

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function timeAgo(iso: string | null) {
  if (!iso) return 'Hic girilmedi';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az once';
  if (mins < 60) return `${mins}dk once`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}sa once`;
  return `${Math.floor(hrs / 24)}g once`;
}

export default function UserManagement() {
  return (
    <PermissionGate permission="admin.users.view" mode="page">
      <UserManagementInner />
    </PermissionGate>
  );
}

function UserManagementInner() {
  const { session, reloadPermissions } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [mfaStatusMap, setMfaStatusMap] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profilesRes, userRolesRes, rolesRes, permsRes, brandsRes] = await Promise.all([
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('user_id, role_id, roles(name, color)'),
      supabase.from('roles').select('id, name, color, description').order('priority', { ascending: false }),
      supabase.from('permissions').select('id, key, label, module, sub_module, sort_order').order('module').order('sort_order'),
      supabase.from('brands').select('id, name, color, slug, is_active').eq('is_active', true).order('name'),
    ]);
    if (brandsRes.data) setBrands(brandsRes.data as Brand[]);

    if (rolesRes.data) setRoles(rolesRes.data as Role[]);
    if (permsRes.data) setPermissions(permsRes.data as Permission[]);

    if (profilesRes.data) {
      const userRoleMap: Record<string, { role_id: string; role_name: string; role_color: string }[]> = {};
      for (const ur of (userRolesRes.data ?? []) as any as { user_id: string; role_id: string; roles: { name: string; color: string } | null }[]) {
        if (!userRoleMap[ur.user_id]) userRoleMap[ur.user_id] = [];
        userRoleMap[ur.user_id].push({
          role_id: ur.role_id,
          role_name: ur.roles?.name ?? '',
          role_color: ur.roles?.color ?? '#6b7280',
        });
      }

      setUsers(profilesRes.data.map(p => ({
        id: p.id,
        email: '',
        full_name: p.full_name,
        username: p.username,
        is_active: p.is_active,
        is_founder: p.is_founder ?? false,
        avatar_color: p.avatar_color,
        last_login_at: p.last_login_at,
        created_at: p.created_at,
        roles: userRoleMap[p.id] ?? [],
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const loadMfaStatuses = async () => {
      try {
        const { data } = await supabase.rpc('get_mfa_statuses');
        const map: Record<string, boolean> = {};
        if (data) {
          for (const f of data) map[f.user_id] = true;
        }
        setMfaStatusMap(map);
      } catch { /* ignore */ }
    };
    loadMfaStatuses();
  }, [users.length]);

  const filtered = useMemo(() =>
    users.filter(u => {
      if (!search) return true;
      const q = search.toLowerCase();
      return u.full_name.toLowerCase().includes(q) || (u.username ?? '').toLowerCase().includes(q);
    }),
  [users, search]);

  const handleUserSaved = async () => {
    await fetchData();
    if (editingUser?.id === session?.user?.id) await reloadPermissions();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Kullanici Yonetimi</h1>
          <p className="text-sm text-slate-500 mt-1">{users.length} kullanici</p>
        </div>
        <PermissionGate permission="admin.users.create">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Yeni Kullanici
          </button>
        </PermissionGate>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ad veya kullanici adi ara..."
          className="w-full pl-9 pr-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/40 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/6 rounded-xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-slate-200 dark:border-white/5 text-[10px] text-slate-600 uppercase tracking-wider font-semibold">
            <span>Kullanici</span>
            <span>Roller</span>
            <span>Son Giris</span>
            <span></span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
            {filtered.map(user => (
              <UserTableRow
                key={user.id}
                user={user}
                mfaEnabled={mfaStatusMap[user.id] ?? false}
                onEdit={() => setEditingUser(user)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <p className="text-sm">Kullanici bulunamadi</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          roles={roles}
          brands={brands}
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => { await fetchData(); setShowCreateModal(false); }}
        />
      )}

      {editingUser && (
        <EditUserPanel
          user={editingUser}
          roles={roles}
          brands={brands}
          permissions={permissions}
          onClose={() => setEditingUser(null)}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  );
}

function UserTableRow({ user, mfaEnabled, onEdit }: { user: UserRow; mfaEnabled: boolean; onEdit: () => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 px-5 py-4 hover:bg-slate-50 dark:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-900 dark:text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: user.avatar_color }}
        >
          {initials(user.full_name)}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{user.full_name || 'Adsiz'}</span>
            {user.is_founder && (
              <span className="inline-flex items-center gap-1 text-[9px] text-amber-300 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                <Crown className="w-2.5 h-2.5" />
                Kurucu
              </span>
            )}
            {!user.is_active && (
              <span className="text-[9px] text-rose-400 border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 rounded-full">Pasif</span>
            )}
          </div>
          {user.username && <p className="text-xs text-slate-500">@{user.username}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {user.roles.length === 0 ? (
          <span className="text-xs text-slate-600 italic">Rol yok</span>
        ) : (
          user.roles.map(r => (
            <span
              key={r.role_id}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
              style={{ color: r.role_color, borderColor: `${r.role_color}30`, backgroundColor: `${r.role_color}15` }}
            >
              {r.role_name}
            </span>
          ))
        )}
      </div>

      <div className="sm:text-right">
        <p className="text-xs text-slate-500">{timeAgo(user.last_login_at)}</p>
        <span className={`inline-flex items-center gap-1 text-[10px] mt-0.5 px-1.5 py-0.5 rounded-full ${
          mfaEnabled
            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
            : 'text-slate-500 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]'
        }`}>
          <Shield className="w-2.5 h-2.5" />
          {mfaEnabled ? '2FA' : '2FA Yok'}
        </span>
      </div>

      <PermissionGate permission="admin.users.edit">
        <div className="sm:justify-self-end">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/8 border border-slate-200 dark:border-white/8 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-all"
          >
            <Edit2 className="w-3 h-3" />
            Duzenle
          </button>
        </div>
      </PermissionGate>
    </div>
  );
}

function CreateUserModal({ roles, brands, onClose, onCreated }: {
  roles: Role[];
  brands: Brand[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    password: '', full_name: '', username: '',
    is_active: true, avatar_color: AVATAR_COLORS[0], role_ids: [] as string[], brand_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.username.trim() || !form.password.trim()) {
      setError('Kullanici adi ve sifre zorunludur');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('create-user', {
        body: { ...form, brand_ids: form.brand_ids },
      });
      if (fnError) {
        let errMsg = fnError.message;
        try {
          const errBody = await (fnError as any).context?.json?.();
          if (errBody?.error) errMsg = errBody.error;
        } catch { /* ignore */ }
        setError(errMsg);
        setSaving(false);
        return;
      }
      if (result?.error) { setError(result.error); setSaving(false); return; }
      logAudit({
        actionType: 'create',
        entityType: 'user',
        entityLabel: form.full_name || form.username,
        description: `Yeni kullanici olusturuldu: ${form.full_name || form.username}`,
        newValues: { username: form.username, full_name: form.full_name, is_active: form.is_active },
      });
      await onCreated();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const toggleRole = (id: string) => {
    setForm(p => ({
      ...p,
      role_ids: p.role_ids.includes(id) ? p.role_ids.filter(r => r !== id) : [...p.role_ids, id],
    }));
  };

  const toggleBrand = (id: string) => {
    setForm(p => ({
      ...p,
      brand_ids: p.brand_ids.includes(id) ? p.brand_ids.filter(b => b !== id) : [...p.brand_ids, id],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-white/10 rounded-2xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Yeni Kullanici Olustur</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-600 dark:text-slate-300 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <ModalField label="Ad Soyad">
            <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              placeholder="Ahmet Yilmaz" className="modal-input w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40" />
          </ModalField>
          <ModalField label="Kullanici Adi">
            <div className="space-y-1">
              <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="ahmet.yilmaz" className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40" />
              {form.username && (
                <p className="text-xs text-slate-500">Giris yapacak: <span className="text-cyan-400">{form.username}</span></p>
              )}
            </div>
          </ModalField>
          <ModalField label="Sifre">
            <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="Min 6 karakter" className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40" />
          </ModalField>
          <ModalField label="Avatar Rengi">
            <div className="flex gap-2">
              {AVATAR_COLORS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, avatar_color: c }))}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${form.avatar_color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </ModalField>
          <ModalField label="Roller">
            <div className="space-y-1.5">
              {roles.map(role => (
                <label key={role.id} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => toggleRole(role.id)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      form.role_ids.includes(role.id)
                        ? 'border-cyan-400 bg-cyan-500/20'
                        : 'border-white/20 bg-transparent hover:border-white/40'
                    }`}
                  >
                    {form.role_ids.includes(role.id) && <Check className="w-2.5 h-2.5 text-cyan-300" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                    <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:text-white transition-colors">{role.name}</span>
                    {role.description && <span className="text-xs text-slate-600">{role.description}</span>}
                  </div>
                </label>
              ))}
            </div>
          </ModalField>
          {brands.length > 0 && (
            <ModalField label="Marka Erisimi">
              <div className="space-y-1.5">
                {brands.map(brand => (
                  <label key={brand.id} className="flex items-center gap-3 cursor-pointer group">
                    <div
                      onClick={() => toggleBrand(brand.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                        form.brand_ids.includes(brand.id)
                          ? 'border-cyan-400 bg-cyan-500/20'
                          : 'border-white/20 bg-transparent hover:border-white/40'
                      }`}
                    >
                      {form.brand_ids.includes(brand.id) && <Check className="w-2.5 h-2.5 text-cyan-300" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.color || '#6b7280' }} />
                      <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:text-white transition-colors">{brand.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            </ModalField>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aktif Kullanici</span>
            <button
              onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
              className={`relative w-10 h-5 rounded-full transition-all duration-200 ${form.is_active ? 'bg-emerald-500' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${form.is_active ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/8 rounded-xl hover:bg-slate-100 dark:bg-white/5 transition-all">Iptal</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Olustur
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserPanel({ user, roles, brands, permissions, onClose, onSaved }: {
  user: UserRow;
  roles: Role[];
  brands: Brand[];
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'roles' | 'brands' | 'overrides'>('info');
  const [form, setForm] = useState({
    full_name: user.full_name,
    username: user.username ?? '',
    is_active: user.is_active,
    avatar_color: user.avatar_color,
  });
  const [userRoleIds, setUserRoleIds] = useState<string[]>(user.roles.map(r => r.role_id));
  const [userBrandIds, setUserBrandIds] = useState<string[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);
  const [rolePermMap, setRolePermMap] = useState<Record<string, boolean>>({});
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordResetMsg, setPasswordResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [resettingMfa, setResettingMfa] = useState(false);
  const [mfaMsg, setMfaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const loadBrandMemberships = async () => {
      setLoadingBrands(true);
      const { data } = await supabase
        .from('brand_members')
        .select('brand_id')
        .eq('user_id', user.id)
        .eq('is_active', true);
      setUserBrandIds((data || []).map(m => m.brand_id));
      setLoadingBrands(false);
    };
    loadBrandMemberships();

    // Load MFA status from DB
    const loadMfaStatus = async () => {
      try {
        const { data } = await supabase.rpc('get_mfa_statuses');
        const hasMfa = (data || []).some((f: any) => f.user_id === user.id);
        setMfaEnabled(hasMfa);
      } catch { setMfaEnabled(false); }
    };
    loadMfaStatus();
  }, [user.id]);

  useEffect(() => {
    const loadOverrideData = async () => {
      setLoadingOverrides(true);
      const [overridesRes, rpRes] = await Promise.all([
        supabase.from('user_permission_overrides').select('*, permissions(key)').eq('user_id', user.id),
        supabase.from('role_permissions').select('permission_id, granted, role_id').in('role_id', userRoleIds),
      ]);
      if (overridesRes.data) setOverrides(overridesRes.data as PermissionOverride[]);
      if (rpRes.data) {
        const map: Record<string, boolean> = {};
        for (const rp of rpRes.data) {
          if (rp.granted) map[rp.permission_id] = true;
        }
        setRolePermMap(map);
      }
      setLoadingOverrides(false);
    };
    loadOverrideData();
  }, [user.id, userRoleIds]);

  const saveInfo = async () => {
    setSaving(true);
    await supabase.from('user_profiles').update({
      full_name: form.full_name,
      username: form.username || null,
      is_active: form.is_active,
      avatar_color: form.avatar_color,
    }).eq('id', user.id);
    await onSaved();
    setSaving(false);
  };

  const resetPassword = async () => {
    if (!newPassword.trim()) {
      setPasswordResetMsg({ type: 'error', text: 'Yeni sifre bos birakilamaz' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordResetMsg({ type: 'error', text: 'Sifre en az 6 karakter olmalidir' });
      return;
    }
    setResettingPassword(true);
    setPasswordResetMsg(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('reset-user-password', {
        body: { target_user_id: user.id, new_password: newPassword },
      });
      if (fnError) {
        let errMsg = fnError.message;
        try {
          const errBody = await (fnError as any).context?.json?.();
          if (errBody?.error) errMsg = errBody.error;
        } catch { /* ignore */ }
        setPasswordResetMsg({ type: 'error', text: errMsg });
      } else if (result?.error) {
        setPasswordResetMsg({ type: 'error', text: result.error });
      } else {
        setPasswordResetMsg({ type: 'success', text: 'Sifre basariyla guncellendi' });
        setNewPassword('');
      }
    } catch (e) {
      setPasswordResetMsg({ type: 'error', text: String(e) });
    }
    setResettingPassword(false);
  };

  const saveRoles = async () => {
    setSaving(true);
    let finalRoleIds = [...userRoleIds];
    if (user.is_founder) {
      const adminRole = roles.find(r => r.name === 'Admin');
      if (adminRole && !finalRoleIds.includes(adminRole.id)) {
        finalRoleIds.push(adminRole.id);
      }
    }
    await supabase.from('user_roles').delete().eq('user_id', user.id);
    if (finalRoleIds.length > 0) {
      await supabase.from('user_roles').insert(
        finalRoleIds.map(rid => ({ user_id: user.id, role_id: rid, assigned_at: new Date().toISOString() }))
      );
    }
    logAudit({
      actionType: 'assign',
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.full_name,
      description: `${user.full_name} kullanicisinin rolleri guncellendi`,
      newValues: { role_ids: finalRoleIds },
    });
    await onSaved();
    setSaving(false);
  };

  const saveBrands = async () => {
    setSaving(true);
    const { data: existing } = await supabase
      .from('brand_members')
      .select('brand_id, id, is_active')
      .eq('user_id', user.id);

    const existingIds = new Set((existing || []).map(m => m.brand_id));
    const toInsert = userBrandIds.filter(id => !existingIds.has(id));
    const toActivate = (existing || []).filter(m => !m.is_active && userBrandIds.includes(m.brand_id));
    const toDeactivate = (existing || []).filter(m => m.is_active && !userBrandIds.includes(m.brand_id));

    if (toInsert.length > 0) {
      await supabase.from('brand_members').insert(
        toInsert.map(brand_id => ({ brand_id, user_id: user.id, is_active: true }))
      );
    }
    for (const m of toActivate) {
      await supabase.from('brand_members').update({ is_active: true }).eq('id', m.id);
    }
    for (const m of toDeactivate) {
      await supabase.from('brand_members').update({ is_active: false }).eq('id', m.id);
    }
    await onSaved();
    setSaving(false);
  };

  const setOverride = async (permId: string, granted: boolean | null, reason = '') => {
    if (granted === null) {
      await supabase.from('user_permission_overrides')
        .delete().eq('user_id', user.id).eq('permission_id', permId);
      setOverrides(prev => prev.filter(o => o.permission_id !== permId));
    } else {
      await supabase.from('user_permission_overrides').upsert({
        user_id: user.id,
        permission_id: permId,
        granted,
        reason,
        overridden_at: new Date().toISOString(),
      }, { onConflict: 'user_id,permission_id' });
      setOverrides(prev => {
        const filtered = prev.filter(o => o.permission_id !== permId);
        filtered.push({ user_id: user.id, permission_id: permId, granted, reason });
        return filtered;
      });
    }
    logAudit({
      actionType: granted === null ? 'revoke' : 'assign',
      entityType: 'permission',
      entityId: permId,
      entityLabel: user.full_name,
      description: granted === null
        ? `${user.full_name} icin yetki gecersiz kilmasi kaldirildi`
        : `${user.full_name} icin yetki ${granted ? 'verildi' : 'engellendi'}`,
      newValues: { granted },
    });
    await onSaved();
  };

  const overrideMap = useMemo(() => {
    const m: Record<string, boolean | null> = {};
    for (const o of overrides) m[o.permission_id] = o.granted;
    return m;
  }, [overrides]);

  const moduleGroups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return map;
  }, [permissions]);

  const toggleRole = (id: string) => {
    if (user.is_founder && roles.find(r => r.id === id && r.name === 'Admin')) return;
    setUserRoleIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: user.avatar_color }}>
              {initials(user.full_name)}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{user.full_name || 'Adsiz'}</p>
              {user.username && <p className="text-xs text-slate-500">@{user.username}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-600 dark:text-slate-300 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-3 border-b border-slate-200 dark:border-white/5 flex-shrink-0 overflow-x-auto">
          {(['info', 'roles', 'brands', 'overrides'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-all whitespace-nowrap ${activeTab === tab ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/8' : 'text-slate-500 hover:text-slate-600 dark:text-slate-300'}`}>
              {tab === 'info' ? 'Bilgiler' : tab === 'roles' ? 'Roller' : tab === 'brands' ? 'Markalar' : 'Yetki Gecersiz Kilma'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'info' && (
            <PermissionGate permission="admin.users.edit" mode="page">
              <div className="space-y-4">
                <ModalField label="Ad Soyad">
                  <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40" />
                </ModalField>
                <ModalField label="Kullanici Adi">
                  <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="@kullanici_adi" className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40" />
                </ModalField>
                <ModalField label="Avatar Rengi">
                  <div className="flex gap-2">
                    {AVATAR_COLORS.map(c => (
                      <button key={c} onClick={() => setForm(p => ({ ...p, avatar_color: c }))}
                        className={`w-7 h-7 rounded-lg border-2 transition-all ${form.avatar_color === c ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </ModalField>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aktif Kullanici</span>
                  {user.is_founder ? (
                    <div className="flex items-center gap-1.5">
                      <div className="relative w-10 h-5 rounded-full bg-emerald-500 opacity-50 cursor-not-allowed">
                        <div className="absolute top-0.5 left-[22px] w-4 h-4 rounded-full bg-white shadow" />
                      </div>
                      <span className="text-[9px] text-amber-400 flex items-center gap-1"><Crown className="w-2.5 h-2.5" />Korumalı</span>
                    </div>
                  ) : (
                    <button onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                      className={`relative w-10 h-5 rounded-full transition-all duration-200 ${form.is_active ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${form.is_active ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  )}
                </div>
                <button onClick={saveInfo} disabled={saving}
                  className="w-full py-2.5 text-sm font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 mt-2">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Degisiklikleri Kaydet
                </button>

                <div className="pt-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-white/6" />
                    <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                      <KeyRound className="w-3 h-3" />
                      Sifre Sifirla
                    </span>
                    <div className="flex-1 h-px bg-white/6" />
                  </div>

                  {passwordResetMsg && (
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs mb-3 ${
                      passwordResetMsg.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                    }`}>
                      {passwordResetMsg.type === 'success'
                        ? <Check className="w-3.5 h-3.5 flex-shrink-0" />
                        : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                      {passwordResetMsg.text}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setPasswordResetMsg(null); }}
                      placeholder="Yeni sifre (min 6 karakter)"
                      className="flex-1 px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all"
                    />
                    <button
                      onClick={resetPassword}
                      disabled={resettingPassword || !newPassword}
                      className="px-4 py-2.5 text-sm font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 rounded-xl transition-all disabled:opacity-40 flex items-center gap-2 whitespace-nowrap"
                    >
                      {resettingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                      Sifirla
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-white/6" />
                    <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                      <Shield className="w-3 h-3" />
                      2FA Yonetimi
                    </span>
                    <div className="flex-1 h-px bg-white/6" />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/6 rounded-xl mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${mfaEnabled ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-slate-600'}`} />
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        {mfaEnabled === null ? 'Kontrol ediliyor...' : mfaEnabled ? '2FA Aktif' : '2FA Pasif'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {!mfaEnabled && mfaEnabled !== null && (
                        <button
                          onClick={async () => {
                            setResettingMfa(true);
                            setMfaMsg(null);
                            try {
                              await supabase.from('user_profiles').update({ require_2fa: true }).eq('id', user.id);
                              setMfaMsg({ type: 'success', text: '2FA zorunlu yapildi. Kullanici sonraki girisinde QR kod taratacak.' });
                            } catch (e) {
                              setMfaMsg({ type: 'error', text: String(e) });
                            }
                            setResettingMfa(false);
                          }}
                          disabled={resettingMfa}
                          className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1.5"
                        >
                          {resettingMfa ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                          2FA Zorunlu Yap
                        </button>
                      )}
                      {mfaEnabled && (
                        <button
                          onClick={async () => {
                            setResettingMfa(true);
                            setMfaMsg(null);
                            try {
                              const { data, error: fnError } = await supabase.functions.invoke('manage-mfa', {
                                body: { action: 'reset', target_user_id: user.id },
                              });
                              if (fnError) {
                                setMfaMsg({ type: 'error', text: fnError.message });
                              } else if (data?.error) {
                                setMfaMsg({ type: 'error', text: data.error });
                              } else {
                                await supabase.from('user_profiles').update({ require_2fa: false }).eq('id', user.id);
                                setMfaMsg({ type: 'success', text: '2FA sifirlandi ve devre disi birakildi.' });
                                setMfaEnabled(false);
                              }
                            } catch (e) {
                              setMfaMsg({ type: 'error', text: String(e) });
                            }
                            setResettingMfa(false);
                          }}
                          disabled={resettingMfa}
                          className="px-3 py-1.5 text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1.5"
                        >
                          {resettingMfa ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          2FA Kapat
                        </button>
                      )}
                    </div>
                  </div>

                  {mfaMsg && (
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs ${
                      mfaMsg.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                    }`}>
                      {mfaMsg.type === 'success' ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                      {mfaMsg.text}
                    </div>
                  )}
                </div>
              </div>
            </PermissionGate>
          )}

          {activeTab === 'roles' && (
            <PermissionGate permission="admin.users.assign_roles" mode="page">
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Kullaniciya birden fazla rol atanabilir. Birden fazla rol varsa en az bir rolde olan yetki gecerli olur.</p>
                {roles.map(role => {
                  const isLocked = user.is_founder && role.name === 'Admin';
                  return (
                    <label key={role.id} className={`flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/6 transition-all ${isLocked ? 'opacity-70 cursor-not-allowed bg-amber-500/5 border-amber-500/15' : 'hover:bg-slate-50 dark:bg-white/[0.02] cursor-pointer'}`}>
                      <div onClick={() => toggleRole(role.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 ${
                          userRoleIds.includes(role.id) ? 'border-cyan-400 bg-cyan-500/20' : 'border-white/20'
                        }`}>
                        {userRoleIds.includes(role.id) && <Check className="w-2.5 h-2.5 text-cyan-300" />}
                      </div>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{role.name}</p>
                          {isLocked && <span className="text-[9px] text-amber-400 flex items-center gap-0.5"><Crown className="w-2.5 h-2.5" />Korumalı</span>}
                        </div>
                        {role.description && <p className="text-xs text-slate-500">{role.description}</p>}
                      </div>
                    </label>
                  );
                })}
                <button onClick={saveRoles} disabled={saving}
                  className="w-full py-2.5 text-sm font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 mt-2">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Rolleri Kaydet
                </button>
              </div>
            </PermissionGate>
          )}

          {activeTab === 'brands' && (
            <PermissionGate permission="admin.users.edit" mode="page">
              <div className="space-y-3">
                {user.is_founder ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
                    <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-amber-300">Kurucu kullanici tum markalara otomatik olarak erisebilir.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">Kullanicinin erisebilecegi markalari secin. Isaretlenmemis markalar bu kullanici tarafindan gorulmez.</p>
                    {loadingBrands ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                      </div>
                    ) : brands.length === 0 ? (
                      <div className="text-sm text-slate-500 text-center py-8">Aktif marka bulunamadi</div>
                    ) : (
                      <div className="space-y-2">
                        {brands.map(brand => {
                          const isSelected = userBrandIds.includes(brand.id);
                          return (
                            <label
                              key={brand.id}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-white/15 bg-slate-100 dark:bg-white/[0.03]'
                                  : 'border-slate-200 dark:border-white/6 hover:bg-slate-50 dark:bg-white/[0.02]'
                              }`}
                            >
                              <div
                                onClick={() => setUserBrandIds(prev =>
                                  prev.includes(brand.id) ? prev.filter(id => id !== brand.id) : [...prev, brand.id]
                                )}
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 ${
                                  isSelected ? 'border-cyan-400 bg-cyan-500/20' : 'border-white/20'
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 text-cyan-300" />}
                              </div>
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: brand.color || '#6b7280' }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white">{brand.name}</p>
                                <p className="text-[11px] text-slate-500">{brand.slug}</p>
                              </div>
                              <Building2 className={`w-4 h-4 flex-shrink-0 transition-colors ${isSelected ? 'text-cyan-400' : 'text-slate-600'}`} />
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={saveBrands}
                      disabled={saving || loadingBrands}
                      className="w-full py-2.5 text-sm font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 mt-2"
                    >
                      {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Marka Erisimlerini Kaydet
                    </button>
                  </>
                )}
              </div>
            </PermissionGate>
          )}

          {activeTab === 'overrides' && (
            <PermissionGate permission="admin.users.permission_override" mode="page">
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Belirli yetkiler uzerinde bireysel geçersiz kilma uygulayabilirsiniz.
                  <span className="text-amber-400"> Sari</span> = Override aktif.
                </p>
                {loadingOverrides ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                  </div>
                ) : (
                  Array.from(moduleGroups.entries()).map(([module, modulePerms]) => {
                    const isCollapsed = collapsedModules.has(module);
                    const overrideCount = modulePerms.filter(p => overrideMap[p.id] !== undefined).length;
                    return (
                      <div key={module} className="border border-slate-200 dark:border-white/6 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setCollapsedModules(prev => {
                            const n = new Set(prev);
                            if (n.has(module)) n.delete(module); else n.add(module);
                            return n;
                          })}
                          className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
                        >
                          <Shield className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs font-semibold text-slate-900 dark:text-white flex-1 text-left">{module}</span>
                          {overrideCount > 0 && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded-full">
                              {overrideCount} override
                            </span>
                          )}
                          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-slate-600" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-600" />}
                        </button>
                        {!isCollapsed && (
                          <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                            {modulePerms.map(perm => {
                              const fromRole = !!rolePermMap[perm.id];
                              const override = overrideMap[perm.id];
                              const hasOverride = override !== undefined;
                              return (
                                <PermissionOverrideRow
                                  key={perm.id}
                                  perm={perm}
                                  fromRole={fromRole}
                                  override={hasOverride ? override : null}
                                  hasOverride={hasOverride}
                                  onSet={(granted) => setOverride(perm.id, granted)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </PermissionGate>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionOverrideRow({ perm, fromRole, override, hasOverride, onSet }: {
  perm: Permission;
  fromRole: boolean;
  override: boolean | null;
  hasOverride: boolean;
  onSet: (granted: boolean | null) => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${hasOverride ? 'bg-amber-500/5' : 'hover:bg-slate-50/50 dark:bg-white/[0.01]'}`}>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${hasOverride ? 'text-amber-200' : 'text-slate-600 dark:text-slate-300'}`}>{perm.label}</span>
        <p className="text-[10px] text-slate-600 font-mono mt-0.5">{perm.key}</p>
      </div>
      <div className="text-[10px] text-slate-600 flex-shrink-0 hidden sm:block">
        Rol: <span className={fromRole ? 'text-emerald-400' : 'text-slate-500'}>{fromRole ? 'Verilmis' : 'Yok'}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          title="Rolden Al (override kaldir)"
          onClick={() => onSet(null)}
          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all text-xs ${
            !hasOverride ? 'bg-slate-500/20 border-slate-500/30 text-slate-600 dark:text-slate-300' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/8 text-slate-600 hover:text-slate-600 dark:text-slate-300'
          }`}
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          title="Her zaman ver"
          onClick={() => onSet(true)}
          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
            hasOverride && override === true ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/8 text-slate-600 hover:text-emerald-400'
          }`}
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          title="Her zaman engelle"
          onClick={() => onSet(false)}
          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
            hasOverride && override === false ? 'bg-rose-500/20 border-rose-500/30 text-rose-300' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/8 text-slate-600 hover:text-rose-400'
          }`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
