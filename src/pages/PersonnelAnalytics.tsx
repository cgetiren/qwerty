import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { maskName, getIstanbulDateStartUTC, getIstanbulDateEndUTC, formatDateInIstanbulTimezone, convertIstanbulDateToUTC } from '../lib/utils';
import { User, TrendingUp, TrendingDown, AlertTriangle, Award, RefreshCw, ThumbsUp, ThumbsDown, PhoneOff, X, ChevronDown, ChevronUp, Lightbulb, Calendar, Zap, Clock, BarChart2, CalendarRange } from 'lucide-react';
import type { Personnel } from '../types';
import { useNotification } from '../lib/notifications';
import MissedChatsModal from '../components/MissedChatsModal';
import { useBrand } from '../lib/brand';

type DateRange = '7' | '14' | '30' | 'custom';

interface ActiveDates {
  startDate: string;
  endDate: string;
  startUTC: string;
  endUTC: string;
}

interface RecurringIssue {
  chat_id: string;
  customer_name: string;
  overall_score: number;
  critical_errors: string[];
  improvement_areas: string[];
  coaching_suggestion: string | null;
  recommendations: string | null;
  analysis_date: string;
}

interface RatingInfo {
  like_count: number;
  dislike_count: number;
  missed_count: number;
  warning_count: number;
  avg_first_response_time: number | null;
  avg_resolution_time: number | null;
}

const DEFAULT_RATING: RatingInfo = {
  like_count: 0, dislike_count: 0, missed_count: 0, warning_count: 0,
  avg_first_response_time: null, avg_resolution_time: null,
};

const getScoreColor = (score: number): string => {
  if (score >= 90) return '#10b981';
  if (score >= 70) return '#06b6d4';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';
  if (score >= 30) return '#f97316';
  return '#f43f5e';
};

const TIER_PALETTE: Record<string, {
  text: string; bg: string; border: string; dot: string;
  selectedBorder: string; selectedBg: string; glowClass: string; hex: string;
}> = {
  A: { text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', dot: 'bg-emerald-400', selectedBorder: 'border-emerald-500/60', selectedBg: 'bg-emerald-500/5', glowClass: 'glow-emerald-pulse', hex: '#10b981' },
  B: { text: 'text-cyan-300',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',    dot: 'bg-cyan-400',    selectedBorder: 'border-cyan-500/60',    selectedBg: 'bg-cyan-500/5',    glowClass: 'glow-cyan-pulse',    hex: '#06b6d4' },
  C: { text: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    dot: 'bg-blue-400',    selectedBorder: 'border-blue-500/60',    selectedBg: 'bg-blue-500/5',    glowClass: 'glow-blue-pulse',    hex: '#3b82f6' },
  D: { text: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   dot: 'bg-amber-400',   selectedBorder: 'border-amber-500/60',   selectedBg: 'bg-amber-500/5',   glowClass: 'glow-amber-pulse',   hex: '#f59e0b' },
};

const ScoreRing = ({ score, color, size = 56 }: { score: number; color: string; size?: number }) => {
  const r = size * 0.36;
  const c = size / 2;
  const filled = Math.max(0, Math.min(100, Math.round(score))) * 0.75;
  const fontSize = size < 50 ? 10 : size < 64 ? 12 : 14;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ overflow: 'visible' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4"
        strokeDasharray="75 100" strokeLinecap="round" pathLength="100"
        style={{ transform: `rotate(135deg)`, transformOrigin: `${c}px ${c}px` }}
      />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${filled} 100`} strokeLinecap="round" pathLength="100"
        style={{
          transform: `rotate(135deg)`,
          transformOrigin: `${c}px ${c}px`,
          filter: `drop-shadow(0 0 5px ${color}99)`,
          animation: 'score-ring-in 0.9s cubic-bezier(0.4,0,0.2,1) both',
        }}
      />
      <text x={c} y={c + fontSize * 0.38} textAnchor="middle"
        fill="white" fontSize={fontSize} fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
      >{Math.round(score)}</text>
    </svg>
  );
};

const TierBadge = ({ tier, label }: { tier: string; label: string }) => {
  const p = TIER_PALETTE[tier] ?? TIER_PALETTE['D'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border flex-shrink-0 ${p.bg} ${p.text} ${p.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot} shadow-sm`} style={{ boxShadow: `0 0 6px ${p.hex}88` }} />
      {label}
    </span>
  );
};

