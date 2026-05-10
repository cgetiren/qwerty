import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut, RefreshCw, X, ChevronRight, ChevronDown, Check, Building2, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useBrand, type Brand } from '../lib/brand';
import { useTheme } from '../lib/theme';
import { useBackgroundSync } from '../lib/backgroundSync';
import { navigationGroups, accentClasses, initials } from '../lib/navigation';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

function BrandSwitcher() {
  const { brands, activeBrand, setActiveBrand, loading } = useBrand();
  const [open, setOpen] = useState(false);

  if (loading || brands.length === 0) return null;
  if (brands.length === 1 && activeBrand) {
    return (
      <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-2.5">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
          style={{ backgroundColor: activeBrand.brand_color }}
        >
          {initials(activeBrand.brand_name)}
        </div>
        <span className="text-xs font-medium text-slate-300 truncate">{activeBrand.brand_name}</span>
      </div>
    );
  }

  return (
    <div className="relative mx-3 mb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.10] transition-all duration-200"
      >
        {activeBrand ? (
          <>
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: activeBrand.brand_color }}
            >
              {initials(activeBrand.brand_name)}
            </div>
            <span className="flex-1 text-left text-xs font-medium text-slate-300 truncate">{activeBrand.brand_name}</span>
          </>
        ) : (
          <>
            <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="flex-1 text-left text-xs text-slate-500">Marka sec</span>
          </>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-[#0d1117] border border-white/[0.10] rounded-xl shadow-2xl overflow-hidden">
            {brands.map((brand: Brand) => (
              <button
                key={brand.brand_id}
                onClick={() => { setActiveBrand(brand); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.05] transition-all duration-150 text-left"
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: brand.brand_color }}
                >
                  {initials(brand.brand_name)}
                </div>
                <span className="flex-1 text-xs font-medium text-slate-300 truncate">{brand.brand_name}</span>
                {activeBrand?.brand_id === brand.brand_id && (
                  <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Sidebar({ sidebarOpen: _sidebarOpen, setSidebarOpen }: SidebarProps) {
  const { profile, userRoles, permissions, permissionsLoading, hasPermission, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { syncStatus } = useBackgroundSync();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const isFounder = profile?.is_founder ?? false;
  const userDisplayName = profile?.full_name || 'Kullanici';
  const primaryRole = userRoles[0];

  const permissionsReady = !permissionsLoading && (permissions.size > 0 || userRoles.length > 0);

  const visibleGroups = permissionsReady
    ? navigationGroups
        .map(group => ({
          ...group,
          items: group.items.filter(item => {
            if (item.founderOnly) return isFounder;
            return !item.permission || hasPermission(item.permission);
          }),
        }))
        .filter(group => group.items.length > 0)
    : navigationGroups;

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleNavClick = (id: string) => {
    navigate(`/${id}`);
    setSidebarOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="relative px-5 pt-6 pb-5 border-b border-white/5 flex items-center justify-between overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/8 via-transparent to-emerald-500/5 pointer-events-none" />
        <div className="absolute -top-8 -left-8 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-emerald-400 rounded-xl blur-sm opacity-40" />
            <div className="relative w-9 h-9 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-cyan-500/30 flex items-center justify-center overflow-hidden shadow-lg">
              <img src="/image.png" alt="Logo" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold bg-gradient-to-r from-cyan-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent tracking-tight leading-none">
              LiveChat QA
            </h1>
            <p className="text-[10px] text-slate-500 mt-0.5 tracking-wide uppercase font-medium">Kalite Kontrol</p>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden relative p-1.5 rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-all duration-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="pt-3 pb-1">
        <BrandSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 scrollbar-hide space-y-1">
        {visibleGroups.map((group, gi) => {
          const isCollapsed = group.label ? collapsedGroups.has(group.label) : false;
          const hasActiveItem = group.items.some(i => location.pathname === `/${i.id}`);
          const groupAccent = accentClasses[group.accent];
          const GroupIcon = group.icon;
          return (
            <div key={gi}>
              {group.label && GroupIcon && (
                <button
                  onClick={() => toggleGroup(group.label!)}
                  className={`
                    relative w-full flex items-center gap-3 px-3 py-3 rounded-xl font-medium mb-0.5
                    transition-all duration-300 group/header overflow-hidden
                    bg-gradient-to-r ${groupAccent.bg} border border-white/8
                    shadow-lg ${groupAccent.glow}
                    ${hasActiveItem ? 'opacity-100' : 'opacity-70 hover:opacity-100'}
                  `}
                >
                  <div className={`absolute -left-4 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full blur-2xl pointer-events-none transition-opacity duration-300 opacity-40 ${groupAccent.iconBg.split(' ')[0].replace('bg-', 'bg-').replace('/20', '/30')}`} />
                  <span className={`
                    relative flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 transition-all duration-300
                    ${groupAccent.iconBg} shadow-md
                  `}>
                    <div className={`absolute inset-0 rounded-xl blur-sm opacity-50 ${groupAccent.iconBg.split(' ')[0]}`} />
                    <GroupIcon className="w-5 h-5 relative z-10" />
                  </span>
                  <span className={`flex-1 text-left text-sm font-semibold transition-colors duration-200 ${groupAccent.text}`}>
                    {group.label}
                  </span>
                  {hasActiveItem && isCollapsed && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse ${groupAccent.iconBg.includes('cyan') ? 'bg-cyan-400' : groupAccent.iconBg.includes('emerald') ? 'bg-emerald-400' : groupAccent.iconBg.includes('amber') ? 'bg-amber-400' : groupAccent.iconBg.includes('rose') ? 'bg-rose-400' : 'bg-slate-400'}`} />
                  )}
                  <ChevronRight className={`w-4 h-4 ${groupAccent.text} opacity-60 transition-all duration-300 flex-shrink-0 ${isCollapsed ? 'rotate-0' : 'rotate-90'}`} />
                </button>
              )}
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                <div className={group.label ? 'pl-3 border-l border-white/5 ml-4 mb-1' : ''}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === `/${item.id}`;
                    const accent = accentClasses[item.accent];
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`
                          relative w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 font-medium
                          transition-all duration-200 group overflow-hidden
                          ${isActive
                            ? `bg-gradient-to-r ${accent.bg} ${accent.text} shadow-lg ${accent.glow} border border-white/8`
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                          }
                        `}
                      >
                        {isActive && (
                          <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full ${accent.border.replace('border-', 'bg-')}`} />
                        )}
                        <span className={`
                          relative flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 transition-all duration-200
                          ${isActive ? accent.iconBg : 'bg-white/5 text-slate-400 group-hover:bg-white/8 group-hover:text-slate-200'}
                        `}>
                          <Icon className="w-5 h-5" />
                        </span>
                        <span className="flex-1 text-left truncate text-sm">{item.name}</span>
                        {isActive && (
                          <ChevronRight className="w-4 h-4 opacity-60 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-3 pb-4 pt-2 border-t border-white/5 space-y-2">
        <div className={`
          px-3.5 py-2.5 rounded-xl border transition-all duration-300
          ${syncStatus.syncing || syncStatus.analyzing
            ? 'bg-cyan-500/8 border-cyan-500/20'
            : syncStatus.error
            ? 'bg-rose-500/8 border-rose-500/20'
            : 'bg-emerald-500/8 border-emerald-500/20'
          }
        `}>
          <div className="flex items-center gap-2.5">
            {syncStatus.syncing || syncStatus.analyzing ? (
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin flex-shrink-0" />
            ) : syncStatus.error ? (
              <div className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 shadow-lg shadow-rose-500/50" />
            ) : (
              <div className="relative flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-60" />
              </div>
            )}
            <div className="min-w-0">
              <p className={`text-xs font-medium truncate leading-none ${
                syncStatus.syncing || syncStatus.analyzing ? 'text-cyan-300' :
                syncStatus.error ? 'text-rose-300' : 'text-emerald-300'
              }`}>
                {syncStatus.syncing ? 'Senkronize ediliyor...' :
                 syncStatus.analyzing ? 'Analiz ediliyor...' :
                 syncStatus.error ? 'Baglanti hatasi' :
                 'Otomatik senk. aktif'}
              </p>
              {syncStatus.lastSyncTime && (
                <p className="text-[10px] text-slate-600 mt-0.5">
                  Son: {new Date(syncStatus.lastSyncTime).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: profile?.avatar_color ?? '#0891b2' }}
          >
            {initials(userDisplayName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-300 truncate">{userDisplayName}</p>
            {primaryRole && (
              <p className="text-[10px] font-medium truncate" style={{ color: primaryRole.role_color }}>
                {primaryRole.role_name}
              </p>
            )}
          </div>
          {isFounder && (
            <span className="text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
              FOUNDER
            </span>
          )}
        </div>

        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-all duration-200 border border-transparent hover:border-white/10 group"
        >
          <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-white/10 transition-all duration-200">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </span>
          <span className="text-[13px] font-medium">{theme === 'dark' ? 'Acik Tema' : 'Koyu Tema'}</span>
        </button>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 border border-transparent hover:border-rose-500/20 group"
        >
          <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-rose-500/15 transition-all duration-200">
            <LogOut className="w-4 h-4" />
          </span>
          <span className="text-[13px] font-medium">Cikis Yap</span>
        </button>
      </div>
    </div>
  );
}
