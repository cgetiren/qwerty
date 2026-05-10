import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Shield, Plus, CreditCard as Edit2, Trash2, Check, X, ChevronDown, ChevronUp, Users, Lock, Unlock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { PermissionGate } from '../components/PermissionGate';
import { logAudit } from '../lib/auditLogger';

interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  is_system: boolean;
  priority: number;
  user_count?: number;
}

interface Permission {
  id: string;
  key: string;
  label: string;
  description: string;
  module: string;
  sub_module: string;
  sort_order: number;
}

interface RolePermission {
  role_id: string;
  permission_id: string;
  granted: boolean;
}

const ROLE_COLORS = [
  '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0284c7', '#65a30d',
  '#6b7280', '#374151',
];

function groupByModule(permissions: Permission[]) {
  const map = new Map<string, Permission[]>();
  for (const p of permissions) {
    const list = map.get(p.module) ?? [];
    list.push(p);
    map.set(p.module, list);
  }
  return map;
}

export default function RoleManagement() {
  return (
    <PermissionGate permission="admin.roles.view" mode="page">
      <RoleManagementInner />
    </PermissionGate>
  );
}

function RoleManagementInner() {
  const { reloadPermissions } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [savingPerms, setSavingPerms] = useState<Set<string>>(new Set());
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [rolesRes, permsRes, rpRes, ucRes] = await Promise.all([
      supabase.from('roles').select('*').order('priority', { ascending: false }),
      supabase.from('permissions').select('*').order('module').order('sort_order'),
      supabase.from('role_permissions').select('*'),
      supabase.from('user_roles').select('role_id'),
    ]);
    if (rolesRes.data) setRoles(rolesRes.data as Role[]);
    if (permsRes.data) setPermissions(permsRes.data as Permission[]);
    if (rpRes.data) setRolePermissions(rpRes.data as RolePermission[]);
    if (ucRes.data) {
      const counts: Record<string, number> = {};
      for (const r of ucRes.data) {
        counts[r.role_id] = (counts[r.role_id] ?? 0) + 1;
      }
      setUserCounts(counts);
    }
    if (rolesRes.data && rolesRes.data.length > 0 && !selectedRoleId) {
      setSelectedRoleId(rolesRes.data[0].id);
    }
    setLoading(false);
  }, [selectedRoleId]);

  useEffect(() => { fetchAll(); }, []);

  const selectedRole = roles.find(r => r.id === selectedRoleId);

  const grantedSet = useMemo(() => {
    if (!selectedRoleId) return new Set<string>();
    return new Set(
      rolePermissions
        .filter(rp => rp.role_id === selectedRoleId && rp.granted)
        .map(rp => rp.permission_id)
    );
  }, [rolePermissions, selectedRoleId]);

  const togglePermission = async (permId: string, currentlyGranted: boolean) => {
    if (!selectedRoleId) return;
    const key = `${selectedRoleId}:${permId}`;
    setSavingPerms(prev => new Set(prev).add(key));

    const newGranted = !currentlyGranted;
    if (newGranted) {
      await supabase.from('role_permissions').upsert(
        { role_id: selectedRoleId, permission_id: permId, granted: true },
        { onConflict: 'role_id,permission_id' }
      );
    } else {
      await supabase.from('role_permissions')
        .delete()
        .eq('role_id', selectedRoleId)
        .eq('permission_id', permId);
    }

    setRolePermissions(prev => {
      const filtered = prev.filter(rp => !(rp.role_id === selectedRoleId && rp.permission_id === permId));
      if (newGranted) filtered.push({ role_id: selectedRoleId, permission_id: permId, granted: true });
      return filtered;
    });

    setSavingPerms(prev => { const n = new Set(prev); n.delete(key); return n; });
    const selectedRole = roles.find(r => r.id === selectedRoleId);
    const changedPerm = permissions.find(p => p.id === permId);
    logAudit({
      actionType: newGranted ? 'assign' : 'revoke',
      entityType: 'role',
      entityId: selectedRoleId,
      entityLabel: selectedRole?.name,
      description: `"${selectedRole?.name}" rolunde "${changedPerm?.label}" yetkisi ${newGranted ? 'verildi' : 'alindi'}`,
      newValues: { permission_key: changedPerm?.key, granted: newGranted },
    });
    await reloadPermissions();
  };

  const toggleModule = async (modulePerms: Permission[], allGranted: boolean) => {
    if (!selectedRoleId) return;
    const newGranted = !allGranted;

    if (newGranted) {
      const rows = modulePerms.map(p => ({ role_id: selectedRoleId, permission_id: p.id, granted: true }));
      await supabase.from('role_permissions').upsert(rows, { onConflict: 'role_id,permission_id' });
    } else {
      await supabase.from('role_permissions')
        .delete()
        .eq('role_id', selectedRoleId)
        .in('permission_id', modulePerms.map(p => p.id));
    }

    setRolePermissions(prev => {
      const filtered = prev.filter(
        rp => !(rp.role_id === selectedRoleId && modulePerms.some(p => p.id === rp.permission_id))
      );
      if (newGranted) {
        filtered.push(...modulePerms.map(p => ({ role_id: selectedRoleId, permission_id: p.id, granted: true })));
      }
      return filtered;
    });

    await reloadPermissions();
  };

  const deleteRole = async (role: Role) => {
    if (role.is_system) return;
    if (!confirm(`"${role.name}" rolunu silmek istediginizden emin misiniz?`)) return;
    await supabase.from('roles').delete().eq('id', role.id);
    setRoles(prev => prev.filter(r => r.id !== role.id));
    if (selectedRoleId === role.id) setSelectedRoleId(roles[0]?.id ?? null);
  };

  const moduleGroups = useMemo(() => groupByModule(permissions), [permissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Rol Yonetimi</h1>
          <p className="text-sm text-slate-500 mt-1">Rolleri ve yetki matrisini yonet</p>
        </div>
        <PermissionGate permission="admin.roles.create">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Yeni Rol
          </button>
        </PermissionGate>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 flex-shrink-0 space-y-2">
          {roles.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              userCount={userCounts[role.id] ?? 0}
              isSelected={selectedRoleId === role.id}
              onSelect={() => setSelectedRoleId(role.id)}
              onEdit={() => setEditingRole(role)}
              onDelete={() => deleteRole(role)}
            />
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {selectedRole ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-white/5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedRole.color }} />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{selectedRole.name}</h2>
                <span className="text-xs text-slate-500">{grantedSet.size} yetki aktif</span>
              </div>

              {Array.from(moduleGroups.entries()).map(([module, modulePerms]) => {
                const allGranted = modulePerms.every(p => grantedSet.has(p.id));
                const someGranted = modulePerms.some(p => grantedSet.has(p.id));
                const isCollapsed = collapsedModules.has(module);
                return (
                  <ModuleSection
                    key={module}
                    module={module}
                    permissions={modulePerms}
                    grantedSet={grantedSet}
                    allGranted={allGranted}
                    someGranted={someGranted}
                    isCollapsed={isCollapsed}
                    savingPerms={savingPerms}
                    roleId={selectedRoleId!}
                    onToggleCollapse={() => {
                      setCollapsedModules(prev => {
                        const n = new Set(prev);
                        if (n.has(module)) n.delete(module);
                        else n.add(module);
                        return n;
                      });
                    }}
                    onTogglePermission={togglePermission}
                    onToggleModule={() => toggleModule(modulePerms, allGranted)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <p className="text-sm">Yetki matrisini gormek icin bir rol secin</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <RoleModal
          roles={roles}
          onClose={() => setShowCreateModal(false)}
          onSave={async (data) => {
            const { data: newRole } = await supabase
              .from('roles')
              .insert({ name: data.name, description: data.description, color: data.color, priority: 0 })
              .select()
              .single();
            if (newRole && data.copyFromId) {
              const sourcePerm = rolePermissions.filter(rp => rp.role_id === data.copyFromId && rp.granted);
              if (sourcePerm.length > 0) {
                await supabase.from('role_permissions').insert(
                  sourcePerm.map(rp => ({ role_id: newRole.id, permission_id: rp.permission_id, granted: true }))
                );
              }
            }
            if (newRole) {
              logAudit({
                actionType: 'create',
                entityType: 'role',
                entityId: newRole.id,
                entityLabel: data.name,
                description: `"${data.name}" rolu olusturuldu`,
                newValues: { name: data.name, description: data.description, copy_from: data.copyFromId || null },
              });
            }
            await fetchAll();
            if (newRole) setSelectedRoleId(newRole.id);
            setShowCreateModal(false);
          }}
        />
      )}

      {editingRole && (
        <EditRoleModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSave={async (data) => {
            await supabase.from('roles')
              .update({ name: data.name, description: data.description, color: data.color })
              .eq('id', editingRole.id);
            logAudit({
              actionType: 'update',
              entityType: 'role',
              entityId: editingRole.id,
              entityLabel: data.name,
              description: `"${editingRole.name}" rolu guncellendi`,
              oldValues: { name: editingRole.name, description: editingRole.description, color: editingRole.color },
              newValues: { name: data.name, description: data.description, color: data.color },
            });
            setRoles(prev => prev.map(r => r.id === editingRole.id ? { ...r, ...data } : r));
            setEditingRole(null);
          }}
        />
      )}
    </div>
  );
}

function RoleCard({
  role, userCount, isSelected, onSelect, onEdit, onDelete
}: {
  role: Role; userCount: number; isSelected: boolean;
  onSelect: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`relative rounded-xl border p-3 cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'border-cyan-500/40 bg-cyan-500/5 shadow-lg shadow-cyan-500/10'
          : 'border-slate-200 dark:border-white/6 bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:border-slate-300 dark:border-white/10'
      }`}
    >
      {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-cyan-400 rounded-r-full" />}
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{role.name}</span>
            {role.is_system && (
              <span className="text-[9px] text-slate-500 border border-slate-600/30 px-1.5 py-0.5 rounded-full">SYS</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Users className="w-2.5 h-2.5 text-slate-600" />
            <span className="text-[10px] text-slate-500">{userCount} kullanici</span>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <PermissionGate permission="admin.roles.edit">
            <button
              onClick={onEdit}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5 transition-all"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </PermissionGate>
          {!role.is_system && (
            <PermissionGate permission="admin.roles.delete">
              <button
                onClick={onDelete}
                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </PermissionGate>
          )}
        </div>
      </div>
      {role.description && (
        <p className="text-[10px] text-slate-600 mt-1.5 pl-5 line-clamp-1">{role.description}</p>
      )}
    </div>
  );
}

function ModuleSection({
  module, permissions, grantedSet, allGranted, someGranted, isCollapsed,
  savingPerms, roleId, onToggleCollapse, onTogglePermission, onToggleModule
}: {
  module: string;
  permissions: Permission[];
  grantedSet: Set<string>;
  allGranted: boolean;
  someGranted: boolean;
  isCollapsed: boolean;
  savingPerms: Set<string>;
  roleId: string;
  onToggleCollapse: () => void;
  onTogglePermission: (id: string, granted: boolean) => void;
  onToggleModule: () => void;
}) {
  return (
    <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/6 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
        <button onClick={onToggleCollapse} className="flex items-center gap-2 flex-1 min-w-0">
          <Shield className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{module}</span>
          <span className="text-xs text-slate-600 ml-1">
            {permissions.filter(p => grantedSet.has(p.id)).length}/{permissions.length}
          </span>
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-slate-600 ml-auto" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-600 ml-auto" />}
        </button>
        <PermissionGate permission="admin.roles.assign_permissions">
          <button
            onClick={onToggleModule}
            className={`ml-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all flex-shrink-0 ${
              allGranted
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            {allGranted ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {allGranted ? 'Tumunu Kapat' : someGranted ? 'Tumunu Ac' : 'Tumunu Ac'}
          </button>
        </PermissionGate>
      </div>

      {!isCollapsed && (
        <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
          {permissions.map(perm => {
            const granted = grantedSet.has(perm.id);
            const saving = savingPerms.has(`${roleId}:${perm.id}`);
            return (
              <div key={perm.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{perm.label}</span>
                    {perm.sub_module && (
                      <span className="text-[9px] text-slate-600 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5">
                        {perm.sub_module}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{perm.key}</p>
                </div>
                <PermissionGate
                  permission="admin.roles.assign_permissions"
                  fallback={
                    <div className={`w-8 h-4 rounded-full flex-shrink-0 ${granted ? 'bg-emerald-500/50' : 'bg-slate-700/50'}`} />
                  }
                >
                  <button
                    onClick={() => onTogglePermission(perm.id, granted)}
                    disabled={saving}
                    className={`relative w-8 h-4 rounded-full flex-shrink-0 transition-all duration-200 disabled:opacity-50 ${
                      granted ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200 ${granted ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </PermissionGate>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ModalFormData {
  name: string;
  description: string;
  color: string;
  copyFromId: string;
}

function RoleModal({ roles, onClose, onSave }: {
  roles: Role[];
  onClose: () => void;
  onSave: (data: ModalFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<ModalFormData>({ name: '', description: '', color: ROLE_COLORS[0], copyFromId: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-white/10 rounded-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Yeni Rol Olustur</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-600 dark:text-slate-300 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <FormField label="Rol Adi">
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="ornegin: Muhasebe Gozetmeni"
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
            />
          </FormField>
          <FormField label="Aciklama">
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Kisa aciklama"
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
            />
          </FormField>
          <FormField label="Renk">
            <div className="flex flex-wrap gap-2">
              {ROLE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </FormField>
          <FormField label="Mevcut Rolden Yetkiler Kopyala (opsiyonel)">
            <select
              value={form.copyFromId}
              onChange={e => setForm(p => ({ ...p, copyFromId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500/40"
            >
              <option value="">Bos baslat</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </FormField>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/8 rounded-xl hover:bg-slate-100 dark:bg-white/5 transition-all">
            Iptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="flex-1 py-2.5 text-sm font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-3.5 h-3.5 border border-cyan-400/40 border-t-cyan-300 rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Olustur
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRoleModal({ role, onClose, onSave }: {
  role: Role;
  onClose: () => void;
  onSave: (data: { name: string; description: string; color: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: role.name, description: role.description, color: role.color });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-white/10 rounded-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Rol Duzenle</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:bg-white/5 hover:text-slate-600 dark:text-slate-300 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <FormField label="Rol Adi">
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              disabled={role.is_system}
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
            />
          </FormField>
          <FormField label="Aciklama">
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
            />
          </FormField>
          <FormField label="Renk">
            <div className="flex flex-wrap gap-2">
              {ROLE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </FormField>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/8 rounded-xl hover:bg-slate-100 dark:bg-white/5 transition-all">
            Iptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-3.5 h-3.5 border border-cyan-400/40 border-t-cyan-300 rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
