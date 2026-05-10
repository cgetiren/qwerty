import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useBrand } from '../lib/brand';
import { Flag, TrendingUp, TrendingDown, Minus, Calendar, User, MessageSquare, ChevronDown, ChevronUp, Filter, RefreshCw } from 'lucide-react';

interface ObjectionLog {
  id: string;
  chat_id: string;
  brand_id: string;
  agent_name: string | null;
  customer_name: string | null;
  chat_date: string | null;
  original_score: number | null;
  new_score: number | null;
  score_diff: number | null;
  objection_reason: string;
  objected_by_name: string | null;
  objected_at: string;
  reanalysis_status: string;
  reanalyzed_at: string | null;
  resolved: boolean;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  original_summary: string | null;
  new_summary: string | null;
  original_sentiment: string | null;
  new_sentiment: string | null;
}

interface Stats {
  total: number;
  pending: number;
  completed: number;
  avgScoreChange: number;
  scoreIncreased: number;
  scoreDecreased: number;
  scoreUnchanged: number;
}

function formatIstanbulDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const ist = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return ist.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + ist.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function ScoreBadge({ score, size = 'sm' }: { score: number | null; size?: 'sm' | 'lg' }) {
  if (score === null) return <span className="text-slate-500">-</span>;
  const color = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : score >= 40 ? 'text-orange-400' : 'text-red-400';
  const bg = score >= 80 ? 'bg-emerald-400/10' : score >= 60 ? 'bg-amber-400/10' : score >= 40 ? 'bg-orange-400/10' : 'bg-red-400/10';
  const textSize = size === 'lg' ? 'text-lg font-bold' : 'text-sm font-semibold';
  return <span className={`${color} ${bg} ${textSize} px-2 py-0.5 rounded`}>{score}</span>;
}

function DiffBadge({ diff }: { diff: number | null }) {
  if (diff === null) return <span className="text-slate-500">-</span>;
  if (diff > 0) return <span className="text-emerald-400 bg-emerald-400/10 text-sm font-semibold px-2 py-0.5 rounded flex items-center gap-1"><TrendingUp size={14} />+{diff}</span>;
  if (diff < 0) return <span className="text-red-400 bg-red-400/10 text-sm font-semibold px-2 py-0.5 rounded flex items-center gap-1"><TrendingDown size={14} />{diff}</span>;
  return <span className="text-slate-500 dark:text-slate-400 bg-slate-400/10 text-sm font-semibold px-2 py-0.5 rounded flex items-center gap-1"><Minus size={14} />0</span>;
}

function StatusBadge({ status, resolved }: { status: string; resolved: boolean }) {
  if (resolved) return <span className="text-emerald-400 bg-emerald-400/10 text-xs px-2 py-1 rounded-full">Tamamlandi</span>;
  if (status === 'completed') return <span className="text-sky-400 bg-sky-400/10 text-xs px-2 py-1 rounded-full">Analiz Edildi</span>;
  if (status === 'pending') return <span className="text-amber-400 bg-amber-400/10 text-xs px-2 py-1 rounded-full">Bekliyor</span>;
  return <span className="text-red-400 bg-red-400/10 text-xs px-2 py-1 rounded-full">Basarisiz</span>;
}