export default function PersonnelAnalytics() {
  const { showSuccess, showError } = useNotification();
  const { activeBrand } = useBrand();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [ratingInfo, setRatingInfo] = useState<Record<string, RatingInfo>>({});
  const [dateRange, setDateRange] = useState<DateRange>('7');
  const todayStr = formatDateInIstanbulTimezone(getIstanbulDateStartUTC(0));
  const [customStart, setCustomStart] = useState<string>(formatDateInIstanbulTimezone(getIstanbulDateStartUTC(6)));
  const [customEnd, setCustomEnd] = useState<string>(todayStr);
  const [appliedCustomStart, setAppliedCustomStart] = useState<string>(formatDateInIstanbulTimezone(getIstanbulDateStartUTC(6)));
  const [appliedCustomEnd, setAppliedCustomEnd] = useState<string>(todayStr);
  const [periodChats, setPeriodChats] = useState<Record<string, number>>({});
  const [periodScores, setPeriodScores] = useState<Record<string, number>>({});
  const [teamAvgChats, setTeamAvgChats] = useState<number>(0);
  const [recurringModal, setRecurringModal] = useState<{ isOpen: boolean; personnelName: string; issues: RecurringIssue[]; loading: boolean; expandedIndex: number | null }>({
    isOpen: false, personnelName: '', issues: [], loading: false, expandedIndex: null,
  });
  const [chatModal, setChatModal] = useState<{ isOpen: boolean; loading: boolean; type: string; chats: any[]; title: string }>({
    isOpen: false, loading: false, type: '', chats: [], title: ''
  });
  const [messagesModal, setMessagesModal] = useState<{ isOpen: boolean; messages: any[]; chatId: string; customerName: string; loading: boolean }>({
    isOpen: false, messages: [], chatId: '', customerName: '', loading: false
  });
  const [missedChatsModal, setMissedChatsModal] = useState<{ isOpen: boolean; agentName: string }>({
    isOpen: false, agentName: ''
  });

  const getActiveDates = (): ActiveDates => {
    if (dateRange === 'custom') {
      return {
        startDate: appliedCustomStart,
        endDate: appliedCustomEnd,
        startUTC: convertIstanbulDateToUTC(appliedCustomStart, false),
        endUTC: convertIstanbulDateToUTC(appliedCustomEnd, true),
      };
    }
    const days = parseInt(dateRange);
    return {
      startDate: formatDateInIstanbulTimezone(getIstanbulDateStartUTC(days - 1)),
      endDate: formatDateInIstanbulTimezone(getIstanbulDateStartUTC(0)),
      startUTC: getIstanbulDateStartUTC(days - 1),
      endUTC: getIstanbulDateEndUTC(0),
    };
  };

  const applyCustomRange = () => {
    setAppliedCustomStart(customStart);
    setAppliedCustomEnd(customEnd);
  };

  useEffect(() => { loadPersonnel(); }, [activeBrand?.brand_id]);

  useEffect(() => {
    if (personnel.length > 0) {
      const dates = getActiveDates();
      loadPeriodChats(dates);
      loadRatingInfo(personnel, dates);
    }
  }, [dateRange, appliedCustomStart, appliedCustomEnd, personnel.length, activeBrand?.brand_id]);

  useEffect(() => {
    if (selectedPersonnel) {
      const dates = getActiveDates();
      loadPersonnelDetails(selectedPersonnel.name, dates);
    }
  }, [selectedPersonnel?.name, dateRange, appliedCustomStart, appliedCustomEnd, activeBrand?.brand_id]);

  const loadPersonnel = async () => {
    try {
      let query = supabase
        .from('personnel').select('*').neq('name', 'Unknown')
        .order('adjusted_score', { ascending: false });
      if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
      const { data, error } = await query;
      if (error) throw error;
      if (data && data.length > 0) {
        setPersonnel(data);
        if (selectedPersonnel) {
          const updated = data.find((p: Personnel) => p.name === selectedPersonnel.name);
          setSelectedPersonnel(updated ?? data[0]);
        } else {
          setSelectedPersonnel(data[0]);
        }
        await loadRatingInfo(data, getActiveDates());
      }
    } catch (error) {
      console.error('Error loading personnel:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRatingInfo = async (_personnelList: Personnel[], dates: ActiveDates) => {
    try {
      const rpcParams: Record<string, unknown> = {};
      if (dateRange === 'custom') {
        rpcParams.p_start_date = appliedCustomStart;
        rpcParams.p_end_date = appliedCustomEnd;
      } else {
        rpcParams.p_days_back = parseInt(dateRange);
      }
      if (activeBrand?.brand_id) rpcParams.p_brand_id = activeBrand.brand_id;

      const { data, error } = await supabase.rpc('get_personnel_rating_stats', rpcParams);
      if (error) throw error;

      const entries: [string, RatingInfo][] = (data || []).map((r: any) => [
        r.agent_name,
        {
          like_count: r.likes ?? 0,
          dislike_count: r.dislikes ?? 0,
          missed_count: r.missed ?? 0,
          warning_count: r.warning_count ?? 0,
          avg_first_response_time: r.avg_response_time > 0 ? r.avg_response_time : null,
          avg_resolution_time: r.avg_duration > 0 ? r.avg_duration : null,
        },
      ]);

      setRatingInfo(Object.fromEntries(entries));
    } catch (error) {
      console.error('Error loading rating info:', error);
    }
  };

  const recalculateStats = async () => {
    setRecalculating(true);
    try {
      const { error } = await supabase.rpc('recalculate_personnel_stats');
      if (error) {
        console.error('recalculate_personnel_stats error:', error);
        throw error;
      }
      await loadPersonnel();
      if (selectedPersonnel) await loadPersonnelDetails(selectedPersonnel.name, getActiveDates());
      showSuccess('İstatistikler başarıyla yeniden hesaplandı!');
    } catch (error: any) {
      const msg = error?.message || error?.details || 'Bilinmeyen hata';
      showError(`Yeniden hesaplama hatası: ${msg}`);
    } finally {
      setRecalculating(false);
    }
  };

  const closeChatModal = () =>
    setChatModal({ isOpen: false, loading: false, type: '', chats: [], title: '' });

  const openLikedChatsModal = async (personName: string) => {
    setChatModal({ isOpen: true, loading: true, type: 'like', chats: [], title: `${personName} — Beğenilen Chatler` });
    let query = supabase.from('chats')
      .select('id, customer_name')
      .eq('agent_name', personName)
      .or('rating_status.eq.rated_good,rating_status.eq.rated_commented')
      .order('created_at', { ascending: false }).limit(50);
    if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
    const { data } = await query;
    setChatModal(prev => ({ ...prev, loading: false, chats: data ?? [] }));
  };

  const openDislikedChatsModal = async (personName: string) => {
    setChatModal({ isOpen: true, loading: true, type: 'dislike', chats: [], title: `${personName} — Beğenilmeyen Chatler` });
    let query = supabase.from('chats')
      .select('id, customer_name')
      .eq('agent_name', personName).eq('rating_status', 'rated_bad')
      .order('created_at', { ascending: false }).limit(50);
    if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
    const { data } = await query;
    setChatModal(prev => ({ ...prev, loading: false, chats: data ?? [] }));
  };

  const openWarningChatsModal = async (personName: string) => {
    setChatModal({ isOpen: true, loading: true, type: 'warning', chats: [], title: `${personName} — Uyarı Alan Chatler` });
    let chatIdsQuery = supabase.from('chats')
      .select('id, customer_name').eq('agent_name', personName);
    if (activeBrand?.brand_id) chatIdsQuery = chatIdsQuery.eq('brand_id', activeBrand.brand_id);
    const { data: chatIds } = await chatIdsQuery;
    const ids = (chatIds ?? []).map((c: { id: string }) => c.id);
    const customerMap = new Map((chatIds ?? []).map((c: { id: string; customer_name: string }) => [c.id, c.customer_name || 'Bilinmiyor']));
    const warnings: any[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      let warnQuery = supabase.from('chat_analysis')
        .select('id, chat_id, overall_score')
        .in('chat_id', ids.slice(i, i + 1000))
        .lt('overall_score', 40)
        .order('overall_score', { ascending: true }).limit(50);
      if (activeBrand?.brand_id) warnQuery = warnQuery.eq('brand_id', activeBrand.brand_id);
      const { data } = await warnQuery;
      if (data) warnings.push(...data);
    }
    const chats = warnings.slice(0, 50).map(w => ({
      id: w.id, chat_id: w.chat_id,
      customer_name: customerMap.get(w.chat_id) || 'Bilinmiyor',
      overall_score: w.overall_score,
    }));
    setChatModal(prev => ({ ...prev, loading: false, chats }));
  };

  const loadChatMessages = async (chatId: string, customerName: string) => {
    setMessagesModal({ isOpen: true, messages: [], chatId, customerName, loading: true });
    try {
      const { data, error } = await supabase.from('chat_messages').select('*')
        .eq('chat_id', chatId).order('created_at', { ascending: true });
      if (error) throw error;
      setMessagesModal(prev => ({ ...prev, messages: data || [], loading: false }));
    } catch {
      showError('Chat mesajları yüklenirken hata oluştu');
      setMessagesModal(prev => ({ ...prev, loading: false }));
    }
  };

  const closeChatMessagesModal = () =>
    setMessagesModal({ isOpen: false, messages: [], chatId: '', customerName: '', loading: false });

  const openMissedChatsModal = (agentName: string) =>
    setMissedChatsModal({ isOpen: true, agentName });
  const closeMissedChatsModal = () =>
    setMissedChatsModal({ isOpen: false, agentName: '' });

  const loadPeriodChats = async (dates: ActiveDates) => {
    try {
      let query = supabase.from('personnel_daily_stats')
        .select('personnel_name, total_chats, total_analysis_score, analysis_count')
        .gte('date', dates.startDate).lte('date', dates.endDate);
      if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
      const { data, error } = await query;
      if (error) throw error;

      const chatMap: Record<string, number> = {};
      const scoreMap: Record<string, { totalScore: number; totalAnalysis: number }> = {};

      for (const row of data || []) {
        chatMap[row.personnel_name] = (chatMap[row.personnel_name] || 0) + row.total_chats;
        if (!scoreMap[row.personnel_name]) scoreMap[row.personnel_name] = { totalScore: 0, totalAnalysis: 0 };
        scoreMap[row.personnel_name].totalScore += (row.total_analysis_score || 0);
        scoreMap[row.personnel_name].totalAnalysis += (row.analysis_count || 0);
      }

      const computedScores: Record<string, number> = {};
      for (const name of Object.keys(scoreMap)) {
        const { totalScore, totalAnalysis } = scoreMap[name];
        if (totalAnalysis > 0) computedScores[name] = Math.round(totalScore / totalAnalysis);
      }

      setPeriodChats(chatMap);
      setPeriodScores(computedScores);
      const values = Object.values(chatMap).filter(v => v > 0);
      setTeamAvgChats(values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);
    } catch (error) {
      console.error('Error loading period chats:', error);
    }
  };

  const loadPersonnelDetails = async (personnelName: string, dates: ActiveDates) => {
    try {
      let query = supabase.from('personnel_daily_stats').select('*')
        .eq('personnel_name', personnelName)
        .gte('date', dates.startDate).lte('date', dates.endDate)
        .order('date', { ascending: false });
      if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
      const { data, error } = await query;
      if (error) throw error;
      setDailyStats(data || []);
    } catch (error) {
      console.error('Error loading personnel details:', error);
    }
  };

  const openRecurringModal = async (person: Personnel) => {
    setRecurringModal({ isOpen: true, personnelName: person.name, issues: [], loading: true, expandedIndex: null });
    try {
      let chatIdsQuery = supabase.from('chats').select('id, customer_name').eq('agent_name', person.name);
      if (activeBrand?.brand_id) chatIdsQuery = chatIdsQuery.eq('brand_id', activeBrand.brand_id);
      const { data: chatIds } = await chatIdsQuery;
      if (!chatIds || chatIds.length === 0) { setRecurringModal(prev => ({ ...prev, loading: false })); return; }
      const idList = chatIds.map(c => c.id);
      const customerMap = new Map(chatIds.map(c => [c.id, c.customer_name || 'Bilinmiyor']));
      let analysesQuery = supabase.from('chat_analysis')
        .select('chat_id, overall_score, issues_detected, coaching_suggestion, recommendations, analysis_date')
        .in('chat_id', idList).lt('overall_score', 50).order('overall_score', { ascending: true });
      if (activeBrand?.brand_id) analysesQuery = analysesQuery.eq('brand_id', activeBrand.brand_id);
      const { data: analyses } = await analysesQuery;
      const issues: RecurringIssue[] = (analyses || []).map(a => ({
        chat_id: a.chat_id, customer_name: customerMap.get(a.chat_id) || 'Bilinmiyor',
        overall_score: a.overall_score, critical_errors: a.issues_detected?.critical_errors || [],
        improvement_areas: a.issues_detected?.improvement_areas || [],
        coaching_suggestion: a.coaching_suggestion || null, recommendations: a.recommendations || null,
        analysis_date: a.analysis_date,
      }));
      setRecurringModal(prev => ({ ...prev, issues, loading: false }));
    } catch { setRecurringModal(prev => ({ ...prev, loading: false })); }
  };

  const parseScore = (score: number | string): number => {
    if (typeof score === 'string') { const p = parseFloat(score); return isNaN(p) ? 0 : p; }
    return score;
  };

  const getPerformanceLevel = (score: number | string) => {
    const n = parseScore(score);
    if (n >= 90) return { label: 'Mükemmel', color: 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/20' };
    if (n >= 70) return { label: 'İyi',      color: 'text-cyan-400 bg-cyan-500/15 border border-cyan-500/20' };
    if (n >= 60) return { label: 'Orta',     color: 'text-blue-400 bg-blue-500/15 border border-blue-500/20' };
    if (n >= 40) return { label: 'Olumsuz',  color: 'text-amber-400 bg-amber-500/15 border border-amber-500/20' };
    if (n >= 30) return { label: 'Dikkat',   color: 'text-orange-400 bg-orange-500/15 border border-orange-500/20' };
    return { label: 'Kritik', color: 'text-rose-400 bg-rose-500/15 border border-rose-500/20' };
  };

  const getTierLabel = (tier: string) => {
    switch(tier) {
      case 'A': return 'En Güvenilir';
      case 'B': return 'Güvenilir';
      case 'C': return 'Orta Güvenilir';
      case 'D': return 'Düşük Güvenilir';
      default: return tier;
    }
  };

  const fmtTime = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}dk ${s > 0 ? s + 's' : ''}`.trim() : `${s}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-spin" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Personel verileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  const periodLabel = dateRange === 'custom'
    ? `${appliedCustomStart} – ${appliedCustomEnd}`
    : `Son ${dateRange} Gün`;

  const periodShortLabel = dateRange === 'custom'
    ? `${appliedCustomStart.slice(5)} – ${appliedCustomEnd.slice(5)}`
    : `Son ${dateRange}g`;

  return (
    <div className="space-y-5">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Personel Performansı
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Temsilci bazlı kalite analizi ve performans metrikleri</p>
        </div>
        <button
          onClick={recalculateStats}
          disabled={recalculating}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex-shrink-0 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.02]"
        >
          <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
          {recalculating ? 'Yenileniyor...' : 'Yenile'}
        </button>
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ─── Left Column: List ─── */}
        <div className="lg:col-span-1 flex flex-col gap-3">

          {/* Controls panel */}
          <div className="bg-slate-100 dark:bg-slate-800/50 backdrop-blur-xl border border-slate-200 dark:border-white/8 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Personel Listesi</h2>
              <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">{personnel.length} kişi</span>
            </div>

            {/* Date range tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-200 dark:border-white/5">
              {(['7', '14', '30'] as DateRange[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDateRange(d)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    dateRange === d
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5'
                  }`}
                >
                  Son {d}G
                </button>
              ))}
              <button
                onClick={() => setDateRange('custom')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-1 ${
                  dateRange === 'custom'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5'
                }`}
              >
                <CalendarRange className="w-3 h-3" />
                Özel
              </button>
            </div>

            {/* Custom date range picker */}
            {dateRange === 'custom' && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Başlangıç</label>
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd}
                      onChange={e => setCustomStart(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-300 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:[color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Bitiş</label>
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart}
                      max={todayStr}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-300 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:[color-scheme:dark]"
                    />
                  </div>
                </div>
                <button
                  onClick={applyCustomRange}
                  disabled={!customStart || !customEnd || customStart > customEnd}
                  className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/20"
                >
                  Uygula
                </button>
              </div>
            )}

            {/* Team avg */}
            {teamAvgChats > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/40 rounded-xl border border-slate-200 dark:border-white/5">
                <div className="w-6 h-6 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="text-xs text-slate-500">Dönem ort. aktivite:</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">~{teamAvgChats} chat</span>
              </div>
            )}
          </div>

          {/* Cards list */}
          <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-260px)] pr-0.5 pb-2">
            {personnel.map((person, cardIdx) => {
              const overallScore = parseScore(person.adjusted_score ?? person.average_score);
              const adjustedScore = periodScores[person.name] ?? overallScore;
              const pCount = periodChats[person.name] ?? 0;
              const lowThreshold = teamAvgChats > 0 ? teamAvgChats * 0.5 : 0;
              const isBelowAvg = teamAvgChats > 0 && pCount < teamAvgChats && pCount >= lowThreshold;
              const isUnderEval = teamAvgChats > 0 && pCount < lowThreshold;
              const isSelected = selectedPersonnel?.id === person.id;
              const ratings = ratingInfo[person.name] || DEFAULT_RATING;
              const tier = person.reliability_tier ?? 'D';
              const tp = TIER_PALETTE[tier] ?? TIER_PALETTE['D'];
              const scoreColor = getScoreColor(adjustedScore);

              return (
                <div
                  key={person.id}
                  onClick={() => setSelectedPersonnel(person)}
                  className={`relative rounded-2xl border cursor-pointer overflow-hidden transition-all duration-250 animate-float-up ${
                    isSelected
                      ? `${tp.selectedBorder} ${tp.selectedBg} ${tp.glowClass}`
                      : 'border-white/7 bg-slate-100/60 dark:bg-slate-800/30 hover:bg-slate-100 dark:bg-slate-800/50 hover:border-white/14 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5'
                  }`}
                  style={{ animationDelay: `${cardIdx * 30}ms` }}
                >
                  {/* Selected accent line */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-full" style={{ background: `linear-gradient(to bottom, transparent, ${tp.hex}, transparent)` }} />
                  )}

                  <div className="p-4">
                    {/* Card header */}
                    <div className="flex items-center justify-between gap-2 mb-3.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${tp.bg} ${tp.border}`}>
                          <User className={`w-4 h-4 ${tp.text}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white text-sm truncate leading-tight">{person.name}</div>
                          <div className="text-xs text-slate-500 leading-tight mt-0.5">
                            {pCount > 0 ? `${pCount} chat · ${periodShortLabel}` : `${person.total_chats} chat toplam`}
                          </div>
                        </div>
                      </div>
                      <TierBadge tier={tier} label={getTierLabel(tier)} />
                    </div>

                    {/* Score area */}
                    {isUnderEval ? (
                      <div className="flex items-center gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5 mb-3.5">
                        <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-amber-300 leading-tight">Değerlendirme Aşamasında</div>
                          <div className="text-xs text-slate-500 mt-0.5">Dönem ort. çok altında · {pCount} / ~{teamAvgChats} chat</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 mb-3.5">
                        <div className="flex-shrink-0">
                          <ScoreRing score={adjustedScore} color={scoreColor} size={52} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPerformanceLevel(adjustedScore).color}`}>
                              {getPerformanceLevel(adjustedScore).label}
                            </span>
                            {isBelowAvg && (
                              <span className="text-xs text-amber-400/80 flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-amber-400" />
                                Ort. altı
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-lg px-2 py-1.5 text-center border border-slate-200 dark:border-white/5">
                              <div className="text-xs text-slate-600 mb-0.5">İlk Yanıt</div>
                              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{fmtTime(ratings.avg_first_response_time)}</div>
                            </div>
                            <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-lg px-2 py-1.5 text-center border border-slate-200 dark:border-white/5">
                              <div className="text-xs text-slate-600 mb-0.5">Çözüm</div>
                              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{fmtTime(ratings.avg_resolution_time)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Interaction badges */}
                    {(ratings.like_count > 0 || ratings.dislike_count > 0 || ratings.warning_count > 0 || (person.recurring_issues_count ?? 0) > 0 || ratings.missed_count > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-slate-200 dark:border-white/5">
                        {ratings.like_count > 0 && (
                          <button onClick={e => { e.stopPropagation(); openLikedChatsModal(person.name); }}
                            className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 px-2 py-1 rounded-full transition-all hover:scale-105">
                            <ThumbsUp className="w-3 h-3" /><span>{ratings.like_count}</span>
                          </button>
                        )}
                        {ratings.dislike_count > 0 && (
                          <button onClick={e => { e.stopPropagation(); openDislikedChatsModal(person.name); }}
                            className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-2 py-1 rounded-full transition-all hover:scale-105">
                            <ThumbsDown className="w-3 h-3" /><span>{ratings.dislike_count}</span>
                          </button>
                        )}
                        {ratings.warning_count > 0 && (
                          <button onClick={e => { e.stopPropagation(); openWarningChatsModal(person.name); }}
                            className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 px-2 py-1 rounded-full transition-all hover:scale-105">
                            <AlertTriangle className="w-3 h-3" /><span>{ratings.warning_count}</span>
                          </button>
                        )}
                        {(person.recurring_issues_count ?? 0) > 0 && (
                          <button onClick={e => { e.stopPropagation(); openRecurringModal(person); }}
                            className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 px-2 py-1 rounded-full transition-all hover:scale-105">
                            <Zap className="w-3 h-3" /><span>{person.recurring_issues_count} tekrar</span>
                          </button>
                        )}
                        {ratings.missed_count > 0 && (
                          <button onClick={e => { e.stopPropagation(); openMissedChatsModal(person.name); }}
                            className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 px-2 py-1 rounded-full transition-all hover:scale-105">
                            <PhoneOff className="w-3 h-3" /><span>{ratings.missed_count} kaçan</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Right Column: Detail ─── */}
        <div className="lg:col-span-2 space-y-5">
          {selectedPersonnel ? (() => {
            const sp = selectedPersonnel;
            const spOverall = parseScore(sp.adjusted_score ?? sp.average_score);
            const spScore = periodScores[sp.name] ?? spOverall;
            const spColor = getScoreColor(spScore);
            const spPerf  = getPerformanceLevel(spScore);
            const spRatings = ratingInfo[sp.name] || DEFAULT_RATING;
            const spCount = periodChats[sp.name] ?? 0;
            const spLow   = teamAvgChats > 0 ? teamAvgChats * 0.5 : 0;
            const spUnder = teamAvgChats > 0 && spCount < spLow;
            const spBelow = teamAvgChats > 0 && spCount >= spLow && spCount < teamAvgChats;
            const tier    = sp.reliability_tier ?? 'D';
            const tp      = TIER_PALETTE[tier] ?? TIER_PALETTE['D'];
            const conf    = Math.round(parseScore(sp.confidence_level || 0));

            return (
              <>
                {/* Hero card */}
                <div className={`bg-slate-100 dark:bg-slate-800/50 backdrop-blur-xl border rounded-2xl overflow-hidden ${tp.selectedBorder}`}
                  style={{ boxShadow: `0 4px 40px ${tp.hex}18` }}>

                  {/* Top strip */}
                  <div className="h-0.5 w-full" style={{ background: `linear-gradient(to right, transparent, ${spColor}, ${tp.hex}, transparent)` }} />

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <ScoreRing score={spScore} color={spColor} size={72} />
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-slate-900 dark:text-white"
                            style={{ background: spColor, boxShadow: `0 0 8px ${spColor}88` }}>
                            {tier}
                          </div>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{sp.name}</h2>
                          {sp.email && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{sp.email}</p>}
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <TierBadge tier={tier} label={`${getTierLabel(tier)} — Seviye ${tier}`} />
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${tp.bg} ${tp.text} ${tp.border}`}
                              title="Daha fazla analiz edilmiş chat, daha güvenilir bir skor demektir.">
                              Güvenilirlik %{conf}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        {spUnder ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="px-3 py-1.5 rounded-xl text-sm font-bold text-amber-300 bg-amber-500/12 border border-amber-500/25">
                              Değerlendirme Aşamasında
                            </div>
                            <span className="text-xs text-amber-400/70 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {spCount} / ~{teamAvgChats} chat
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <span className={`px-3 py-1.5 rounded-xl text-sm font-bold ${spPerf.color}`}>{spPerf.label}</span>
                            {spBelow && (
                              <span className="text-xs text-amber-400/70 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />Dönem ort. altı
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {/* Period chats */}
                      <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border border-slate-200 dark:border-white/5 animate-stat-pop" style={{ animationDelay: '0ms' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">{periodShortLabel}</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{spCount}</div>
                        <div className="text-xs text-slate-600 mt-0.5">Toplam: {sp.total_chats}</div>
                      </div>

                      {/* Period score */}
                      <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border animate-stat-pop" style={{ borderColor: `${spColor}30`, animationDelay: '60ms' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Zap className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Dönem Skoru</span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: spColor }}>{Math.round(spScore)}<span className="text-sm text-slate-600">/100</span></div>
                        <div className="text-xs text-slate-600 mt-0.5">{periodShortLabel} ortalaması</div>
                      </div>

                      {/* Overall score */}
                      <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border border-slate-200 dark:border-white/5 animate-stat-pop" style={{ animationDelay: '120ms' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Genel Skor</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{Math.round(spOverall)}<span className="text-sm text-slate-600">/100</span></div>
                        <div className="text-xs text-slate-600 mt-0.5">tüm zamanlar</div>
                      </div>

                      {/* Warning */}
                      <button
                        onClick={() => { if (spRatings.warning_count > 0) openWarningChatsModal(sp.name); }}
                        disabled={!spRatings.warning_count}
                        className="bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border border-slate-200 dark:border-white/5 text-left transition-colors hover:border-rose-500/20 hover:bg-rose-500/5 disabled:cursor-default animate-stat-pop"
                        style={{ animationDelay: '180ms' }}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Uyarı</span>
                        </div>
                        <div className={`text-2xl font-bold ${spRatings.warning_count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {spRatings.warning_count}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">düşük skorlu</div>
                      </button>

                      {/* Recurring */}
                      <div className={`bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border animate-stat-pop ${(sp.recurring_issues_count ?? 0) > 0 ? 'border-orange-500/20 bg-orange-500/4' : 'border-slate-200 dark:border-white/5'}`}
                        style={{ animationDelay: '240ms' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Zap className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Tekrar Hata</span>
                        </div>
                        <div className={`text-2xl font-bold ${(sp.recurring_issues_count ?? 0) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {sp.recurring_issues_count ?? 0}
                        </div>
                        {(sp.recurring_issues_count ?? 0) > 0 && (
                          <div className="text-xs text-orange-500/70 mt-0.5">
                            -{Math.min(15, (sp.recurring_issues_count ?? 0) * 3)} puan
                          </div>
                        )}
                      </div>

                      {/* Beğeni */}
                      <button
                        onClick={() => { if (spRatings.like_count > 0) openLikedChatsModal(sp.name); }}
                        disabled={!spRatings.like_count}
                        className="bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border border-slate-200 dark:border-white/5 text-left transition-colors hover:border-emerald-500/20 hover:bg-emerald-500/5 disabled:cursor-default animate-stat-pop"
                        style={{ animationDelay: '300ms' }}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <ThumbsUp className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Beğeni</span>
                        </div>
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{spRatings.like_count}</div>
                        <div className="text-xs text-slate-600 mt-0.5">olumlu rating</div>
                      </button>

                      {/* Beğenmeme */}
                      <button
                        onClick={() => { if (spRatings.dislike_count > 0) openDislikedChatsModal(sp.name); }}
                        disabled={!spRatings.dislike_count}
                        className="bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border border-slate-200 dark:border-white/5 text-left transition-colors hover:border-red-500/20 hover:bg-red-500/5 disabled:cursor-default animate-stat-pop"
                        style={{ animationDelay: '360ms' }}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <ThumbsDown className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Beğenmeme</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{spRatings.dislike_count}</div>
                        <div className="text-xs text-slate-600 mt-0.5">olumsuz rating</div>
                      </button>

                      {/* Kaçan Chatler */}
                      <button
                        onClick={() => { if (spRatings.missed_count > 0) openMissedChatsModal(sp.name); }}
                        disabled={!spRatings.missed_count}
                        className={`bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border text-left transition-colors disabled:cursor-default animate-stat-pop ${spRatings.missed_count > 0 ? 'border-orange-500/20 hover:bg-orange-500/5 hover:border-orange-500/30' : 'border-slate-200 dark:border-white/5'}`}
                        style={{ animationDelay: '420ms' }}
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <PhoneOff className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Kaçan Chat</span>
                        </div>
                        <div className={`text-2xl font-bold ${spRatings.missed_count > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {spRatings.missed_count}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {spRatings.missed_count > 0 ? 'detay için tıkla' : 'kaçan yok'}
                        </div>
                      </button>

                      {/* Response times */}
                      <div className="bg-slate-100/50 dark:bg-slate-900/50 rounded-xl p-3.5 border border-slate-200 dark:border-white/5 animate-stat-pop" style={{ animationDelay: '480ms' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs text-slate-500">Ort. Yanıt</span>
                        </div>
                        <div className="text-lg font-bold text-blue-400">
                          {fmtTime(spRatings.avg_first_response_time)}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">çözüm: {fmtTime(spRatings.avg_resolution_time)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily stats */}
                {dailyStats.length > 0 && (
                  <div className="bg-slate-100 dark:bg-slate-800/50 backdrop-blur-xl border border-slate-200 dark:border-white/8 rounded-2xl p-5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      {periodLabel} Günlük Performans
                    </h3>
                    <div className="space-y-2">
                      {dailyStats.map((stat, i) => {
                        const ds = parseScore(stat.average_score);
                        const dc = getScoreColor(ds);
                        return (
                          <div key={stat.id}
                            className="flex items-center gap-3 p-3 bg-slate-900/40 rounded-xl border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:border-white/10 transition-colors animate-float-up"
                            style={{ animationDelay: `${i * 25}ms` }}>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {new Date(stat.date).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short' })}
                              </div>
                              <div className="text-xs text-slate-600">
                                {new Date(stat.date).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit' })}
                              </div>
                            </div>
                            <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(0, ds))}%`, background: dc, boxShadow: `0 0 6px ${dc}66` }} />
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-xs text-slate-500">{stat.total_chats} chat</span>
                              <span className="text-xs font-bold" style={{ color: dc }}>{Math.round(ds)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Strong / Weak topics */}
                {((sp.strong_topics && sp.strong_topics.length > 0) || (sp.weak_topics && sp.weak_topics.length > 0)) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sp.strong_topics && sp.strong_topics.length > 0 && (
                      <div className="bg-slate-100 dark:bg-slate-800/50 backdrop-blur-xl border border-emerald-500/15 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                            <Award className="w-4 h-4 text-emerald-400" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Güçlü Konular</h3>
                        </div>
                        <ul className="space-y-2">
                          {sp.strong_topics.map((topic: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              {topic}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {sp.weak_topics && sp.weak_topics.length > 0 && (
                      <div className="bg-slate-100 dark:bg-slate-800/50 backdrop-blur-xl border border-orange-500/15 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-orange-400" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Gelişmeli Konular</h3>
                        </div>
                        <ul className="space-y-2">
                          {sp.weak_topics.map((topic: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <TrendingDown className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                              {topic}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })() : (
            <div className="bg-slate-100 dark:bg-slate-800/50 backdrop-blur-xl border border-slate-200 dark:border-white/8 rounded-2xl p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4 border border-slate-200 dark:border-white/5">
                <User className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Bir personel seçin</p>
              <p className="text-slate-600 text-sm mt-1">Detaylı performans bilgisi görüntülenecek</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Chat Details Modal ── */}
      {chatModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#0c1220] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden animate-scale-in">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold">{chatModal.title}</h3>
              <button onClick={closeChatModal} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(80vh-80px)]">
              {chatModal.loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Yükleniyor...</p>
                </div>
              ) : chatModal.chats.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">Chat bulunamadı</p>
              ) : (
                <div className="space-y-2.5">
                  {chatModal.chats.map((chat) => (
                    <button key={chat.id} onClick={() => loadChatMessages(chat.chat_id || chat.id, chat.customer_name)}
                      className="w-full text-left bg-white/4 border border-slate-200 dark:border-white/8 rounded-xl p-4 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-semibold text-blue-400">
                            #{chat.chat_id?.slice(0, 12) || chat.id.slice(0, 12)}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300 text-sm">{maskName(chat.customer_name)}</span>
                        </div>
                        {chatModal.type === 'warning' && chat.overall_score && (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            chat.overall_score < 30 ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' :
                            chat.overall_score < 40 ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' :
                            'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                          }`}>{Math.round(chat.overall_score)}/100</span>
                        )}
                      </div>
                      <div className="text-xs text-blue-500/70 mt-1.5">Mesajları görüntüle →</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 flex justify-end border-t border-slate-200 dark:border-white/8">
              <button onClick={closeChatModal}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-medium rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all shadow-lg shadow-blue-500/20">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recurring Issues Modal ── */}
      {recurringModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#0c1220] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden animate-scale-in">
            <div className="bg-gradient-to-r from-orange-600 to-amber-500 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />Tekrarlayan Hatalar
                </h3>
                <p className="text-xs text-orange-100 mt-0.5">{recurringModal.personnelName}</p>
              </div>
              <button onClick={() => setRecurringModal(p => ({ ...p, isOpen: false }))}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-80px)]">
              {recurringModal.loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-10 h-10 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Yükleniyor...</p>
                </div>
              ) : recurringModal.issues.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">Kritik hata bulunamadı</p>
              ) : (
                <div className="space-y-2.5">
                  {recurringModal.issues.map((issue, idx) => (
                    <div key={issue.chat_id} className="border border-slate-200 dark:border-white/8 rounded-xl overflow-hidden">
                      <button className="w-full flex items-center justify-between p-3.5 hover:bg-slate-100 dark:hover:bg-white/4 transition-colors text-left"
                        onClick={() => setRecurringModal(p => ({ ...p, expandedIndex: p.expandedIndex === idx ? null : idx }))}>
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            issue.overall_score < 30 ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25' : 'bg-orange-500/15 text-orange-400 border border-orange-500/25'
                          }`}>{Math.round(issue.overall_score)}/100</span>
                          <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">{maskName(issue.customer_name)}</span>
                          <span className="text-xs text-slate-600">
                            {new Date(issue.analysis_date).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                          </span>
                        </div>
                        {recurringModal.expandedIndex === idx ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                      </button>
                      {recurringModal.expandedIndex === idx && (
                        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-white/8 pt-3">
                          {issue.critical_errors.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-2">Kritik Hatalar</p>
                              <ul className="space-y-1.5">
                                {issue.critical_errors.map((err, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />{err}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {issue.improvement_areas.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Geliştirilmesi Gereken</p>
                              <ul className="space-y-1.5">
                                {issue.improvement_areas.map((area, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />{area}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(issue.coaching_suggestion || issue.recommendations) && (
                            <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-3">
                              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Lightbulb className="w-3.5 h-3.5" />Öneri
                              </p>
                              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{issue.coaching_suggestion || issue.recommendations}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 flex justify-end border-t border-slate-200 dark:border-white/8">
              <button onClick={() => setRecurringModal(p => ({ ...p, isOpen: false }))}
                className="px-5 py-2 bg-gradient-to-r from-orange-600 to-amber-500 text-white text-sm font-medium rounded-xl hover:from-orange-500 hover:to-amber-400 transition-all shadow-lg shadow-orange-500/20">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat Messages Modal ── */}
      {messagesModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-[#0c1220] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden animate-scale-in">
            <div className="bg-gradient-to-r from-blue-700 to-blue-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Chat Konuşması</h3>
                <p className="text-xs text-blue-200 mt-0.5">{maskName(messagesModal.customerName)} · #{messagesModal.chatId.slice(0, 12)}</p>
              </div>
              <button onClick={closeChatMessagesModal} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-140px)] bg-black/20">
              {messagesModal.loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Mesajlar yükleniyor...</p>
                </div>
              ) : messagesModal.messages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 dark:text-slate-400">Bu chat için mesaj bulunamadı</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messagesModal.messages.map((message, index) => {
                    const isAgent = message.author_type === 'agent';
                    return (
                      <div key={message.id || index} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%]`}>
                          <div className={`flex items-center gap-2 mb-1 ${isAgent ? 'flex-row-reverse' : ''}`}>
                            <span className={`text-xs font-medium ${isAgent ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              {message.author_name || (isAgent ? 'Personel' : 'Müşteri')}
                            </span>
                            <span className="text-xs text-slate-600">
                              {new Date(message.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                            isAgent
                              ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-sm'
                              : 'bg-slate-800/80 border border-slate-200 dark:border-white/8 text-slate-900 dark:text-white rounded-tl-sm'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bg-white/4 px-5 py-4 flex items-center justify-between border-t border-slate-200 dark:border-white/8">
              <span className="text-xs text-slate-500">{messagesModal.messages.length} mesaj</span>
              <button onClick={closeChatMessagesModal}
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-medium rounded-xl hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg shadow-blue-500/20">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      <MissedChatsModal
        isOpen={missedChatsModal.isOpen}
        onClose={closeMissedChatsModal}
        agentName={missedChatsModal.agentName}
      />
    </div>
  );
}
