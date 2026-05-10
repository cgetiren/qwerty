import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useBrand } from '../lib/brand';
import { useAuth } from '../lib/auth';
import {
  Shield, RefreshCw, ChevronDown, ChevronUp, Filter, Search,
  Eye, Edit, Trash2, Flag, RotateCcw, Download, LogIn, LogOut,
  UserPlus, UserMinus, Zap, Clock, User, FileText, X, ChevronLeft, ChevronRight,
} from 'lucide-react';

interface AuditLog {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  description: string | null;
  old_values: any;
  new_values: any;
  metadata: any;
  brand_id: string | null;
  created_at: string;
}

const BRAND_NAMES: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'Benja',
  '00000000-0000-0000-0000-000000000003': 'Dil',
  'c1fbe05a-a1f0-4811-af59-6aa8c79032ba': 'MarkBia',
};

const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  view: { label: 'Goruntuleme', color: 'text-slate-500 dark:text-slate-400 bg-slate-400/10', icon: Eye },
  create: { label: 'Olusturma', color: 'text-emerald-400 bg-emerald-400/10', icon: UserPlus },
  update: { label: 'Guncelleme', color: 'text-amber-400 bg-amber-400/10', icon: Edit },
  delete: { label: 'Silme', color: 'text-red-400 bg-red-400/10', icon: Trash2 },
  flag: { label: 'Isaretleme', color: 'text-rose-400 bg-rose-400/10', icon: Flag },
  resolve: { label: 'Cozumleme', color: 'text-emerald-400 bg-emerald-400/10', icon: RotateCcw },
  reanalyze: { label: 'Yeniden Analiz', color: 'text-cyan-400 bg-cyan-400/10', icon: Zap },
  export: { label: 'Disa Aktarma', color: 'text-sky-400 bg-sky-400/10', icon: Download },
  sync: { label: 'Senkronizasyon', color: 'text-cyan-400 bg-cyan-400/10', icon: RefreshCw },
  login: { label: 'Giris', color: 'text-emerald-400 bg-emerald-400/10', icon: LogIn },
  logout: { label: 'Cikis', color: 'text-slate-500 dark:text-slate-400 bg-slate-400/10', icon: LogOut },
  assign: { label: 'Atama', color: 'text-amber-400 bg-amber-400/10', icon: UserPlus },
  revoke: { label: 'Geri Alma', color: 'text-red-400 bg-red-400/10', icon: UserMinus },
};

const ENTITY_LABELS: Record<string, string> = {
  chat: 'Chat',
  chat_analysis: 'Chat Analizi',
  personnel: 'Personel',
  user: 'Kullanici',
  role: 'Rol',
  permission: 'Yetki',
  brand: 'Marka',
  setting: 'Ayar',
  bonus_rule: 'Prim Kurali',
  bonus_report: 'Prim Raporu',
  coaching: 'Kocluk',
  callback: 'Geri Arama',
  alert: 'Uyari',
  sync_job: 'Sync Job',
  page: 'Sayfa',
};