export default function ObjectionReport() {
  const { activeBrand } = useBrand();
  const [logs, setLogs] = useState<ObjectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, completed: 0, avgScoreChange: 0, scoreIncreased: 0, scoreDecreased: 0, scoreUnchanged: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agents, setAgents] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    if (!activeBrand?.brand_id) return;
    setLoading(true);

    try {
      let query = supabase
        .from('objection_logs')
        .select('*')
        .eq('brand_id', activeBrand.brand_id)
        .order('objected_at', { ascending: false });

      if (dateFrom) query = query.gte('objected_at', dateFrom + 'T00:00:00+03:00');
      if (dateTo) query = query.lte('objected_at', dateTo + 'T23:59:59+03:00');
      if (agentFilter) query = query.eq('agent_name', agentFilter);
      if (statusFilter === 'pending') query = query.eq('reanalysis_status', 'pending');
      if (statusFilter === 'completed') query = query.eq('reanalysis_status', 'completed').eq('resolved', false);
      if (statusFilter === 'resolved') query = query.eq('resolved', true);

      const { data, error } = await query;
      if (error) throw error;

      const objections = (data || []) as ObjectionLog[];
      setLogs(objections);

      // Stats hesapla
      const completed = objections.filter(o => o.new_score !== null);
      const diffs = completed.filter(o => o.score_diff !== null).map(o => o.score_diff!);
      setStats({
        total: objections.length,
        pending: objections.filter(o => o.reanalysis_status === 'pending').length,
        completed: completed.length,
        avgScoreChange: diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 10) / 10 : 0,
        scoreIncreased: diffs.filter(d => d > 0).length,
        scoreDecreased: diffs.filter(d => d < 0).length,
        scoreUnchanged: diffs.filter(d => d === 0).length,
      });

      // Agent listesi
      const uniqueAgents = [...new Set(objections.map(o => o.agent_name).filter(Boolean))] as string[];
      setAgents(uniqueAgents.sort());
    } catch (err) {
      console.error('Error loading objection logs:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBrand?.brand_id, dateFrom, dateTo, agentFilter, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <Flag size={22} className="text-rose-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Itiraz Raporu</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Analiz itirazlarinin takibi ve karsilastirmasi</p>
          </div>
        </div>
        <button onClick={loadData} className="p-2 rounded-lg bg-slate-200/50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Toplam Itiraz</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Bekleyen</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Tamamlanan</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Ort. Puan Degisimi</p>
          <p className={`text-2xl font-bold ${stats.avgScoreChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : stats.avgScoreChange < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {stats.avgScoreChange > 0 ? '+' : ''}{stats.avgScoreChange}
          </p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Puan Artti</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.scoreIncreased}</p>
        </div>
        <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Puan Dustu</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.scoreDecreased}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-slate-500 dark:text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-rose-500/50" placeholder="Baslangic" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-rose-500/50" placeholder="Bitis" />
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-rose-500/50">
            <option value="">Tum Temsilciler</option>
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-200/50 dark:bg-white/[0.05] border border-slate-300 dark:border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-rose-500/50">
            <option value="all">Tum Durumlar</option>
            <option value="pending">Bekleyen</option>
            <option value="completed">Analiz Edildi</option>
            <option value="resolved">Tamamlandi</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-slate-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Flag size={48} className="mx-auto mb-3 opacity-30" />
            <p>Henuz itiraz kaydi yok</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Tarih</th>
                  <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Temsilci</th>
                  <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Musteri</th>
                  <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Onceki Puan</th>
                  <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Yeni Puan</th>
                  <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Fark</th>
                  <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Durum</th>
                  <th className="text-left text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3">Itiraz Eden</th>
                  <th className="text-center text-xs text-slate-600 dark:text-slate-500 font-medium px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <>
                    <tr key={log.id} className="border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-600 dark:text-slate-300">{formatIstanbulDate(log.objected_at)}</div>
                        <div className="text-xs text-slate-500">{formatIstanbulDate(log.chat_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-slate-500" />
                          <span className="text-sm text-slate-600 dark:text-slate-300">{log.agent_name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{log.customer_name || '-'}</td>
                      <td className="px-4 py-3 text-center"><ScoreBadge score={log.original_score} /></td>
                      <td className="px-4 py-3 text-center"><ScoreBadge score={log.new_score} /></td>
                      <td className="px-4 py-3 text-center"><DiffBadge diff={log.score_diff} /></td>
                      <td className="px-4 py-3"><StatusBadge status={log.reanalysis_status} resolved={log.resolved} /></td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{log.objected_by_name || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {expandedId === log.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr key={log.id + '-detail'} className="bg-slate-50/50 dark:bg-white/[0.01]">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs text-slate-500 mb-1">Itiraz Sebebi</p>
                                <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">{log.objection_reason}</p>
                              </div>
                              {log.resolution_note && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">Cozum Notu</p>
                                  <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">{log.resolution_note}</p>
                                </div>
                              )}
                              <div className="flex gap-4 text-xs text-slate-500">
                                <span>Chat ID: <span className="text-slate-500 dark:text-slate-400">{log.chat_id}</span></span>
                                {log.reanalyzed_at && <span>Yeniden Analiz: <span className="text-slate-500 dark:text-slate-400">{formatIstanbulDate(log.reanalyzed_at)}</span></span>}
                                {log.resolved_at && <span>Cozum: <span className="text-slate-500 dark:text-slate-400">{formatIstanbulDate(log.resolved_at)}</span></span>}
                              </div>
                            </div>
                            <div className="space-y-3">
                              {log.original_summary && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">Onceki Analiz Ozeti</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-lg p-3 max-h-24 overflow-y-auto">{log.original_summary}</p>
                                </div>
                              )}
                              {log.new_summary && (
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">Yeni Analiz Ozeti</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-lg p-3 max-h-24 overflow-y-auto">{log.new_summary}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
