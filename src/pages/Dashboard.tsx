import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare, Users, AlertTriangle, TrendingUp, Clock, CheckCircle, ThumbsUp, ThumbsDown, PhoneOff, CircleUser as UserCircle, LayoutDashboard, RefreshCw, Activity, Calendar, MessageSquareText } from 'lucide-react';
import TrendChart from '../components/TrendChart';
import BarChart from '../components/BarChart';
import DonutChart from '../components/DonutChart';
import HeatMap from '../components/HeatMap';
import Leaderboard from '../components/Leaderboard';
import { Tooltip } from '../components/Tooltip';
import SentimentChatsModal, { ModalSentimentType } from '../components/SentimentChatsModal';
import MissedChatsModal from '../components/MissedChatsModal';
import ComplaintChatsModal from '../components/ComplaintChatsModal';
import { extractComplaintTopics } from '../lib/complaintCategories';
import { getIstanbulDateStartUTC, convertIstanbulDateToUTC, SCORE_TIERS } from '../lib/utils';
import { useBrand } from '../lib/brand';

interface DashboardStats {
  totalChats: number;
  uniqueChats: number;
  totalThreads: number;
  analyzedChats: number;
  totalPersonnel: number;
  pendingAlerts: number;
  averageScore: number;
  averageResponseTime: number;
  totalLikes: number;
  totalDislikes: number;
  totalCommented: number;
  commentedLikes: number;
  commentedDislikes: number;
  missedChats: number;
}

interface PersonnelTrend {
  agent_name: string;
  daily_scores: { date: string; score: number; count: number; sortKey: number }[];
  weekly_change: number;
}

interface ComplaintData {
  date: string;
  negative: number;
  neutral: number;
  totalChats: number;
  analyzedChats: number;
}

interface CategoryComplaint {
  category: string;
  count: number;
  percentage: number;
}