function formatIst(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az once';
  if (mins < 60) return `${mins} dk once`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat once`;
  const days = Math.floor(hours / 24);
  return `${days} gun once`;
}

const PAGE_SIZE = 50;

export default function AuditLogs() {
  const { hasPermission, profile } = useAuth();
  const { activeBrand } = useBrand();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterBrand, setFilterBrand] = useState('');

  // Unique users for filter dropdown
  const [uniqueUsers, setUniqueUsers] = useState<{ id: string; name: string }[]>([]);

  const canView = hasPermission('admin.audit.view') || profile?.is_founder;

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .order('full_name');
    if (data) setUniqueUsers(data.map(u => ({ id: u.id, name: u.full_name })));
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterUser) query = query.eq('user_id', filterUser);
    if (filterAction) query = query.eq('action_type', filterAction);
    if (filterEntity) query = query.eq('entity_type', filterEntity);
    if (filterBrand) query = query.eq('brand_id', filterBrand);
    if (filterDateFrom) query = query.gte('created_at', new Date(filterDateFrom).toISOString());
    if (filterDateTo) query = query.lte('created_at', new Date(filterDateTo + 'T23:59:59').toISOString());
    if (filterSearch) query = query.or(`description.ilike.%${filterSearch}%,entity_label.ilike.%${filterSearch}%,user_name.ilike.%${filterSearch}%`);

    const { data, count, error } = await query;
    if (error) {
      console.error('Audit logs fetch error:', error);
    } else {
      setLogs(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [page, filterUser, filterAction, filterEntity, filterSearch, filterDateFrom, filterDateTo, filterBrand]);

  useEffect(() => { if (canView) fetchUsers(); }, [canView, fetchUsers]);
  useEffect(() => { if (canView) fetchLogs(); }, [canView, fetchLogs]);

  const clearFilters = () => {
    setFilterUser('');
    setFilterAction('');
    setFilterEntity('');
    setFilterSearch('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterBrand('');
    setPage(0);
  };

  const hasActiveFilters = filterUser || filterAction || filterEntity || filterSearch || filterDateFrom || filterDateTo || filterBrand;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Shield className="w-12 h-12 text-rose-400/50 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">Bu sayfayi goruntulemek icin yetkiniz yok.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Denetim Gunlugu</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{totalCount.toLocaleString('tr-TR')} kayit</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
              hasActiveFilters
                ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:bg-white/10 border border-slate-300 dark:border-white/10'
            }`}
          >
            <Filter size={14} />
            Filtrele
            {hasActiveFilters && (
              <span className="bg-rose-500/30 text-rose-200 text-xs px-1.5 py-0.5 rounded-full">Aktif</span>
            )}
          </button>
          <button
            onClick={() => { setPage(0); fetchLogs(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:bg-white/10 border border-slate-300 dark:border-white/10 text-sm transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-white/10 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Filtreler</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300">
                <X size={12} /> Temizle
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Ara..."
                value={filterSearch}
                onChange={e => { setFilterSearch(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-rose-400/50"
              />
            </div>

            {/* User filter */}
            <select
              value={filterUser}
              onChange={e => { setFilterUser(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-400/50"
            >
              <option value="">Tum Kullanicilar</option>
              {uniqueUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            {/* Action type filter */}
            <select
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-400/50"
            >
              <option value="">Tum Aksiyonlar</option>
              {Object.entries(ACTION_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>

            {/* Entity type filter */}
            <select
              value={filterEntity}
              onChange={e => { setFilterEntity(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-400/50"
            >
              <option value="">Tum Varliklar</option>
              {Object.entries(ENTITY_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val}</option>
              ))}
            </select>

            {/* Brand filter */}
            <select
              value={filterBrand}
              onChange={e => { setFilterBrand(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-400/50"
            >
              <option value="">Tum Markalar</option>
              {Object.entries(BRAND_NAMES).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>

            {/* Date from */}
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-400/50"
              placeholder="Baslangic"
            />

            {/* Date to */}
            <input
              type="date"
              value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-400/50"
              placeholder="Bitis"
            />
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Toplam', value: totalCount, color: 'text-slate-900 dark:text-white' },
          { label: 'Goruntuleme', value: logs.filter(l => l.action_type === 'view').length, color: 'text-slate-500 dark:text-slate-400' },
          { label: 'Degisiklik', value: logs.filter(l => ['create', 'update', 'delete'].includes(l.action_type)).length, color: 'text-amber-400' },
          { label: 'Kritik', value: logs.filter(l => ['delete', 'revoke', 'flag'].includes(l.action_type)).length, color: 'text-rose-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 rounded-xl p-3 text-center">
            <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-900/30 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">Kayit bulunamadi</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/5 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Zaman</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Kullanici</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Aksiyon</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Varlik</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Aciklama</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase">Marka</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {logs.map(log => {
                  const actionInfo = ACTION_LABELS[log.action_type] || { label: log.action_type, color: 'text-slate-500 dark:text-slate-400 bg-slate-400/10', icon: Clock };
                  const ActionIcon = actionInfo.icon;
                  const isExpanded = expandedId === log.id;
                  const hasDetails = log.old_values || log.new_values || log.metadata;

                  return (
                    <tr key={log.id} className="group">
                      <td className="px-4 py-3" colSpan={7}>
                        <div
                          className={`flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:bg-white/[0.02] rounded-lg -mx-2 px-2 py-1 transition-all ${isExpanded ? 'bg-slate-50 dark:bg-white/[0.02]' : ''}`}
                          onClick={() => hasDetails && setExpandedId(isExpanded ? null : log.id)}
                        >
                          {/* Time */}
                          <div className="w-32 shrink-0">
                            <div className="text-xs text-slate-500 dark:text-slate-400">{formatTimeAgo(log.created_at)}</div>
                            <div className="text-[10px] text-slate-600">{formatIst(log.created_at)}</div>
                          </div>

                          {/* User */}
                          <div className="w-32 shrink-0 flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                              <User size={12} className="text-slate-500 dark:text-slate-400" />
                            </div>
                            <span className="text-slate-600 dark:text-slate-300 text-xs truncate">{log.user_name || 'Sistem'}</span>
                          </div>

                          {/* Action */}
                          <div className="w-32 shrink-0">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${actionInfo.color}`}>
                              <ActionIcon size={10} />
                              {actionInfo.label}
                            </span>
                          </div>

                          {/* Entity */}
                          <div className="w-28 shrink-0">
                            <span className="text-xs text-slate-500">{ENTITY_LABELS[log.entity_type] || log.entity_type}</span>
                            {log.entity_label && (
                              <div className="text-[10px] text-slate-600 truncate">{log.entity_label}</div>
                            )}
                          </div>

                          {/* Description */}
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">{log.description || '-'}</span>
                          </div>

                          {/* Brand */}
                          <div className="w-16 shrink-0">
                            {log.brand_id && (
                              <span className="text-[10px] text-slate-500">{BRAND_NAMES[log.brand_id] || '-'}</span>
                            )}
                          </div>

                          {/* Expand */}
                          <div className="w-6 shrink-0">
                            {hasDetails && (
                              isExpanded ? <ChevronUp size={14} className="text-slate-600" /> : <ChevronDown size={14} className="text-slate-600" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && hasDetails && (
                          <div className="mt-2 ml-8 p-3 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 rounded-lg space-y-2">
                            {log.entity_id && (
                              <div className="flex gap-2">
                                <span className="text-[10px] text-slate-500 w-20 shrink-0">Entity ID:</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{log.entity_id}</span>
                              </div>
                            )}
                            {log.old_values && (
                              <div>
                                <span className="text-[10px] text-red-400/70 font-medium">Onceki Degerler:</span>
                                <pre className="text-[10px] text-slate-500 mt-1 bg-black/20 p-2 rounded overflow-x-auto max-h-32">
                                  {JSON.stringify(log.old_values, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_values && (
                              <div>
                                <span className="text-[10px] text-emerald-400/70 font-medium">Yeni Degerler:</span>
                                <pre className="text-[10px] text-slate-500 mt-1 bg-black/20 p-2 rounded overflow-x-auto max-h-32">
                                  {JSON.stringify(log.new_values, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div>
                                <span className="text-[10px] text-sky-400/70 font-medium">Ek Bilgi:</span>
                                <pre className="text-[10px] text-slate-500 mt-1 bg-black/20 p-2 rounded overflow-x-auto max-h-32">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/5">
            <span className="text-xs text-slate-500">
              {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} / {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400 px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
