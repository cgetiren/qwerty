import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { logAudit } from './auditLogger';
import type { Session } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  full_name: string;
  username: string | null;
  is_active: boolean;
  avatar_color: string;
  last_login_at: string | null;
  is_founder: boolean;
}

export interface UserRole {
  role_id: string;
  role_name: string;
  role_color: string;
}

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  permissionsLoading: boolean;
  profile: UserProfile | null;
  userRoles: UserRole[];
  permissions: Set<string>;
  hasPermission: (key: string) => boolean;
  reloadPermissions: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  permissionsLoading: false,
  profile: null,
  userRoles: [],
  permissions: new Set(),
  hasPermission: () => false,
  reloadPermissions: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const loadPermissions = useCallback(async (userId: string) => {
    setPermissionsLoading(true);
    try {
      const [rolesRes, permRes, overrideRes, profileRes] = await Promise.all([
        supabase
          .from('user_roles')
          .select('role_id, roles(name, color)')
          .eq('user_id', userId),
        supabase.rpc('get_user_permissions', { p_user_id: userId }),
        supabase
          .from('user_permission_overrides')
          .select('permission_id, granted, permissions(key)')
          .eq('user_id', userId),
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
      ]);

      if (rolesRes.data) {
        setUserRoles(
          rolesRes.data.map((r: any) => ({
            role_id: r.role_id,
            role_name: r.roles?.name ?? '',
            role_color: r.roles?.color ?? '#6b7280',
          }))
        );
      }

      const permMap: Record<string, boolean> = permRes.data ?? {};
      const finalPerms = new Set<string>();
      for (const [key, granted] of Object.entries(permMap)) {
        if (granted) finalPerms.add(key);
      }

      if (overrideRes.data) {
        for (const ov of (overrideRes.data ?? [])) {
          const key = (ov as any).permissions?.key;
          if (!key) continue;
          if (ov.granted) finalPerms.add(key);
          else finalPerms.delete(key);
        }
      }

      setPermissions(finalPerms);

      if (profileRes.data) {
        setProfile(profileRes.data as UserProfile);
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
      setPermissions(new Set());
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSession(null);
      setLoading(false);
    }, 5000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      clearTimeout(timeoutId);
      setSession(s);
      setLoading(false);
      if (s?.user?.id) {
        loadPermissions(s.user.id);
      }
    }).catch(() => {
      clearTimeout(timeoutId);
      setSession(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
      if (s?.user?.id) {
        (async () => {
          if (_event !== 'TOKEN_REFRESHED') {
            await loadPermissions(s.user.id);
          }
          if (_event === 'SIGNED_IN') {
            await supabase.from('user_profiles')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', s.user.id);
          }
        })();
      } else {
        setPermissions(new Set());
        setUserRoles([]);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadPermissions]);

  const reloadPermissions = useCallback(async () => {
    if (session?.user?.id) await loadPermissions(session.user.id);
  }, [session, loadPermissions]);

  const hasPermission = useCallback((key: string): boolean => {
    return permissions.has(key);
  }, [permissions]);

  const signOut = async () => {
    await logAudit({ actionType: 'logout', entityType: 'user', description: 'Kullanici cikis yapti' });
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{
      session, loading, permissionsLoading,
      profile, userRoles, permissions,
      hasPermission, reloadPermissions, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
