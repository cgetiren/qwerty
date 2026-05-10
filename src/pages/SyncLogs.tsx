import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useBrand } from '../lib/brand';
import { Activity, RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Filter, Play, Pause, Database, MessageSquare, AlertTriangle, Zap, Download, FileJson, FileText, Loader2, Sparkles, Send } from 'lucide-react';

interface SyncJob {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  result: any;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  brand_id: string;
  created_by: string | null;
  days: number | null;
}

interface Stats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  totalSynced: number;
  totalMessages: number;
  totalNew: number;
  totalUpdated: number;
  totalRatingChanges: number;
}

const BRAND_NAMES: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'Benja',
  '00000000-0000-0000-0000-000000000003': 'Dil',
  'c1fbe05a-a1f0-4811-af59-6aa8c79032ba': 'MarkBia',
};

const BRAND_COLORS: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'cyan',
  '00000000-0000-0000-0000-000000000003': 'emerald',
  'c1fbe05a-a1f0-4811-af59-6aa8c79032ba': 'amber',
};

function formatIst(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isManualSync(job: SyncJob): boolean {
  if (job.days !== null) return true;
  if (!job.start_date || !job.end_date) return false;
  const diff = new Date(job.end_date).getTime() - new Date(job.start_date).getTime();
  return diff > 3 * 60 * 60 * 1000;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <span className="flex items-center gap-1 text-emerald-400 bg-emerald-400/10 text-xs px-2 py-0.5 rounded-full"><CheckCircle size={12} />Basarili</span>;
  if (status === 'failed') return <span className="flex items-center gap-1 text-red-400 bg-red-400/10 text-xs px-2 py-0.5 rounded-full"><XCircle size={12} />Basarisiz</span>;
  if (status === 'processing') return <span className="flex items-center gap-1 text-amber-400 bg-amber-400/10 text-xs px-2 py-0.5 rounded-full"><RefreshCw size={12} className="animate-spin" />Calisiyor</span>;
  return <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 bg-slate-400/10 text-xs px-2 py-0.5 rounded-full"><Clock size={12} />{status}</span>;
}

function BrandBadge({ brandId }: { brandId: string }) {
  const name = BRAND_NAMES[brandId] || brandId.substring(0, 8);
  const color = BRAND_COLORS[brandId] || 'slate';
  const cls: Record<string, string> = {
    cyan: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
    emerald: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
    amber: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
    slate: 'text-slate-600 dark:text-slate-300 bg-slate-400/10 border-slate-400/20',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls[color]}`}>{name}</span>;
}

const PAGE_SIZE = 50;

function SyncLogsContent() {
  const { activeBrand } = useBrand();
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, failed: 0, processing: 0, totalSynced: 0, totalMessages: 0, totalNew: 0, totalUpdated: 0, totalRatingChanges: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date();
    const ist = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return ist.toISOString().substring(0, 10);
  });
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      const startOfDay = dateFilter + 'T00:00:00+03:00';
      const endOfDay = dateFilter + 'T23:59:59+03:00';

      let query = supabase
        .from('sync_jobs')
        .select('*', { count: 'exact' })
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (brandFilter !== 'all') query = query.eq('brand_id', brandFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const from = (currentPage - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      setJobs((data || []) as SyncJob[]);
      setTotalCount(count || 0);

      // Stats - tum gunun (sayim icin count sorgulari, veri icin sayfalama)
      const buildStatsFilter = (q: any) => {
        q = q.gte('created_at', startOfDay).lte('created_at', endOfDay);
        if (brandFilter !== 'all') q = q.eq('brand_id', brandFilter);
        return q;
      };

      const [totalRes, completedRes, failedRes, processingRes] = await Promise.all([
        buildStatsFilter(supabase.from('sync_jobs').select('*', { count: 'exact', head: true })),
        buildStatsFilter(supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed')),
        buildStatsFilter(supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed')),
        buildStatsFilter(supabase.from('sync_jobs').select('*', { count: 'exact', head: true }).eq('status', 'processing')),
      ]);

      // Synced/messages/detay toplami icin tum sonuclari sayfalayarak cek
      let allSynced = 0;
      let allMessages = 0;
      let allNew = 0;
      let allUpdated = 0;
      let allRatingChanges = 0;
      let statsOffset = 0;
      const STATS_PAGE = 1000;
      while (true) {
        const { data: batch } = await buildStatsFilter(
          supabase.from('sync_jobs').select('result').eq('status', 'completed')
        ).range(statsOffset, statsOffset + STATS_PAGE - 1);
        if (!batch || batch.length === 0) break;
        batch.forEach((j: any) => {
          const r = j.result || {};
          allSynced += r.synced || 0;
          allMessages += r.messages_synced || 0;
          allNew += r.new_chats || 0;
          allUpdated += r.updated_chats || 0;
          allRatingChanges += r.rating_changes?.total || 0;
        });
        if (batch.length < STATS_PAGE) break;
        statsOffset += STATS_PAGE;
      }

      setStats({
        total: totalRes.count || 0,
        completed: completedRes.count || 0,
        failed: failedRes.count || 0,
        processing: processingRes.count || 0,
        totalSynced: allSynced,
        totalMessages: allMessages,
        totalNew: allNew,
        totalUpdated: allUpdated,
        totalRatingChanges: allRatingChanges,
      });

      // Last sync per brand
      const { data: brands } = await supabase.from('brands').select('id, name, last_sync_at');
      if (brands) {
        const map: Record<string, string> = {};
        brands.forEach((b: any) => { if (b.last_sync_at) map[b.id] = b.last_sync_at; });
        setLastSyncAt(map);
      }
    } catch (err) {
      console.error('Error loading sync logs:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, brandFilter, statusFilter, currentPage]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
            <Activity size={22} className="text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sync Loglari</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cron ve manuel senkronizasyon kayitlari</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${autoRefresh ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-200/50 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08]'}`}
          >
            {autoRefresh ? <Play size={12} /> : <Pause size={12} />}
            {autoRefresh ? 'Canli' : 'Durduruldu'}
          </button>
          <button onClick={loadData} className="p-2 rounded-lg bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Last Sync Per Brand */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Object.entries(BRAND_NAMES).map(([bid, name]) => {
          const ls = lastSyncAt[bid];
          const gap = ls ? Math.round((Date.now() - new Date(ls).getTime()) / 60000) : null;
          const ok = gap !== null && gap < 10;
          return (
            <div key={bid} className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <BrandBadge brandId={bid} />
                <div className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : gap === null ? 'bg-slate-600' : 'bg-amber-400'}`} />
              </div>
              <p className="text-xs text-slate-500">Son sync: {ls ? formatIst(ls) : '-'}</p>
              {gap !== null && <p className="text-xs text-slate-500">{gap} dk once</p>}
            </div>
          );
        })}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-9 gap-3">
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Toplam Job</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Basarili</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Basarisiz</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Calisiyor</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.processing}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-1 mb-1"><Database size={12} className="text-slate-500" /><p className="text-xs text-slate-500">Sync Chat</p></div>
          <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.totalSynced.toLocaleString()}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-1 mb-1"><MessageSquare size={12} className="text-slate-500" /><p className="text-xs text-slate-500">Sync Mesaj</p></div>
          <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{stats.totalMessages.toLocaleString()}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-1 mb-1"><Zap size={12} className="text-emerald-500" /><p className="text-xs text-slate-500">Yeni Chat</p></div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.totalNew.toLocaleString()}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-1 mb-1"><RefreshCw size={12} className="text-slate-500" /><p className="text-xs text-slate-500">Guncellenen</p></div>
          <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{stats.totalUpdated.toLocaleString()}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-1 mb-1"><Activity size={12} className="text-rose-500" /><p className="text-xs text-slate-500">Rating Degisim</p></div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{stats.totalRatingChanges.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-500 dark:text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <input type="date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50" />
          <select value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50">
            <option value="all">Tum Markalar</option>
            {Object.entries(BRAND_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50">
            <option value="all">Tum Durumlar</option>
            <option value="completed">Basarili</option>
            <option value="failed">Basarisiz</option>
            <option value="processing">Calisiyor</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-slate-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Activity size={48} className="mx-auto mb-3 opacity-30" />
            <p>Bu tarihte sync kaydi yok</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Zaman</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Marka</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Tip</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Durum</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Chat</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Yeni</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Guncl.</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Rating</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Mesaj</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Sure</th>
                    <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => {
                    const r = job.result || {};
                    const manual = isManualSync(job);
                    const duration = job.started_at && job.completed_at
                      ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
                      : null;
                    const synced = r.synced ?? 0;
                    const expanded = expandedId === job.id;

                    return (
                      <>
                        <tr key={job.id}
                          className={`border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:bg-white/[0.02] cursor-pointer transition-colors ${synced > 0 ? '' : 'opacity-60'}`}
                          onClick={() => setExpandedId(expanded ? null : job.id)}>
                          <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 font-mono">{formatTime(job.created_at)}</td>
                          <td className="px-4 py-2.5"><BrandBadge brandId={job.brand_id} /></td>
                          <td className="px-4 py-2.5">
                            {manual
                              ? <span className="flex items-center gap-1 text-sky-400 text-xs"><Zap size={12} />Manuel</span>
                              : <span className="flex items-center gap-1 text-slate-500 text-xs"><Clock size={12} />Cron</span>
                            }
                          </td>
                          <td className="px-4 py-2.5"><StatusBadge status={job.status} /></td>
                          <td className="px-4 py-2.5 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">{synced > 0 ? synced : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-emerald-400">{r.new_chats > 0 ? r.new_chats : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-slate-500 dark:text-slate-400">{r.updated_chats > 0 ? r.updated_chats : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-rose-400">{r.rating_changes?.total > 0 ? r.rating_changes.total : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-slate-500 dark:text-slate-400">{r.messages_synced > 0 ? r.messages_synced : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-slate-500">{duration !== null ? `${duration}s` : '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={job.id + '-detail'} className="bg-slate-50/50 dark:bg-white/[0.01]">
                            <td colSpan={11} className="px-6 py-4">
                              <JobDetail job={job} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/[0.06]">
                <p className="text-xs text-slate-500">{totalCount} kayit, sayfa {currentPage}/{totalPages}</p>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                    className="px-3 py-1 text-xs bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-colors">Onceki</button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                    className="px-3 py-1 text-xs bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-colors">Sonraki</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface SyncedChat {
  id: string;
  chat_id: string;
  agent_name: string;
  customer_name: string;
  created_at: string;
  status: string;
  message_count: number;
}

function JobDetail({ job }: { job: SyncJob }) {
  const [chats, setChats] = useState<SyncedChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const r = job.result || {};
  const brandName = BRAND_NAMES[job.brand_id] || job.brand_id.substring(0, 8);

  const loadChats = async () => {
    if (loaded) return;
    setLoadingChats(true);
    try {
      const { data } = await supabase
        .from('chats')
        .select('id, chat_id, agent_name, customer_name, created_at, status, message_count')
        .eq('brand_id', job.brand_id)
        .gte('synced_at', job.started_at || job.created_at)
        .lte('synced_at', job.completed_at || new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(200);
      setChats((data || []) as SyncedChat[]);
      setLoaded(true);
    } catch { /* ignore */ }
    setLoadingChats(false);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const data = {
      job: {
        id: job.id,
        brand: brandName,
        brand_id: job.brand_id,
        status: job.status,
        type: isManualSync(job) ? 'manuel' : 'cron',
        sync_window: { start: job.start_date, end: job.end_date },
        started_at: job.started_at,
        completed_at: job.completed_at,
        error: job.error,
        result: r,
      },
      summary: {
        total_synced: r.synced ?? 0,
        new_chats: r.new_chats ?? 0,
        updated_chats: r.updated_chats ?? 0,
        messages_synced: r.messages_synced ?? 0,
        rating_changes: r.rating_changes ?? { total: 0, newly_added: 0, removed: 0, details: [] },
        missed_status_changed: r.missed_status_changed ?? 0,
        alerts_created: r.alerts_created ?? 0,
        alerts_sent: r.alerts_sent ?? 0,
      },
      synced_chats: chats.map(c => ({
        id: c.id,
        chat_id: c.chat_id,
        agent: c.agent_name,
        customer: c.customer_name,
        created_at: c.created_at,
        created_at_istanbul: new Date(c.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        status: c.status,
        message_count: c.message_count,
      })),
      exported_at: new Date().toISOString(),
    };
    const ts = formatIst(job.created_at).replace(/[\/\s:]/g, '-');
    downloadFile(JSON.stringify(data, null, 2), `sync-log-${brandName}-${ts}.json`, 'application/json');
  };

  const downloadMD = () => {
    const type = isManualSync(job) ? 'Manuel' : 'Cron';
    let md = `# Sync Log Raporu\n\n`;
    md += `## Genel Bilgi\n\n`;
    md += `| Alan | Deger |\n|---|---|\n`;
    md += `| Marka | ${brandName} |\n`;
    md += `| Tip | ${type} |\n`;
    md += `| Durum | ${job.status} |\n`;
    md += `| Tarih | ${formatIst(job.created_at)} |\n`;
    md += `| Pencere | ${formatIst(job.start_date)} - ${formatIst(job.end_date)} |\n`;
    md += `| Basladi | ${formatIst(job.started_at)} |\n`;
    md += `| Tamamlandi | ${formatIst(job.completed_at)} |\n`;
    md += `| Calisma Suresi | ${r.execution_time_seconds ?? '-'}s |\n`;
    if (job.error) md += `| Hata | ${job.error} |\n`;

    md += `\n## Sync Detay\n\n`;
    md += `| Metrik | Deger |\n|---|---|\n`;
    md += `| Toplam Islenen | ${r.synced ?? 0} |\n`;
    md += `| Yeni Chat | ${r.new_chats ?? 0} |\n`;
    md += `| Guncellenen Chat | ${r.updated_chats ?? 0} |\n`;
    md += `| Sync Mesaj | ${r.messages_synced ?? 0} |\n`;
    md += `| Sayfa | ${r.pages_fetched ?? 0} |\n`;
    md += `| Kacirma Durumu Degisen | ${r.missed_status_changed ?? 0} |\n`;

    md += `\n## Rating Degisiklikleri\n\n`;
    md += `| Metrik | Deger |\n|---|---|\n`;
    md += `| Toplam Rating Degisimi | ${rc.total ?? 0} |\n`;
    md += `| Yeni Rating Eklenen | ${rc.newly_added ?? 0} |\n`;
    md += `| Rating Kaldirilan | ${rc.removed ?? 0} |\n`;
    if (r.alerts_created) md += `| Alert Olusturulan | ${r.alerts_created} |\n`;
    if (r.alerts_sent) md += `| Alert Gonderilen | ${r.alerts_sent} |\n`;

    if (rc.details && rc.details.length > 0) {
      md += `\n### Rating Degisim Detaylari\n\n`;
      md += `| Chat ID | Temsilci | Eski Skor | Yeni Skor | Eski Durum | Yeni Durum |\n`;
      md += `|---|---|---|---|---|---|\n`;
      rc.details.forEach((d: any) => {
        md += `| ${d.chat_id} | ${d.agent} | ${d.old_score ?? '-'} | ${d.new_score ?? '-'} | ${d.old_status ?? '-'} | ${d.new_status ?? '-'} |\n`;
      });
    }

    if (chats.length > 0) {
      md += `\n## Gelen Chatler (${chats.length})\n\n`;
      md += `| # | Saat | Chat ID | Temsilci | Musteri | Mesaj |\n`;
      md += `|---|---|---|---|---|---|\n`;
      chats.forEach((c, i) => {
        const ist = new Date(c.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
        md += `| ${i + 1} | ${ist} | ${c.chat_id} | ${c.agent_name} | ${c.customer_name} | ${c.message_count} |\n`;
      });
    }

    md += `\n---\n*Olusturulma: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}*\n`;
    const ts = formatIst(job.created_at).replace(/[\/\s:]/g, '-');
    downloadFile(md, `sync-log-${brandName}-${ts}.md`, 'text/markdown');
  };

  const rc = r.rating_changes || {};

  return (
    <div className="space-y-4">
      {/* Job Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="space-y-2">
          <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Genel Bilgi</div>
          <div className="flex justify-between"><span className="text-slate-500">Job ID:</span><span className="text-slate-500 dark:text-slate-400 font-mono">{job.id.substring(0, 8)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Pencere Baslangic:</span><span className="text-slate-600 dark:text-slate-300">{formatIst(job.start_date)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Pencere Bitis:</span><span className="text-slate-600 dark:text-slate-300">{formatIst(job.end_date)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Basladi:</span><span className="text-slate-600 dark:text-slate-300">{formatIst(job.started_at)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tamamlandi:</span><span className="text-slate-600 dark:text-slate-300">{formatIst(job.completed_at)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Toplam Chat (DB):</span><span className="text-slate-600 dark:text-slate-300">{r.total_chats?.toLocaleString() ?? '-'}</span></div>
          {r.execution_time_seconds != null && (
            <div className="flex justify-between"><span className="text-slate-500">Calisma Suresi:</span><span className="text-slate-600 dark:text-slate-300">{r.execution_time_seconds}s</span></div>
          )}
          {r.page_limit_reached && <div className="text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg p-2 mt-2">Sayfa limiti asildi - daha fazla veri var</div>}
        </div>

        <div className="space-y-2">
          <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Sync Detay</div>
          <div className="flex justify-between"><span className="text-slate-500">Toplam Islenen:</span><span className="text-cyan-300 font-semibold">{r.synced ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Yeni Chat:</span><span className="text-emerald-400 font-semibold">{r.new_chats ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Guncellenen:</span><span className="text-slate-600 dark:text-slate-300">{r.updated_chats ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Mesaj:</span><span className="text-sky-300">{r.messages_synced ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Sayfa:</span><span className="text-slate-600 dark:text-slate-300">{r.pages_fetched ?? 0}</span></div>
          {r.missed_status_changed > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Kacirma Degisimi:</span><span className="text-amber-300">{r.missed_status_changed}</span></div>
          )}
          {job.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-2">
              <div className="flex items-center gap-1.5 text-red-400 mb-1"><AlertTriangle size={12} />Hata</div>
              <p className="text-red-300">{job.error}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Rating & Alert</div>
          <div className="flex justify-between"><span className="text-slate-500">Rating Degisimi:</span><span className={`font-semibold ${rc.total > 0 ? 'text-rose-400' : 'text-slate-500'}`}>{rc.total ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Yeni Rating:</span><span className="text-emerald-400">{rc.newly_added ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Kaldirilan Rating:</span><span className="text-red-400">{rc.removed ?? 0}</span></div>
          {r.alerts_created > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Olusturulan Alert:</span><span className="text-amber-300">{r.alerts_created}</span></div>
          )}
          {r.alerts_sent > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">Gonderilen Alert:</span><span className="text-emerald-300">{r.alerts_sent}</span></div>
          )}
        </div>
      </div>

      {/* Rating Change Details */}
      {rc.details && rc.details.length > 0 && (
        <div className="border-t border-slate-200 dark:border-white/[0.06] pt-4">
          <div className="text-xs text-rose-400 font-semibold mb-2 uppercase tracking-wider">Rating Degisim Detaylari ({rc.total})</div>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white/90 dark:bg-slate-900/90">
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Chat ID</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Temsilci</th>
                  <th className="text-center text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Eski Skor</th>
                  <th className="text-center text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Yeni Skor</th>
                  <th className="text-center text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Eski Durum</th>
                  <th className="text-center text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Yeni Durum</th>
                </tr>
              </thead>
              <tbody>
                {rc.details.map((d: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:bg-white/[0.02]">
                    <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 font-mono">{d.chat_id}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{d.agent}</td>
                    <td className="px-3 py-1.5 text-center text-slate-500">{d.old_score ?? '-'}</td>
                    <td className="px-3 py-1.5 text-center font-semibold text-amber-300">{d.new_score ?? '-'}</td>
                    <td className="px-3 py-1.5 text-center text-slate-500">{d.old_status ?? '-'}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${d.new_status === 'rated' ? 'bg-emerald-500/10 text-emerald-400' : d.new_status === 'not_rated' ? 'bg-slate-500/10 text-slate-500 dark:text-slate-400' : 'bg-slate-500/10 text-slate-500 dark:text-slate-400'}`}>
                        {d.new_status ?? '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Synced Chats */}
      <div className="border-t border-slate-200 dark:border-white/[0.06] pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Gelen Chatler</span>
          <div className="flex gap-2">
            {!loaded && (
              <button onClick={loadChats} disabled={loadingChats}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors disabled:opacity-40">
                {loadingChats ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                Chat Listesini Yukle
              </button>
            )}
            {loaded && chats.length > 0 && (
              <>
                <button onClick={downloadJSON}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-300 hover:bg-sky-500/20 transition-colors">
                  <FileJson size={12} />JSON
                </button>
                <button onClick={downloadMD}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                  <FileText size={12} />MD
                </button>
              </>
            )}
          </div>
        </div>

        {loaded && chats.length === 0 && (
          <p className="text-xs text-slate-500">Bu sync'te yeni chat gelmedi</p>
        )}

        {loaded && chats.length > 0 && (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white/90 dark:bg-slate-900/90">
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Saat</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Chat ID</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Temsilci</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Musteri</th>
                  <th className="text-right text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Mesaj</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {chats.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:bg-white/[0.02]">
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300 font-mono">{formatTime(c.created_at)}</td>
                    <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 font-mono">{c.chat_id}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{c.agent_name}</td>
                    <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.customer_name}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500 dark:text-slate-400">{c.message_count}</td>
                    <td className="px-3 py-1.5"><span className="text-slate-500">{c.status === 'archived' ? 'Arsiv' : c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Analiz Loglari Tab
   ============================================================ */

interface AnalyzeRun {
  id: string;
  started_at: string | null;
  completed_at: string | null;
  brand_ids: string[] | null;
  mode: string | null;
  model_used: string | null;
  chats_claimed: number | null;
  chats_analyzed: number | null;
  chats_skipped: number | null;
  alerts_created: number | null;
  sonnet_upgrades: number | null;
  errors: string[] | null;
  depleted_brands: string[] | null;
  duration_ms: number | null;
  details: any[] | null;
  created_at: string;
}

interface AnalyzeStats {
  total: number;
  analyzed: number;
  alerts: number;
  errors: number;
  sonnetUpgrades: number;
}

function AnalyzLogsTab() {
  const [runs, setRuns] = useState<AnalyzeRun[]>([]);
  const [stats, setStats] = useState<AnalyzeStats>({ total: 0, analyzed: 0, alerts: 0, errors: 0, sonnetUpgrades: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date();
    const ist = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return ist.toISOString().substring(0, 10);
  });
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const startOfDay = dateFilter + 'T00:00:00+03:00';
      const endOfDay = dateFilter + 'T23:59:59+03:00';

      let query = supabase
        .from('analyze_runs')
        .select('*', { count: 'exact' })
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (brandFilter !== 'all') query = query.contains('brand_ids', [brandFilter]);

      const from = (currentPage - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      const rows = (data || []) as AnalyzeRun[];
      setRuns(rows);
      setTotalCount(count || 0);

      // Stats across all runs for the day
      let allAnalyzed = 0, allAlerts = 0, allErrors = 0, allSonnet = 0;
      let statsOffset = 0;
      const STATS_PAGE = 1000;
      while (true) {
        let sq = supabase.from('analyze_runs').select('chats_analyzed, alerts_created, sonnet_upgrades, errors')
          .gte('created_at', startOfDay).lte('created_at', endOfDay);
        if (brandFilter !== 'all') sq = sq.contains('brand_ids', [brandFilter]);
        const { data: batch } = await sq.range(statsOffset, statsOffset + STATS_PAGE - 1);
        if (!batch || batch.length === 0) break;
        batch.forEach((r: any) => {
          allAnalyzed += r.chats_analyzed || 0;
          allAlerts += r.alerts_created || 0;
          allSonnet += r.sonnet_upgrades || 0;
          if (r.errors && r.errors.length > 0) allErrors += r.errors.length;
        });
        if (batch.length < STATS_PAGE) break;
        statsOffset += STATS_PAGE;
      }

      // Total count for stats
      let countQ = supabase.from('analyze_runs').select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay).lte('created_at', endOfDay);
      if (brandFilter !== 'all') countQ = countQ.contains('brand_ids', [brandFilter]);
      const { count: totalRuns } = await countQ;

      setStats({ total: totalRuns || 0, analyzed: allAnalyzed, alerts: allAlerts, errors: allErrors, sonnetUpgrades: allSonnet });
    } catch (err) {
      console.error('Error loading analyze logs:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, brandFilter, currentPage]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Toplam Calisma</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Analiz Edilen</p>
          <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{stats.analyzed}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Alert Olusturulan</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.alerts}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Hatali</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.errors}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Sonnet Yukseltme</p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.sonnetUpgrades}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-500 dark:text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50" />
          <select value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50">
            <option value="all">Tum Markalar</option>
            {Object.entries(BRAND_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${autoRefresh ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-200/50 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08]'}`}
          >
            {autoRefresh ? <Play size={12} /> : <Pause size={12} />}
            {autoRefresh ? 'Canli' : 'Durduruldu'}
          </button>
          <button onClick={loadData} className="p-2 rounded-lg bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        {loading && runs.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-slate-500" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Sparkles size={48} className="mx-auto mb-3 opacity-30" />
            <p>Bu tarihte analiz kaydi yok</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Zaman</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Mod</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Model</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Claim</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Analiz</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Alert</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Hata</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Sonnet Up</th>
                    <th className="text-right text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Sure</th>
                    <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const expanded = expandedId === run.id;
                    const durationSec = run.duration_ms != null ? (run.duration_ms / 1000).toFixed(1) : null;
                    const errorCount = run.errors?.length || 0;

                    return (
                      <>
                        <tr key={run.id}
                          className="border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:bg-white/[0.02] cursor-pointer transition-colors"
                          onClick={() => setExpandedId(expanded ? null : run.id)}>
                          <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 font-mono">{formatTime(run.created_at)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${run.mode === 'batch' ? 'bg-sky-400/10 text-sky-300' : 'bg-violet-400/10 text-violet-300'}`}>
                              {run.mode || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{run.model_used || '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-slate-600 dark:text-slate-300">{run.chats_claimed ?? '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-cyan-400 font-semibold">{run.chats_analyzed ?? '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-amber-400">{run.alerts_created ?? '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm">
                            <span className={errorCount > 0 ? 'text-red-400' : 'text-slate-500'}>{errorCount > 0 ? errorCount : '-'}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm text-purple-400">{run.sonnet_upgrades ? run.sonnet_upgrades : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-slate-500">{durationSec != null ? `${durationSec}s` : '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={run.id + '-detail'} className="bg-slate-50/50 dark:bg-white/[0.01]">
                            <td colSpan={10} className="px-6 py-4">
                              <AnalyzeRunDetail run={run} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/[0.06]">
                <p className="text-xs text-slate-500">{totalCount} kayit, sayfa {currentPage}/{totalPages}</p>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                    className="px-3 py-1 text-xs bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-colors">Onceki</button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                    className="px-3 py-1 text-xs bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-colors">Sonraki</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AnalyzeRunDetail({ run }: { run: AnalyzeRun }) {
  const details = run.details || [];
  const errors = run.errors || [];

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const data = {
      run: {
        id: run.id,
        mode: run.mode,
        model: run.model_used,
        started_at: run.started_at,
        completed_at: run.completed_at,
        duration_ms: run.duration_ms,
        brands: (run.brand_ids || []).map(b => BRAND_NAMES[b] || b),
      },
      results: {
        chats_claimed: run.chats_claimed ?? 0,
        chats_analyzed: run.chats_analyzed ?? 0,
        chats_skipped: run.chats_skipped ?? 0,
        alerts_created: run.alerts_created ?? 0,
        sonnet_upgrades: run.sonnet_upgrades ?? 0,
        depleted_brands: (run.depleted_brands || []).map(b => BRAND_NAMES[b] || b),
      },
      errors,
      chats: details.map((d: any) => ({
        chat_id: d.chat_id,
        agent: d.agent_name || d.agent,
        brand: d.brand_id ? (BRAND_NAMES[d.brand_id] || d.brand_id) : '-',
        score: d.overall_score ?? d.score ?? d.puan,
        sentiment: d.sentiment ?? d.duygu,
        topic: d.chat_topic ?? d.topic ?? d.konu,
        model: d.model_used ?? d.model,
        sonnet_upgrade: d.sonnet_upgrade ?? false,
      })),
      exported_at: new Date().toISOString(),
    };
    const ts = formatIst(run.created_at).replace(/[\/\s:]/g, '-');
    downloadFile(JSON.stringify(data, null, 2), `analiz-log-${ts}.json`, 'application/json');
  };

  const downloadMD = () => {
    let md = `# Analiz Log Raporu\n\n`;
    md += `## Genel Bilgi\n\n`;
    md += `| Alan | Deger |\n|---|---|\n`;
    md += `| Run ID | ${run.id.substring(0, 8)} |\n`;
    md += `| Mod | ${run.mode || '-'} |\n`;
    md += `| Model | ${run.model_used || '-'} |\n`;
    md += `| Basladi | ${formatIst(run.started_at)} |\n`;
    md += `| Tamamlandi | ${formatIst(run.completed_at)} |\n`;
    md += `| Sure | ${run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'} |\n`;
    md += `| Markalar | ${(run.brand_ids || []).map(b => BRAND_NAMES[b] || b).join(', ') || '-'} |\n`;

    md += `\n## Sonuclar\n\n`;
    md += `| Metrik | Deger |\n|---|---|\n`;
    md += `| Claim Edilen | ${run.chats_claimed ?? 0} |\n`;
    md += `| Analiz Edilen | ${run.chats_analyzed ?? 0} |\n`;
    md += `| Atlanan | ${run.chats_skipped ?? 0} |\n`;
    md += `| Alert Olusturulan | ${run.alerts_created ?? 0} |\n`;
    md += `| Sonnet Yukseltme | ${run.sonnet_upgrades ?? 0} |\n`;

    if (errors.length > 0) {
      md += `\n## Hatalar (${errors.length})\n\n`;
      errors.forEach((err, i) => { md += `${i + 1}. ${err}\n`; });
    }

    if (details.length > 0) {
      md += `\n## Chat Detaylari (${details.length})\n\n`;
      md += `| # | Chat ID | Agent | Marka | Puan | Duygu | Konu | Model |\n`;
      md += `|---|---|---|---|---|---|---|---|\n`;
      details.forEach((d: any, i: number) => {
        const brand = d.brand_id ? (BRAND_NAMES[d.brand_id] || d.brand_id.substring(0, 8)) : '-';
        md += `| ${i + 1} | ${d.chat_id || '-'} | ${d.agent_name || d.agent || '-'} | ${brand} | ${d.overall_score ?? d.score ?? d.puan ?? '-'} | ${d.sentiment ?? d.duygu ?? '-'} | ${d.chat_topic ?? d.topic ?? d.konu ?? '-'} | ${d.model_used ?? d.model ?? '-'} |\n`;
      });
    }

    md += `\n---\n*Olusturulma: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}*\n`;
    const ts = formatIst(run.created_at).replace(/[\/\s:]/g, '-');
    downloadFile(md, `analiz-log-${ts}.md`, 'text/markdown');
  };

  return (
    <div className="space-y-4">
      {/* General info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="space-y-2">
          <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Genel Bilgi</div>
          <div className="flex justify-between"><span className="text-slate-500">Run ID:</span><span className="text-slate-500 dark:text-slate-400 font-mono">{run.id.substring(0, 8)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Basladi:</span><span className="text-slate-600 dark:text-slate-300">{formatIst(run.started_at)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tamamlandi:</span><span className="text-slate-600 dark:text-slate-300">{formatIst(run.completed_at)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Sure:</span><span className="text-slate-600 dark:text-slate-300">{run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Mod:</span><span className="text-slate-600 dark:text-slate-300">{run.mode || '-'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Model:</span><span className="text-slate-600 dark:text-slate-300">{run.model_used || '-'}</span></div>
        </div>
        <div className="space-y-2">
          <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Sonuclar</div>
          <div className="flex justify-between"><span className="text-slate-500">Claim:</span><span className="text-slate-600 dark:text-slate-300">{run.chats_claimed ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Analiz Edilen:</span><span className="text-cyan-300 font-semibold">{run.chats_analyzed ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Atlanan:</span><span className="text-slate-500 dark:text-slate-400">{run.chats_skipped ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Alert:</span><span className="text-amber-300">{run.alerts_created ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Sonnet Yukseltme:</span><span className="text-purple-300">{run.sonnet_upgrades ?? 0}</span></div>
        </div>
        <div className="space-y-2">
          <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Markalar</div>
          <div className="flex flex-wrap gap-1">
            {(run.brand_ids || []).map(bid => <BrandBadge key={bid} brandId={bid} />)}
            {(!run.brand_ids || run.brand_ids.length === 0) && <span className="text-slate-500">-</span>}
          </div>
          {run.depleted_brands && run.depleted_brands.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-amber-400">Tukenmis Markalar:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {run.depleted_brands.map(bid => <BrandBadge key={bid} brandId={bid} />)}
              </div>
            </div>
          )}
          {/* Download buttons */}
          <div className="flex gap-2 mt-3">
            <button onClick={downloadJSON}
              className="flex items-center gap-1.5 px-3 py-1 text-xs bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-300 hover:bg-sky-500/20 transition-colors">
              <FileJson size={12} />JSON
            </button>
            <button onClick={downloadMD}
              className="flex items-center gap-1.5 px-3 py-1 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 hover:bg-emerald-500/20 transition-colors">
              <FileText size={12} />MD
            </button>
          </div>
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="border-t border-slate-200 dark:border-white/[0.06] pt-4">
          <div className="text-xs text-red-400 font-semibold mb-2 uppercase tracking-wider">Hatalar ({errors.length})</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {errors.map((err, i) => (
              <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-300">{err}</div>
            ))}
          </div>
        </div>
      )}

      {/* Details table */}
      {details.length > 0 && (
        <div className="border-t border-slate-200 dark:border-white/[0.06] pt-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Chat Detaylari ({details.length})</div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white/90 dark:bg-slate-900/90">
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Chat ID</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Agent</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Brand</th>
                  <th className="text-center text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Puan</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Duygu</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Konu</th>
                  <th className="text-left text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Model</th>
                  <th className="text-center text-slate-600 dark:text-slate-500 font-medium px-3 py-2">Sonnet</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d: any, i: number) => {
                  const score = d.overall_score ?? d.score ?? d.puan;
                  const scoreColor = score != null
                    ? score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                    : 'text-slate-500';
                  return (
                    <tr key={i} className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:bg-white/[0.02]">
                      <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 font-mono">{(d.chat_id || '-').toString().substring(0, 12)}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{d.agent_name || d.agent || '-'}</td>
                      <td className="px-3 py-1.5">{d.brand_id ? <BrandBadge brandId={d.brand_id} /> : <span className="text-slate-500">-</span>}</td>
                      <td className={`px-3 py-1.5 text-center font-semibold ${scoreColor}`}>{score ?? '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{d.sentiment ?? d.duygu ?? '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400 max-w-[150px] truncate">{d.chat_topic ?? d.topic ?? d.konu ?? '-'}</td>
                      <td className="px-3 py-1.5 text-slate-500">{(d.model_used ?? d.model ?? '-').replace('claude-', '')}</td>
                      <td className="px-3 py-1.5 text-center">{d.sonnet_upgrade ? <span className="text-purple-400">Yes</span> : <span className="text-slate-600">-</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Telegram Bildirimleri Tab
   ============================================================ */

interface TelegramAlert {
  id: string;
  chat_id: string;
  analysis_id: string | null;
  brand_id: string;
  alert_type: string;
  severity: string;
  message: string;
  telegram_message_id: string | null;
  push_sent_at: string | null;
  created_at: string;
  // joined fields
  agent_name?: string;
  overall_score?: number | null;
  chat_topic?: string | null;
}

interface TelegramStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  missedChat: number;
}

function TelegramTab() {
  const [alerts, setAlerts] = useState<TelegramAlert[]>([]);
  const [stats, setStats] = useState<TelegramStats>({ total: 0, critical: 0, high: 0, medium: 0, missedChat: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date();
    const ist = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return ist.toISOString().substring(0, 10);
  });
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const startOfDay = dateFilter + 'T00:00:00+03:00';
      const endOfDay = dateFilter + 'T23:59:59+03:00';

      let query = supabase
        .from('alerts')
        .select(`
          id, chat_id, analysis_id, brand_id, alert_type, severity, message,
          telegram_message_id, push_sent_at, created_at,
          chat_analysis ( overall_score, chat_topic ),
          chats ( agent_name )
        `, { count: 'exact' })
        .eq('sent_to_telegram', true)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (brandFilter !== 'all') query = query.eq('brand_id', brandFilter);
      if (typeFilter !== 'all') query = query.eq('alert_type', typeFilter);
      if (severityFilter !== 'all') query = query.eq('severity', severityFilter);

      const from = (currentPage - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      const rows: TelegramAlert[] = (data || []).map((row: any) => ({
        id: row.id,
        chat_id: row.chat_id,
        analysis_id: row.analysis_id,
        brand_id: row.brand_id,
        alert_type: row.alert_type,
        severity: row.severity,
        message: row.message,
        telegram_message_id: row.telegram_message_id,
        push_sent_at: row.push_sent_at,
        created_at: row.created_at,
        agent_name: row.chats?.agent_name || null,
        overall_score: row.chat_analysis?.overall_score ?? null,
        chat_topic: row.chat_analysis?.chat_topic || null,
      }));

      setAlerts(rows);
      setTotalCount(count || 0);

      // Stats counts
      const buildQ = (extra?: (q: any) => any) => {
        let q = supabase.from('alerts').select('*', { count: 'exact', head: true })
          .eq('sent_to_telegram', true)
          .gte('created_at', startOfDay).lte('created_at', endOfDay);
        if (brandFilter !== 'all') q = q.eq('brand_id', brandFilter);
        if (typeFilter !== 'all') q = q.eq('alert_type', typeFilter);
        if (severityFilter !== 'all') q = q.eq('severity', severityFilter);
        if (extra) q = extra(q);
        return q;
      };

      const [totalR, critR, highR, medR, missedR] = await Promise.all([
        buildQ(),
        buildQ(q => q.eq('severity', 'critical')),
        buildQ(q => q.eq('severity', 'high')),
        buildQ(q => q.eq('severity', 'medium')),
        buildQ(q => q.eq('alert_type', 'missed_chat')),
      ]);

      setStats({
        total: totalR.count || 0,
        critical: critR.count || 0,
        high: highR.count || 0,
        medium: medR.count || 0,
        missedChat: missedR.count || 0,
      });
    } catch (err) {
      console.error('Error loading telegram alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, brandFilter, typeFilter, severityFilter, currentPage]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const severityColor = (s: string) => {
    if (s === 'critical') return 'text-red-400 bg-red-400/10';
    if (s === 'high') return 'text-orange-400 bg-orange-400/10';
    if (s === 'medium') return 'text-yellow-400 bg-yellow-400/10';
    return 'text-slate-500 dark:text-slate-400 bg-slate-400/10';
  };

  const severityLabel = (s: string) => {
    if (s === 'critical') return 'Kritik';
    if (s === 'high') return 'Yuksek';
    if (s === 'medium') return 'Orta';
    return s;
  };

  const typeLabel = (t: string) => {
    if (t === 'quality_issue') return 'Kalite';
    if (t === 'missed_chat') return 'Kacirma';
    return t;
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllJSON = () => {
    const data = {
      date: dateFilter,
      stats,
      alerts: alerts.map(a => ({
        id: a.id,
        time: formatIst(a.created_at),
        brand: BRAND_NAMES[a.brand_id] || a.brand_id,
        type: typeLabel(a.alert_type),
        severity: severityLabel(a.severity),
        agent: a.agent_name || '-',
        score: a.overall_score ?? '-',
        topic: a.chat_topic || '-',
        telegram_msg_id: a.telegram_message_id || '-',
        push_sent: a.push_sent_at ? 'Evet' : 'Hayir',
        chat_id: a.chat_id,
      })),
      exported_at: new Date().toISOString(),
    };
    downloadFile(JSON.stringify(data, null, 2), `telegram-log-${dateFilter}.json`, 'application/json');
  };

  const downloadAllMD = () => {
    let md = `# Telegram Bildirim Raporu - ${dateFilter}\n\n`;
    md += `## Ozet\n\n`;
    md += `| Metrik | Deger |\n|---|---|\n`;
    md += `| Toplam Gonderilen | ${stats.total} |\n`;
    md += `| Kritik | ${stats.critical} |\n`;
    md += `| Yuksek | ${stats.high} |\n`;
    md += `| Orta | ${stats.medium} |\n`;
    md += `| Kacirilan Chat | ${stats.missedChat} |\n`;

    md += `\n## Detaylar (${alerts.length})\n\n`;
    md += `| # | Saat | Marka | Tip | Ciddiyet | Agent | Puan | Konu |\n`;
    md += `|---|---|---|---|---|---|---|---|\n`;
    alerts.forEach((a, i) => {
      md += `| ${i + 1} | ${formatTime(a.created_at)} | ${BRAND_NAMES[a.brand_id] || '-'} | ${typeLabel(a.alert_type)} | ${severityLabel(a.severity)} | ${a.agent_name || '-'} | ${a.overall_score ?? '-'} | ${a.chat_topic || '-'} |\n`;
    });
    md += `\n---\n*Olusturulma: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}*\n`;
    downloadFile(md, `telegram-log-${dateFilter}.md`, 'text/markdown');
  };

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Toplam Gonderilen</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Kritik</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Yuksek</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.high}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Orta</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.medium}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Kacirilan Chat</p>
          <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{stats.missedChat}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-500 dark:text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50" />
          <select value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50">
            <option value="all">Tum Markalar</option>
            {Object.entries(BRAND_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50">
            <option value="all">Tum Tipler</option>
            <option value="quality_issue">Kalite Sorunu</option>
            <option value="missed_chat">Kacirilan Chat</option>
          </select>
          <select value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-sky-500/50">
            <option value="all">Tum Ciddiyet</option>
            <option value="critical">Kritik</option>
            <option value="high">Yuksek</option>
            <option value="medium">Orta</option>
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${autoRefresh ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-200/50 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08]'}`}
          >
            {autoRefresh ? <Play size={12} /> : <Pause size={12} />}
            {autoRefresh ? 'Canli' : 'Durduruldu'}
          </button>
          <button onClick={loadData} className="p-2 rounded-lg bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {alerts.length > 0 && (
            <>
              <button onClick={downloadAllJSON}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-300 hover:bg-sky-500/20 transition-colors">
                <FileJson size={12} />JSON
              </button>
              <button onClick={downloadAllMD}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                <FileText size={12} />MD
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        {loading && alerts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-slate-500" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Send size={48} className="mx-auto mb-3 opacity-30" />
            <p>Bu tarihte telegram bildirimi yok</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Zaman</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Marka</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Tip</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Ciddiyet</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Agent</th>
                    <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Puan</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Konu</th>
                    <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">TG ID</th>
                    <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Push</th>
                    <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map(alert => {
                    const scoreColor = alert.overall_score != null
                      ? alert.overall_score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : alert.overall_score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                      : 'text-slate-500';
                    const expanded = expandedId === alert.id;
                    return (
                      <>
                      <tr key={alert.id} className="border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:bg-white/[0.02] cursor-pointer transition-colors"
                        onClick={() => setExpandedId(expanded ? null : alert.id)}>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 font-mono">{formatTime(alert.created_at)}</td>
                        <td className="px-4 py-2.5"><BrandBadge brandId={alert.brand_id} /></td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/50 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300">{typeLabel(alert.alert_type)}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${severityColor(alert.severity)}`}>{severityLabel(alert.severity)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">{alert.agent_name || '-'}</td>
                        <td className={`px-4 py-2.5 text-center text-sm font-semibold ${scoreColor}`}>{alert.overall_score ?? '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 max-w-[200px] truncate">{alert.chat_topic || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-500 font-mono">{alert.telegram_message_id || '-'}</td>
                        <td className="px-4 py-2.5 text-center">
                          {alert.push_sent_at ? <span className="text-emerald-400 text-xs">Evet</span> : <span className="text-slate-600 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={alert.id + '-detail'} className="bg-slate-50/50 dark:bg-white/[0.01]">
                          <td colSpan={10} className="px-6 py-4">
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div className="space-y-2">
                                  <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Bildirim Bilgisi</div>
                                  <div className="flex justify-between"><span className="text-slate-500">Alert ID:</span><span className="text-slate-500 dark:text-slate-400 font-mono">{alert.id.substring(0, 12)}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Chat ID:</span><span className="text-slate-500 dark:text-slate-400 font-mono">{alert.chat_id}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Gonderim:</span><span className="text-slate-600 dark:text-slate-300">{formatIst(alert.created_at)}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Telegram MSG:</span><span className="text-slate-600 dark:text-slate-300">{alert.telegram_message_id || '-'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Push Gonderildi:</span><span className={alert.push_sent_at ? 'text-emerald-300' : 'text-slate-500'}>{alert.push_sent_at ? formatIst(alert.push_sent_at) : 'Hayir'}</span></div>
                                </div>
                                <div className="space-y-2">
                                  <div className="text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Analiz Detayi</div>
                                  <div className="flex justify-between"><span className="text-slate-500">Agent:</span><span className="text-slate-600 dark:text-slate-300">{alert.agent_name || '-'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Puan:</span><span className={`font-semibold ${scoreColor}`}>{alert.overall_score ?? '-'}/100</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Konu:</span><span className="text-slate-600 dark:text-slate-300">{alert.chat_topic || '-'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Tip:</span><span className="text-slate-600 dark:text-slate-300">{typeLabel(alert.alert_type)}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Ciddiyet:</span><span className={severityColor(alert.severity).split(' ')[0]}>{severityLabel(alert.severity)}</span></div>
                                </div>
                              </div>
                              <div className="border-t border-slate-200 dark:border-white/[0.06] pt-3">
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">Telegram Mesaji</div>
                                <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-lg p-3 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">{alert.message}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/[0.06]">
                <p className="text-xs text-slate-500">{totalCount} kayit, sayfa {currentPage}/{totalPages}</p>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                    className="px-3 py-1 text-xs bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-colors">Onceki</button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                    className="px-3 py-1 text-xs bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-colors">Sonraki</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Main SyncLogs with Tab System (default export)
   ============================================================ */

type TabKey = 'sync' | 'analiz' | 'telegram';

const TABS: { key: TabKey; label: string; icon: typeof Activity }[] = [
  { key: 'sync', label: 'Sync Loglari', icon: Activity },
  { key: 'analiz', label: 'Analiz Loglari', icon: Sparkles },
  { key: 'telegram', label: 'Telegram Bildirimleri', icon: Send },
];

export default function SyncLogs() {
  const [activeTab, setActiveTab] = useState<TabKey>('sync');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/[0.03] border border-transparent'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'sync' && <SyncLogsContent />}
      {activeTab === 'analiz' && <AnalyzLogsTab />}
      {activeTab === 'telegram' && <TelegramTab />}
    </div>
  );
}
