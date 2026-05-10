import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';

interface PermissionGateProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
  mode?: 'hide' | 'disable' | 'page';
}

export function PermissionGate({ permission, children, fallback, mode = 'hide' }: PermissionGateProps) {
  const { hasPermission, permissionsLoading } = useAuth();

  if (permissionsLoading) return null;

  if (hasPermission(permission)) return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  if (mode === 'page') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/8 flex items-center justify-center">
          <Lock className="w-7 h-7 text-slate-500" />
        </div>
        <div>
          <p className="text-slate-900 dark:text-white font-semibold">Erisim Yetkiniz Yok</p>
          <p className="text-sm text-slate-500 mt-1">Bu bolume erisim icin gerekli yetkiye sahip degilsiniz.</p>
        </div>
      </div>
    );
  }

  return null;
}

export function usePermission(key: string) {
  const { hasPermission } = useAuth();
  return hasPermission(key);
}