export default function Dashboard() {
  const { activeBrand } = useBrand();
  const activeBrandIdRef = useRef<string | undefined>(undefined);
  activeBrandIdRef.current = activeBrand?.brand_id;

  const [stats, setStats] = useState<DashboardStats>({
    totalChats: 0,
    uniqueChats: 0,
    totalThreads: 0,
    analyzedChats: 0,
    totalPersonnel: 0,
    pendingAlerts: 0,
    averageScore: 0,
    averageResponseTime: 0,
    totalLikes: 0,
    totalDislikes: 0,
    totalCommented: 0,
    commentedLikes: 0,
    commentedDislikes: 0,
    missedChats: 0,
  });
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [personnelTrends, setPersonnelTrends] = useState<PersonnelTrend[]>([]);
  const [complaintData, setComplaintData] = useState<ComplaintData[]>([]);
  const [categoryComplaints, setCategoryComplaints] = useState<CategoryComplaint[]>([]);
  const [hourlyDistribution, setHourlyDistribution] = useState<{ hour: number; count: number }[]>([]);
  const [topPerformers, setTopPerformers] = useState<any[]>([]);
  const [bottomPerformers, setBottomPerformers] = useState<any[]>([]);
  const [sentimentDistribution, setSentimentDistribution] = useState<{ label: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sentimentModal, setSentimentModal] = useState<{ type: ModalSentimentType; date?: string } | null>(null);
  const [trendModal, setTrendModal] = useState<PersonnelTrend | null>(null);
  const [missedModalOpen, setMissedModalOpen] = useState(false);
  const [complaintChatsModal, setComplaintChatsModal] = useState<{ category: string; chatIds: string[] } | null>(null);
  const [categoryChatsMap, setCategoryChatsMap] = useState<{ [category: string]: string[] }>({});

  const [globalDateRange, setGlobalDateRange] = useState<'7' | '30' | '90' | 'all' | 'custom'>('30');
  const [globalDateFrom, setGlobalDateFrom] = useState('');
  const [globalDateTo, setGlobalDateTo] = useState('');

  const globalDateRangeRef = useRef<'7' | '30' | '90' | 'all' | 'custom'>('30');
  const globalDateFromRef = useRef('');
  const globalDateToRef = useRef('');
  globalDateRangeRef.current = globalDateRange;
  globalDateFromRef.current = globalDateFrom;
  globalDateToRef.current = globalDateTo;

  const cacheRef = useRef<Map<string, { data: any; ts: number }>>(new Map());

  const getCached = <T,>(key: string, ttlMs = 25000): T | null => {
    const entry = cacheRef.current.get(key);
    if (entry && Date.now() - entry.ts < ttlMs) return entry.data as T;
    return null;
  };

  const setCache = (key: string, data: any) => {
    cacheRef.current.set(key, { data, ts: Date.now() });
  };

  const getDateBounds = () => {
    const range = globalDateRangeRef.current;
    const from = globalDateFromRef.current;
    const to = globalDateToRef.current;

    if (range === 'all') {
      return {
        startUTC: '2000-01-01T00:00:00.000Z',
        endUTC: undefined as string | undefined,
        daysBack: 99999,
        cacheSuffix: 'all',
        isCustom: false,
        displayLabel: 'Tüm Zamanlar',
      };
    }

    if (range === 'custom' && from && to) {
      const daysBack = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return {
        startUTC: convertIstanbulDateToUTC(from, false),
        endUTC: convertIstanbulDateToUTC(to, true) as string | undefined,
        daysBack,
        cacheSuffix: `custom_${from}_${to}`,
        isCustom: true,
        displayLabel: `${from} — ${to}`,
      };
    }

    const days = parseInt(range);
    return {
      startUTC: getIstanbulDateStartUTC(days),
      endUTC: undefined as string | undefined,
      daysBack: days,
      cacheSuffix: range,
      isCustom: false,
      displayLabel: `Son ${days} Gün`,
    };
  };

  const loadDashboardDataRef = useRef<() => Promise<void>>();

  useEffect(() => {
    loadDashboardDataRef.current?.();
    const statsInterval = setInterval(() => {
      // Cache'i her auto-refresh oncesi temizle, fresh veri al
      cacheRef.current.clear();
      loadDashboardDataRef.current?.();
    }, 30000);
    return () => clearInterval(statsInterval);
  }, []);

  useEffect(() => {
    cacheRef.current.clear();
    loadDashboardDataRef.current?.();
  }, [activeBrand?.brand_id]);

  useEffect(() => {
    if (globalDateRange === 'custom' && (!globalDateFrom || !globalDateTo)) return;
    cacheRef.current.clear();
    loadDashboardDataRef.current?.();
  }, [globalDateRange, globalDateFrom, globalDateTo]);

  const loadDashboardData = async () => {
    try {
      setLoadError(false);
      const { startUTC, endUTC } = getDateBounds();

      let chatsQuery = supabase.from('chats').select('*', { count: 'exact', head: true }).gte('created_at', startUTC);
      if (endUTC) chatsQuery = chatsQuery.lte('created_at', endUTC);
      if (activeBrandIdRef.current) chatsQuery = chatsQuery.eq('brand_id', activeBrandIdRef.current);

      let missedQuery = supabase.from('chats').select('*', { count: 'exact', head: true }).eq('is_missed', true).gte('created_at', startUTC);
      if (endUTC) missedQuery = missedQuery.lte('created_at', endUTC);
      if (activeBrandIdRef.current) missedQuery = missedQuery.eq('brand_id', activeBrandIdRef.current);

      let pendingAlertsQuery = supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('sent_to_telegram', false).gte('created_at', startUTC);
      if (endUTC) pendingAlertsQuery = pendingAlertsQuery.lte('created_at', endUTC);
      if (activeBrandIdRef.current) pendingAlertsQuery = pendingAlertsQuery.eq('brand_id', activeBrandIdRef.current);

      let personnelQuery = supabase.from('personnel').select('*', { count: 'exact', head: true });
      if (activeBrandIdRef.current) personnelQuery = personnelQuery.eq('brand_id', activeBrandIdRef.current);

      let recentAlertsQuery = supabase.from('alerts').select('*, chats(agent_name, customer_name)').order('created_at', { ascending: false }).limit(5);
      if (activeBrandIdRef.current) recentAlertsQuery = recentAlertsQuery.eq('brand_id', activeBrandIdRef.current);

      const [
        { count: totalChats, error: chatsErr },
        { count: totalPersonnel },
        { count: pendingAlerts },
        { count: missedChats },
        { data: alerts },
      ] = await Promise.all([
        chatsQuery,
        personnelQuery,
        pendingAlertsQuery,
        missedQuery,
        recentAlertsQuery,
      ]);

      if (chatsErr) {
        setLoadError(true);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      setStats(prev => ({
        ...prev,
        totalChats: totalChats || 0,
        totalThreads: totalChats || 0,
        analyzedChats: 0,
        totalPersonnel: totalPersonnel || 0,
        pendingAlerts: pendingAlerts || 0,
        missedChats: missedChats || 0,
      }));
      setRecentAlerts(alerts || []);
      setLoading(false);
      setLastUpdated(new Date());

      // Unique chats and analyzed chats are loaded via RPC in loadHeavyStats
      // No need for separate client-side batch processing

      // Analyzed chats count is loaded via RPC in loadHeavyStats - no batch loop needed

      const loadHeavyStats = async () => {
        const { cacheSuffix } = getDateBounds();
        const cacheKey = `heavy_stats_${cacheSuffix}`;
        const cached = getCached<{ avgScore: number; avgResponseTime: number; totalLikes: number; totalDislikes: number; totalCommented: number; commentedLikes: number; commentedDislikes: number; analyzedChats: number; uniqueChats: number }>(cacheKey, 25000);

        if (cached) {
          setStats(prev => ({
            ...prev,
            averageScore: cached.avgScore,
            averageResponseTime: cached.avgResponseTime,
            totalLikes: cached.totalLikes,
            totalDislikes: cached.totalDislikes,
            totalCommented: cached.totalCommented,
            commentedLikes: cached.commentedLikes,
            commentedDislikes: cached.commentedDislikes,
            analyzedChats: cached.analyzedChats,
            uniqueChats: cached.uniqueChats,
          }));
          return;
        }

        const { cacheSuffix: cs, isCustom, daysBack } = getDateBounds();

        // Always use RPC for fast server-side calculation
        const rpcParams: Record<string, unknown> = {};

        if (isCustom) {
          // Custom date range: send explicit dates to RPC
          rpcParams.p_start_date = globalDateFromRef.current;
          rpcParams.p_end_date = globalDateToRef.current;
        } else if (cs === 'all') {
          rpcParams.p_days_back = 99999;
        } else {
          rpcParams.p_days_back = daysBack;
        }

        if (activeBrandIdRef.current) rpcParams.p_brand_id = activeBrandIdRef.current;

        const { data: rpcResult } = await supabase.rpc('get_dashboard_heavy_stats', rpcParams);
        if (rpcResult) {
          const result = {
            avgScore: rpcResult.avg_score ?? 0,
            avgResponseTime: rpcResult.avg_response_time ?? 0,
            totalLikes: rpcResult.total_likes ?? 0,
            totalDislikes: rpcResult.total_dislikes ?? 0,
            totalCommented: rpcResult.total_commented ?? 0,
            commentedLikes: rpcResult.commented_likes ?? 0,
            commentedDislikes: rpcResult.commented_dislikes ?? 0,
            analyzedChats: rpcResult.analyzed_chats ?? 0,
            uniqueChats: rpcResult.unique_chats ?? 0,
          };
          setCache(cacheKey, result);
          setStats(prev => ({
            ...prev,
            averageScore: result.avgScore,
            averageResponseTime: result.avgResponseTime,
            totalLikes: result.totalLikes,
            totalDislikes: result.totalDislikes,
            totalCommented: result.totalCommented,
            commentedLikes: result.commentedLikes,
            commentedDislikes: result.commentedDislikes,
            analyzedChats: result.analyzedChats,
            uniqueChats: result.uniqueChats,
          }));
        }
      };

      await Promise.all([
        loadHeavyStats(),
        loadPersonnelTrends(),
        loadComplaintData(),
        loadCategoryComplaints(),
        loadHourlyDistribution(),
        loadPerformersRanking(),
        loadSentimentDistribution(),
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setLastUpdated(new Date());
    }
  };

  loadDashboardDataRef.current = loadDashboardData;

  const handleRefresh = async () => {
    cacheRef.current.clear();
    setIsRefreshing(true);
    await loadDashboardData();
  };

  const loadPersonnelTrends = async () => {
    try {
      const { daysBack, startUTC, cacheSuffix } = getDateBounds();
      const cacheKey = `personnel_trends_${cacheSuffix}`;
      const cached = getCached<PersonnelTrend[]>(cacheKey, 25000);
      if (cached) {
        setPersonnelTrends(cached);
        return;
      }

      const personnelTrendsParams: Record<string, unknown> = { p_days_back: daysBack };
      if (activeBrandIdRef.current) personnelTrendsParams.p_brand_id = activeBrandIdRef.current;
      const { data: rpcRows, error: rpcError } = await supabase.rpc('get_personnel_daily_trends', personnelTrendsParams);

      if (!rpcError && rpcRows && rpcRows.length > 0) {
        const agentMap: { [agent: string]: { date: string; score: number; count: number; sortKey: number }[] } = {};

        rpcRows.forEach((r: { agent_name: string; day_date: string; day_sort_ts: number; avg_score: number; chat_count: number }) => {
          if (!r.agent_name || r.agent_name === 'Unknown') return;
          if (!agentMap[r.agent_name]) agentMap[r.agent_name] = [];
          agentMap[r.agent_name].push({
            date: r.day_date,
            score: parseFloat((r.avg_score ?? 0).toFixed(2)),
            count: r.chat_count,
            sortKey: r.day_sort_ts * 1000,
          });
        });

        const trends: PersonnelTrend[] = Object.entries(agentMap).map(([agentName, scores]) => {
          const firstScore = scores[0]?.score ?? 0;
          const lastScore = scores[scores.length - 1]?.score ?? 0;
          const weeklyChange = scores.length >= 2 && firstScore > 0 ? ((lastScore - firstScore) / firstScore) * 100 : 0;
          return { agent_name: agentName, daily_scores: scores, weekly_change: weeklyChange };
        });

        setCache(cacheKey, trends);
        setPersonnelTrends(trends);
        return;
      }

      const batchSize = 1000;
      let allAgentChats: any[] = [];
      let from = 0;
      const { endUTC } = getDateBounds();

      while (true) {
        let q = supabase.from('chats').select('id, agent_name, created_at').not('agent_name', 'is', null).gte('created_at', startUTC).range(from, from + batchSize - 1);
        if (endUTC) q = q.lte('created_at', endUTC);
        if (activeBrandIdRef.current) q = q.eq('brand_id', activeBrandIdRef.current);
        const { data: batch } = await q;
        if (!batch || batch.length === 0) break;
        allAgentChats = [...allAgentChats, ...batch];
        if (batch.length < batchSize) break;
        from += batchSize;
      }

      if (allAgentChats.length === 0) return;

      const chatIdToDate = new Map<string, string>();
      const chatIdToAgent = new Map<string, string>();
      allAgentChats.forEach(c => {
        chatIdToDate.set(c.id, c.created_at);
        chatIdToAgent.set(c.id, c.agent_name);
      });

      const allChatIds = allAgentChats.map(c => c.id);
      let allAnalysisData: any[] = [];

      for (let i = 0; i < allChatIds.length; i += batchSize) {
        const batchIds = allChatIds.slice(i, i + batchSize);
        const { data: batch } = await supabase.from('chat_analysis').select('overall_score, chat_id').in('chat_id', batchIds).gt('overall_score', 0);
        if (batch) allAnalysisData = [...allAnalysisData, ...batch];
      }

      if (allAnalysisData.length === 0) return;

      const agentDailyMap: { [agent: string]: { [dayKey: string]: { scores: number[]; totalChats: number; label: string; ts: number } } } = {};

      // First count ALL chats per agent per day (including unanalyzed)
      allAgentChats.forEach(c => {
        const agent = c.agent_name;
        const d = new Date(c.created_at);
        const istanbul = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const year = istanbul.getFullYear();
        const month = istanbul.getMonth();
        const day = istanbul.getDate();
        const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const label = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}`;
        const ts = new Date(year, month, day).getTime();

        if (!agentDailyMap[agent]) agentDailyMap[agent] = {};
        if (!agentDailyMap[agent][dayKey]) agentDailyMap[agent][dayKey] = { scores: [], totalChats: 0, label, ts };
        agentDailyMap[agent][dayKey].totalChats++;
      });

      // Then add analysis scores
      allAnalysisData.forEach(item => {
        const agent = chatIdToAgent.get(item.chat_id);
        const createdAt = chatIdToDate.get(item.chat_id);
        if (!agent || !createdAt) return;

        const d = new Date(createdAt);
        const istanbul = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const year = istanbul.getFullYear();
        const month = istanbul.getMonth();
        const day = istanbul.getDate();
        const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (agentDailyMap[agent]?.[dayKey]) {
          agentDailyMap[agent][dayKey].scores.push(item.overall_score || 0);
        }
      });

      const trends: PersonnelTrend[] = [];

      for (const [agentName, dailyMap] of Object.entries(agentDailyMap)) {
        const dailyEntries = Object.values(dailyMap).filter(e => e.scores.length > 0);
        const scores = dailyEntries
          .sort((a, b) => a.ts - b.ts)
          .map(entry => ({
            date: entry.label,
            score: Math.round(entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length),
            count: entry.totalChats,
            sortKey: entry.ts,
          }));

        if (scores.length >= 1) {
          const firstScore = scores[0].score;
          const lastScore = scores[scores.length - 1].score;
          const weeklyChange = scores.length >= 2 && firstScore > 0 ? ((lastScore - firstScore) / firstScore) * 100 : 0;
          trends.push({ agent_name: agentName, daily_scores: scores, weekly_change: weeklyChange });
        }
      }

      setCache(cacheKey, trends);
      setPersonnelTrends(trends);
    } catch (error) {
      console.error('Error loading personnel trends:', error);
    }
  };

  const loadComplaintData = async () => {
    try {
      const { daysBack } = getDateBounds();

      const rpcParams: Record<string, unknown> = {};
      const cs = globalDateRangeRef.current;
      const isCustom = cs === 'custom';
      if (isCustom) {
        rpcParams.p_start_date = globalDateFromRef.current;
        rpcParams.p_end_date = globalDateToRef.current;
      } else if (cs === 'all') {
        rpcParams.p_days_back = 99999;
      } else {
        rpcParams.p_days_back = daysBack;
      }
      if (activeBrandIdRef.current) rpcParams.p_brand_id = activeBrandIdRef.current;

      const { data } = await supabase.rpc('get_daily_complaint_stats', rpcParams);

      if (!data || data.length === 0) {
        setComplaintData([]);
        return;
      }

      const complaintArray = data.map((row: any) => {
        const d = new Date(row.date + 'T00:00:00');
        const dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
        return {
          date: dateStr,
          negative: row.negative || 0,
          neutral: row.neutral || 0,
          totalChats: row.total || 0,
          analyzedChats: row.total || 0,
        };
      });

      setComplaintData(complaintArray);
    } catch (error) {
      console.error('Error loading complaint data:', error);
    }
  };

  const loadCategoryComplaints = async () => {
    try {
      const rpcParams: Record<string, unknown> = {};
      const cs = globalDateRangeRef.current;
      const isCustom = cs === 'custom';
      if (isCustom) {
        rpcParams.p_start_date = globalDateFromRef.current;
        rpcParams.p_end_date = globalDateToRef.current;
      } else if (cs === 'all') {
        rpcParams.p_days_back = 99999;
      } else {
        rpcParams.p_days_back = getDateBounds().daysBack;
      }
      if (activeBrandIdRef.current) rpcParams.p_brand_id = activeBrandIdRef.current;

      const { data: allAnalysis } = await supabase.rpc('get_negative_analyses', rpcParams);

      if (!allAnalysis || allAnalysis.length === 0) {
        setCategoryComplaints([]);
        return;
      }

      const categories: { [key: string]: number } = {};
      const catChatIds: { [key: string]: string[] } = {};
      let totalComplaints = 0;

      allAnalysis.forEach(item => {
        if (item.ai_summary) {
          const topics = extractComplaintTopics(item.ai_summary);
          topics.forEach(topic => {
            categories[topic] = (categories[topic] || 0) + 1;
            totalComplaints++;
            if (!catChatIds[topic]) catChatIds[topic] = [];
            if (item.chat_id && !catChatIds[topic].includes(item.chat_id)) catChatIds[topic].push(item.chat_id);
          });
        }
      });

      const categoryArray = Object.entries(categories)
        .map(([category, count]) => ({ category, count, percentage: totalComplaints > 0 ? (count / totalComplaints) * 100 : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setCategoryComplaints(categoryArray);
      setCategoryChatsMap(catChatIds);
    } catch (error) {
      console.error('Error loading category complaints:', error);
    }
  };

  const loadHourlyDistribution = async () => {
    try {
      const { daysBack, cacheSuffix } = getDateBounds();
      const cacheKey = `hourly_distribution_${cacheSuffix}`;
      const cached = getCached<{ hour: number; count: number }[]>(cacheKey, 25000);
      if (cached) {
        setHourlyDistribution(cached);
        return;
      }

      const hourlyParams: Record<string, unknown> = { p_days_back: daysBack };
      if (activeBrandIdRef.current) hourlyParams.p_brand_id = activeBrandIdRef.current;
      const { data: rows } = await supabase.rpc('get_hourly_chat_distribution', hourlyParams);

      if (rows) {
        const hourCounts = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }));
        rows.forEach((r: { hour_of_day: number; chat_count: number }) => {
          if (r.hour_of_day >= 0 && r.hour_of_day < 24) hourCounts[r.hour_of_day].count = r.chat_count;
        });
        setCache(cacheKey, hourCounts);
        setHourlyDistribution(hourCounts);
      }
    } catch (error) {
      console.error('Error loading hourly distribution:', error);
    }
  };

  const loadPerformersRanking = async () => {
    try {
      const { startUTC, endUTC, daysBack } = getDateBounds();
      // For trend comparison, use same-length previous period (max 90 days back)
      const prevDays = Math.min(daysBack, 90);
      const prevStartUTC = getIstanbulDateStartUTC(prevDays * 2);
      const batchSize = 1000;

      // Fetch current and previous period chats in parallel
      const fetchAllBatches = async (baseQuery: () => any) => {
        let all: any[] = [];
        let from = 0;
        while (true) {
          const { data: batch } = await baseQuery().range(from, from + batchSize - 1);
          if (!batch || batch.length === 0) break;
          all = [...all, ...batch];
          if (batch.length < batchSize) break;
          from += batchSize;
        }
        return all;
      };

      const [currentChats, prevChats] = await Promise.all([
        fetchAllBatches(() => {
          let q = supabase.from('chats').select('id, agent_name, rating_score, first_response_time').not('agent_name', 'is', null).gte('created_at', startUTC);
          if (endUTC) q = q.lte('created_at', endUTC);
          if (activeBrandIdRef.current) q = q.eq('brand_id', activeBrandIdRef.current);
          return q;
        }),
        fetchAllBatches(() => {
          let q = supabase.from('chats').select('id, agent_name').not('agent_name', 'is', null).gte('created_at', prevStartUTC).lt('created_at', startUTC);
          if (activeBrandIdRef.current) q = q.eq('brand_id', activeBrandIdRef.current);
          return q;
        }),
      ]);

      if (currentChats.length === 0) return;

      const allCurrentIds = currentChats.map(c => c.id);
      const allPrevIds = prevChats.map(c => c.id);
      const allChatIds = [...new Set([...allCurrentIds, ...allPrevIds])];

      let allAnalysis: any[] = [];
      const analysisBatches = [];
      for (let i = 0; i < allChatIds.length; i += batchSize) {
        const batchIds = allChatIds.slice(i, i + batchSize);
        analysisBatches.push(
          supabase.from('chat_analysis').select('chat_id, overall_score, language_compliance, quality_metrics, performance_metrics').in('chat_id', batchIds).not('overall_score', 'is', null).gt('overall_score', 0)
        );
      }
      const analysisResults = await Promise.all(analysisBatches);
      for (const res of analysisResults) {
        if (res.data) allAnalysis = [...allAnalysis, ...res.data];
      }

      const analysisMap = new Map<string, any>(allAnalysis.map(a => [a.chat_id, a]));

      const agentCurrentChats = new Map<string, any[]>();
      const agentPrevChats = new Map<string, any[]>();

      currentChats.forEach(c => {
        if (!agentCurrentChats.has(c.agent_name)) agentCurrentChats.set(c.agent_name, []);
        agentCurrentChats.get(c.agent_name)!.push(c);
      });
      prevChats.forEach(c => {
        if (!agentPrevChats.has(c.agent_name)) agentPrevChats.set(c.agent_name, []);
        agentPrevChats.get(c.agent_name)!.push(c);
      });

      const uniqueAgents = [...agentCurrentChats.keys()];

      const rankings = uniqueAgents.map(agentName => {
        const agCurrent = agentCurrentChats.get(agentName) || [];
        const agPrev = agentPrevChats.get(agentName) || [];
        const isNewAgent = agPrev.length === 0;

        const currentAnalysis = agCurrent.map(c => analysisMap.get(c.id)).filter(Boolean);
        if (currentAnalysis.length === 0) {
          return { name: agentName, score: 0, chatCount: agCurrent.length, avgSatisfaction: 0, trendDiff: 0, prevScore: 0, langScore: 0, qualityScore: 0, perfScore: 0, weakestCategory: null, criticalCount: 0, avgResponseTime: 0, isNewAgent };
        }

        let prevScore = 0;
        if (agPrev.length > 0) {
          const prevAnalysis = agPrev.map(c => analysisMap.get(c.id)).filter(Boolean);
          if (prevAnalysis.length > 0) {
            prevScore = prevAnalysis.reduce((sum: number, a: any) => sum + (a.overall_score || 0), 0) / prevAnalysis.length;
          }
        }

        const avgScore = currentAnalysis.reduce((sum: number, a: any) => sum + (a.overall_score || 0), 0) / currentAnalysis.length;
        const trendDiff = prevScore > 0 ? Math.round(avgScore - prevScore) : 0;

        const langScores: number[] = [];
        const qualityScores: number[] = [];
        const perfScores: number[] = [];

        currentAnalysis.forEach((a: any) => {
          const lc = a.language_compliance || {};
          const qm = a.quality_metrics || {};
          const pm = a.performance_metrics || {};
          const langVals = [lc.professional_language, lc.polite_tone].filter(v => v != null && v > 0);
          const qualVals = [qm.answer_relevance].filter(v => v != null && v > 0);
          const perfVals = [pm.first_response_quality, pm.solution_focused, pm.communication_effectiveness].filter(v => v != null && v > 0);
          if (langVals.length > 0) langScores.push(langVals.reduce((s: number, v: number) => s + v, 0) / langVals.length);
          if (qualVals.length > 0) qualityScores.push(qualVals[0]);
          if (perfVals.length > 0) perfScores.push(perfVals.reduce((s: number, v: number) => s + v, 0) / perfVals.length);
        });

        const langScore = langScores.length > 0 ? Math.round(langScores.reduce((s, v) => s + v, 0) / langScores.length) : 0;
        const qualityScore = qualityScores.length > 0 ? Math.round(qualityScores.reduce((s, v) => s + v, 0) / qualityScores.length) : 0;
        const perfScore = perfScores.length > 0 ? Math.round(perfScores.reduce((s, v) => s + v, 0) / perfScores.length) : 0;

        const categories = [
          { name: 'Dil', score: langScore },
          { name: 'Kalite', score: qualityScore },
          { name: 'Performans', score: perfScore },
        ].filter(c => c.score > 0);

        const weakestCategory = categories.length > 0 ? categories.sort((a, b) => a.score - b.score)[0] : null;
        const criticalCount = currentAnalysis.filter((a: any) => (a.overall_score || 0) < 60).length;

        const ratedChats = agCurrent.filter(c => c.rating_score !== null && c.rating_score > 0);
        const avgSatisfaction = ratedChats.length > 0 ? ratedChats.reduce((sum: number, c: any) => sum + (c.rating_score || 0), 0) / ratedChats.length : 0;

        const responseChats = agCurrent.filter(c => c.first_response_time && c.first_response_time > 0);
        const avgResponseTime = responseChats.length > 0 ? Math.round(responseChats.reduce((sum: number, c: any) => sum + (c.first_response_time || 0), 0) / responseChats.length) : 0;

        return {
          name: agentName,
          score: Math.round(avgScore),
          chatCount: agCurrent.length,
          avgSatisfaction: parseFloat(avgSatisfaction.toFixed(1)),
          details: `${agCurrent.length} chat, ⭐${avgSatisfaction.toFixed(1)}`,
          trendDiff,
          prevScore: Math.round(prevScore),
          langScore,
          qualityScore,
          perfScore,
          weakestCategory,
          criticalCount,
          avgResponseTime,
          isNewAgent,
        };
      });

      // Min chats: scale with period but cap at 50 for long ranges
      const effectiveDays = Math.min(daysBack, 90);
      const minChats = Math.max(3, Math.min(50, Math.round(effectiveDays * 50 / 30)));
      const qualified = rankings.filter(r => r.score > 0 && r.chatCount >= minChats);
      const sortedByScore = [...qualified].sort((a, b) => b.score - a.score);
      setTopPerformers(sortedByScore.slice(0, 5));

      const existingAgents = qualified.filter(r => !r.isNewAgent);
      const newAgents = qualified.filter(r => r.isNewAgent);

      const decliners = existingAgents.filter(r => (r.trendDiff ?? 0) < 0).sort((a, b) => (a.trendDiff ?? 0) - (b.trendDiff ?? 0));
      const stableByScore = existingAgents.filter(r => (r.trendDiff ?? 0) >= 0).sort((a, b) => a.score - b.score);
      const lowScoringNew = newAgents.filter(r => r.score < 70).sort((a, b) => a.score - b.score);

      setBottomPerformers([...decliners, ...stableByScore, ...lowScoringNew].slice(0, 5));
    } catch (error) {
      console.error('Error loading performers ranking:', error);
    }
  };

  const loadSentimentDistribution = async () => {
    try {
      const { cacheSuffix, daysBack } = getDateBounds();
      const cacheKey = `sentiment_distribution_${cacheSuffix}`;
      const cached = getCached<{ label: string; value: number; color: string }[]>(cacheKey, 25000);
      if (cached) {
        setSentimentDistribution(cached);
        return;
      }

      const rpcParams: Record<string, unknown> = {};
      const cs = globalDateRangeRef.current;
      const isCustom = cs === 'custom';
      if (isCustom) {
        rpcParams.p_start_date = globalDateFromRef.current;
        rpcParams.p_end_date = globalDateToRef.current;
      } else if (cs === 'all') {
        rpcParams.p_days_back = 99999;
      } else {
        rpcParams.p_days_back = daysBack;
      }
      if (activeBrandIdRef.current) rpcParams.p_brand_id = activeBrandIdRef.current;

      const { data } = await supabase.rpc('get_sentiment_distribution', rpcParams);

      const tierMap: Record<string, number> = {};
      if (data) {
        for (const row of data) tierMap[row.tier] = row.count;
      }

      const distribution = SCORE_TIERS.map(t => ({
        label: t.label,
        value: tierMap[t.key] || 0,
        color: t.color,
      }));

      setCache(cacheKey, distribution);
      setSentimentDistribution(distribution);
    } catch (error) {
      console.error('Error loading sentiment distribution:', error);
    }
  };

  const statCards = useMemo(() => [
    {
      title: 'Unique Chat',
      value: stats.uniqueChats,
      icon: Users,
      color: 'bg-blue-500',
      change: 'Müşteri Oturumları',
      tooltip: 'Farklı müşterilerle yapılan chat sayısı',
    },
    {
      title: 'Total Thread',
      value: stats.totalThreads,
      icon: MessageSquare,
      color: 'bg-cyan-500',
      change: `${stats.totalThreads - stats.uniqueChats} Tekrar`,
      tooltip: 'Tekrar eden müşteriler dahil toplam chat sayısı',
    },
    {
      title: 'Analiz Edilen',
      value: stats.analyzedChats,
      icon: CheckCircle,
      color: 'bg-green-500',
      change: `${stats.totalChats > 0 ? Math.round((stats.analyzedChats / stats.totalChats) * 100) : 0}%`,
      tooltip: 'AI tarafından analiz edilen chat sayısı',
    },
    {
      title: 'Personel Sayısı',
      value: stats.totalPersonnel,
      icon: UserCircle,
      color: 'bg-purple-500',
      change: 'Aktif',
      tooltip: 'Sistemdeki toplam aktif personel sayısı',
    },
    {
      title: 'Bekleyen Uyarı',
      value: stats.pendingAlerts,
      icon: AlertTriangle,
      color: 'bg-red-500',
      change: stats.pendingAlerts > 0 ? 'Dikkat!' : 'Normal',
      tooltip: 'İncelenmesi gereken düşük skorlu chat sayısı',
    },
    {
      title: 'Ortalama Skor',
      value: `${stats.averageScore}/100`,
      icon: TrendingUp,
      color: 'bg-emerald-500',
      change: stats.averageScore >= 70 ? 'Olumlu' : stats.averageScore >= 60 ? 'Notr' : 'Olumsuz',
      tooltip: 'AI tarafından hesaplanan ortalama kalite skoru',
    },
    {
      title: 'Ort. Yanıt Süresi',
      value: `${stats.averageResponseTime}s`,
      icon: Clock,
      color: 'bg-orange-500',
      change: stats.averageResponseTime < 60 ? 'Hızlı' : 'Yavaş',
      tooltip: 'Personelin müşterilere ortalama yanıt süresi',
    },
    {
      title: 'Beğeni',
      value: stats.totalLikes,
      icon: ThumbsUp,
      color: 'bg-green-600',
      change: `${stats.totalChats > 0 ? Math.round((stats.totalLikes / stats.totalChats) * 100) : 0}%`,
      tooltip: 'Müşteri tarafından beğenilen chat sayısı (yorumsuz)',
    },
    {
      title: 'Beğenilmeyen',
      value: stats.totalDislikes,
      icon: ThumbsDown,
      color: 'bg-red-600',
      change: `${stats.totalChats > 0 ? Math.round((stats.totalDislikes / stats.totalChats) * 100) : 0}%`,
      tooltip: 'Müşteri tarafından beğenilmeyen chat sayısı (yorumsuz)',
    },
    {
      title: 'Yorumlu Degerlendirme',
      value: stats.totalCommented,
      icon: MessageSquareText,
      color: 'bg-purple-600',
      change: `${stats.commentedLikes} begeni, ${stats.commentedDislikes} begenmeme`,
      tooltip: 'Müşterinin yorum bırakarak değerlendirdiği chatler',
    },
    {
      title: 'Kaçan Chat',
      value: stats.missedChats,
      icon: PhoneOff,
      color: 'bg-orange-600',
      change: stats.missedChats > 0 ? 'Dikkat!' : 'Normal',
      tooltip: 'Personel tarafından cevaplanmayan chat sayısı',
      onClick: () => setMissedModalOpen(true),
    },
  ], [stats, setMissedModalOpen]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
      case 'high': return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30';
      default: return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
    }
  };

  const periodLabel = globalDateRange === 'custom' && globalDateFrom && globalDateTo
    ? `${globalDateFrom} — ${globalDateTo}`
    : globalDateRange === '7' ? 'Son 7 Gün'
    : globalDateRange === '90' ? 'Son 90 Gün'
    : globalDateRange === 'all' ? 'Tüm Zamanlar'
    : 'Son 30 Gün';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin shadow-xl shadow-cyan-500/30" />
          <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-b-emerald-400 rounded-full animate-spin shadow-xl shadow-emerald-500/30" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Veritabanı bağlantısı kurulamadı</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">Supabase geçici olarak erişilemiyor durumda. Lütfen birkaç saniye bekleyip tekrar deneyin.</p>
          </div>
          <button
            onClick={() => { setLoading(true); loadDashboardData(); }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl text-sm font-medium transition-colors mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                  Genel Bakis
                </h1>
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">Canli</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">LiveChat kalite kontrolu ve performans analizi</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-600 hidden sm:block">
                Son guncelleme: {lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white rounded-xl transition-all text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Yenileniyor...' : 'Yenile'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Dönem:</span>
          </div>
          {(['7', '30', '90', 'all'] as const).map(d => (
            <button
              key={d}
              onClick={() => { setGlobalDateRange(d); setGlobalDateFrom(''); setGlobalDateTo(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                globalDateRange === d
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-600 dark:text-slate-300'
              }`}
            >
              {d === '7' ? 'Son 7 Gün' : d === '30' ? 'Son 30 Gün' : d === '90' ? 'Son 90 Gün' : 'Tüm Zamanlar'}
            </button>
          ))}
          <button
            onClick={() => setGlobalDateRange('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              globalDateRange === 'custom'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-600 dark:text-slate-300'
            }`}
          >
            Özel Tarih
          </button>
          {globalDateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={globalDateFrom}
                onChange={e => setGlobalDateFrom(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-1.5 text-xs dark:[color-scheme:dark] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
              <span className="text-slate-600 text-xs">—</span>
              <input
                type="date"
                value={globalDateTo}
                onChange={e => setGlobalDateTo(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-1.5 text-xs dark:[color-scheme:dark] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>
          )}
          {globalDateRange !== 'custom' && (
            <span className="text-xs text-slate-600 ml-1 hidden sm:block">— tüm veriler bu döneme göre filtrelendi</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isClickable = !!card.onClick;
          return (
            <Tooltip key={card.title} content={card.tooltip} position="bottom">
              <div
                className={`glass-effect rounded-xl shadow-lg p-4 hover:shadow-2xl hover:shadow-cyan-500/20 transition-all hover:scale-105 group ${isClickable ? 'cursor-pointer' : 'cursor-help'}`}
                onClick={card.onClick}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{card.title}</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-2">{card.value}</p>
                    <p className={`text-xs mt-1 ${isClickable ? 'text-orange-600 dark:text-orange-400' : 'text-cyan-600 dark:text-cyan-400'}`}>{card.change}</p>
                  </div>
                  <div className="relative flex-shrink-0 ml-2">
                    <div className={`${card.color} p-2 rounded-lg shadow-lg group-hover:scale-110 transition-transform`}>
                      <Icon className="w-4 h-4 text-slate-900 dark:text-white" />
                    </div>
                    {isClickable && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-400 ring-2 ring-slate-900" />
                    )}
                  </div>
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-effect rounded-xl shadow-lg p-6">
          <DonutChart
            data={sentimentDistribution}
            title={`Genel Sentiment Dağılımı — ${periodLabel}`}
            centerText={sentimentDistribution.reduce((sum, item) => sum + item.value, 0).toString()}
          />
        </div>

        <div className="glass-effect rounded-xl shadow-lg p-6">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">Kategoriye Göre</h3>
          <div className="flex flex-col gap-2">
            {SCORE_TIERS.map((tier, i) => {
              const count = sentimentDistribution[i]?.value || 0;
              return (
                <button
                  key={tier.key}
                  onClick={() => setSentimentModal({ type: tier.key })}
                  className="flex items-center justify-between p-2.5 rounded-lg border hover:scale-[1.02] transition-all cursor-pointer text-left w-full"
                  style={{ borderColor: `${tier.color}44`, backgroundColor: `${tier.color}11` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tier.color }} />
                    <div>
                      <div className="text-xs font-medium" style={{ color: tier.color }}>{tier.label}</div>
                      <div className="text-xs text-slate-500">{tier.min}–{tier.max} puan</div>
                    </div>
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">{count}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-effect rounded-xl shadow-lg p-6">
          <Leaderboard
            data={topPerformers}
            title="🏆 Ayın En İyi Performansları"
            type="top"
            teamTopScore={topPerformers[0]?.score ?? 0}
          />
        </div>

        <div className="glass-effect rounded-xl shadow-lg p-6">
          <Leaderboard
            data={bottomPerformers}
            title="⚠️ Gelişim Gereken Personel"
            type="bottom"
            teamTopScore={topPerformers[0]?.score ?? 0}
          />
        </div>
      </div>

      {personnelTrends.length > 0 && (
        <div className="glass-effect rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">📈 Personel Performans Trendleri ({periodLabel})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {personnelTrends.map((trend, index) => {
              const lastScore = trend.daily_scores[trend.daily_scores.length - 1]?.score ?? 0;
              const isPositive = trend.weekly_change >= 0;
              const color = isPositive ? '#10b981' : '#ef4444';
              const sparkPoints = (() => {
                if (trend.daily_scores.length === 0) return '0,50 100,50';
                if (trend.daily_scores.length === 1) {
                  const y = 50;
                  return `0,${y} 100,${y}`;
                }
                const scores = trend.daily_scores.map(d => d.score);
                const max = Math.max(...scores);
                const min = Math.min(...scores);
                const range = max - min || 1;
                const padding = range * 0.1; // 10% padding
                const adjustedMax = max + padding;
                const adjustedMin = min - padding;
                const adjustedRange = adjustedMax - adjustedMin;
                
                return trend.daily_scores.map((s, i) => {
                  const x = (i / (trend.daily_scores.length - 1)) * 100;
                  // Invert Y: high score = low Y value (top of chart)
                  const normalizedScore = (s.score - adjustedMin) / adjustedRange;
                  const y = (1 - normalizedScore) * 100;
                  return `${x.toFixed(2)},${y.toFixed(2)}`;
                }).join(' ');
              })();
              return (
                <button
                  key={index}
                  onClick={() => setTrendModal(trend)}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 hover:border-white/20 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-slate-900 dark:text-white" style={{ background: `${color}33`, border: `2px solid ${color}66` }}>
                    {trend.agent_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-slate-900 dark:text-white text-sm truncate">{trend.agent_name}</span>
                      <span className={`text-xs font-bold flex-shrink-0 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{trend.weekly_change.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-8">
                        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id={`spark-${index}`} x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.25 }} />
                              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.02 }} />
                            </linearGradient>
                          </defs>
                          <polyline fill={`url(#spark-${index})`} stroke="none" points={`0,100 ${sparkPoints} 100,100`} />
                          <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={sparkPoints} />
                        </svg>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">Skor: <span className="text-slate-900 dark:text-white font-bold">{lastScore}</span></span>
                    </div>
                  </div>
                  <TrendingUp className="w-4 h-4 text-slate-500 group-hover:text-slate-600 dark:text-slate-300 transition-colors flex-shrink-0" />
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-4">Grafik görmek için isme tıklayın</p>
        </div>
      )}

      {trendModal && (() => {
        const dataPoints = trendModal.daily_scores.length;
        // Dynamic sizing based on data points
        const modalSize = dataPoints <= 7 ? 'max-w-4xl'
          : dataPoints <= 14 ? 'max-w-5xl'
          : dataPoints <= 21 ? 'max-w-6xl'
          : 'max-w-7xl';
        const chartHeight = dataPoints <= 7 ? 300
          : dataPoints <= 14 ? 350
          : dataPoints <= 21 ? 400
          : 450;
        const scrollable = dataPoints > 21;
        
        return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setTrendModal(null)}>
          <div className={`bg-white dark:bg-[#0f1623] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl w-full ${modalSize} p-6 ${scrollable ? 'max-h-[90vh] overflow-y-auto' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-slate-900 dark:text-white"
                  style={{ background: `${trendModal.weekly_change >= 0 ? '#10b981' : '#ef4444'}33`, border: `2px solid ${trendModal.weekly_change >= 0 ? '#10b981' : '#ef4444'}66` }}
                >
                  {trendModal.agent_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{trendModal.agent_name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{periodLabel} Performans Trendi</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${trendModal.weekly_change >= 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                  {trendModal.weekly_change >= 0 ? '+' : ''}{trendModal.weekly_change.toFixed(1)}%
                </div>
                <button onClick={() => setTrendModal(null)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/10 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Başlangıç Skoru', value: trendModal.daily_scores[0]?.score ?? 0 },
                { label: 'Son Skor', value: trendModal.daily_scores[trendModal.daily_scores.length - 1]?.score ?? 0 },
                { label: 'Veri Noktası', value: trendModal.daily_scores.length },
              ].map((stat) => (
                <div key={stat.label} className="bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl p-3 text-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{stat.label}</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{typeof stat.value === 'number' && !Number.isInteger(stat.value) ? stat.value.toFixed(2) : stat.value}</div>
                </div>
              ))}
            </div>

            <TrendChart
              data={trendModal.daily_scores.map(s => ({ label: s.date, value: s.score, count: s.count }))}
              title=""
              color={trendModal.weekly_change >= 0 ? '#10b981' : '#ef4444'}
              height={chartHeight}
            />
          </div>
        </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-effect rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">📊 Günlük Şikayet Trendi</h3>
          <BarChart
            data={complaintData.map(d => ({
              label: d.date,
              value: d.negative + d.neutral,
              color: '#ef4444',
            }))}
            title=""
            height={250}
          />
        </div>

        <div className="glass-effect rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">🔥 En Çok Şikayet Edilen Konular</h3>
          <BarChart
            data={categoryComplaints.map(c => ({
              label: c.category,
              value: c.count,
              color: '#ef4444',
            }))}
            title=""
            height={250}
            onBarClick={(label) => {
              const ids = categoryChatsMap[label] || [];
              setComplaintChatsModal({ category: label, chatIds: ids });
            }}
          />
        </div>
      </div>

      {complaintData.length > 0 && (
        <div className="glass-effect rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">📉 Günlük Şikayet Detayları</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-slate-700/50 border-b-2 border-cyan-400/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-200 uppercase">Tarih</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-200 uppercase">Toplam Chat</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-200 uppercase">Analiz Edilen</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-200 uppercase">Negatif</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-200 uppercase">Nötr</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-200 uppercase">Negatif %</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-200 uppercase">Nötr %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-600/50">
                {complaintData.map((data, index) => {
                  const negativePercent = data.analyzedChats > 0 ? (data.negative / data.analyzedChats) * 100 : 0;
                  const neutralPercent = data.analyzedChats > 0 ? (data.neutral / data.analyzedChats) * 100 : 0;
                  const dateParts = data.date.split(/[./\-]/);
                  const day = dateParts[0] ?? '01';
                  const month = dateParts[1] ?? '01';
                  const year = new Date().getFullYear();
                  const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                  return (
                    <tr key={index} className="hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{data.date}</td>
                      <td className="px-4 py-3 text-sm text-slate-900 dark:text-white font-bold">{data.totalChats}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200 font-medium">{data.analyzedChats}</td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          disabled={data.negative === 0}
                          onClick={() => data.negative > 0 && setSentimentModal({ type: 'negative', date: isoDate })}
                          className={`px-2 py-1 bg-rose-500/30 text-rose-100 rounded-full font-bold border-2 border-rose-400/50 transition-all ${data.negative > 0 ? 'hover:bg-rose-500/50 hover:scale-110 cursor-pointer' : 'opacity-50 cursor-default'}`}
                        >
                          {data.negative}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          disabled={data.neutral === 0}
                          onClick={() => data.neutral > 0 && setSentimentModal({ type: 'neutral', date: isoDate })}
                          className={`px-2 py-1 bg-amber-500/30 text-amber-100 rounded-full font-bold border-2 border-amber-400/50 transition-all ${data.neutral > 0 ? 'hover:bg-amber-500/50 hover:scale-110 cursor-pointer' : 'opacity-50 cursor-default'}`}
                        >
                          {data.neutral}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 bg-slate-700/70 rounded-full overflow-hidden border border-slate-600/50">
                            <div className="h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-full" style={{ width: `${negativePercent}%` }} />
                          </div>
                          <span className="text-xs font-bold text-rose-300 w-12 text-right">{negativePercent.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 bg-slate-700/70 rounded-full overflow-hidden border border-slate-600/50">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${neutralPercent}%` }} />
                          </div>
                          <span className="text-xs font-bold text-amber-300 w-12 text-right">{neutralPercent.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass-effect rounded-xl shadow-lg p-6">
        <HeatMap
          data={hourlyDistribution}
          title={`🕐 Saatlik Chat Yoğunluğu Analizi (${periodLabel})`}
          description={`${periodLabel} boyunca her saat diliminde toplam kaç chat alındığını gösterir. En yoğun saatleri tespit ederek personel planlaması yapabilirsiniz.`}
        />
      </div>

      <div className="glass-effect rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">⚠️ Son Uyarılar</h2>
        </div>

        {recentAlerts.length === 0 ? (
          <div className="text-center py-8 text-slate-600 dark:text-slate-300">
            Henüz uyarı bulunmuyor
          </div>
        ) : (
          <div className="space-y-4">
            {recentAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-semibold text-sm">{alert.severity.toUpperCase()}</span>
                      <span className="text-xs sm:text-sm opacity-75">
                        {new Date(alert.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm whitespace-pre-line">{alert.message}</p>
                  </div>
                  {alert.sent_to_telegram ? (
                    <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded flex-shrink-0 self-start">
                      Gonderildi
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-white/10 px-2 py-1 rounded flex-shrink-0 self-start">
                      Bekliyor
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SentimentChatsModal
        sentiment={sentimentModal?.type ?? null}
        date={sentimentModal?.date}
        onClose={() => setSentimentModal(null)}
      />

      <MissedChatsModal
        isOpen={missedModalOpen}
        onClose={() => setMissedModalOpen(false)}
      />

      <ComplaintChatsModal
        category={complaintChatsModal?.category ?? null}
        chatIds={complaintChatsModal?.chatIds ?? []}
        onClose={() => setComplaintChatsModal(null)}
      />
    </div>
  );
}
