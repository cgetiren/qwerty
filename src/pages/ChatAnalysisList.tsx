import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { maskName, SCORE_TIERS, ScoreTierKey } from '../lib/utils';
import { useBrand } from '../lib/brand';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/auditLogger';
import { Search, Filter, Eye, AlertCircle, MessageCircle, Calendar, X, RefreshCw, PlayCircle, Lightbulb, Sparkles, User, Headphones, RotateCcw, AlertTriangle, Flag, CheckCircle2, Clock, SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Chat, ChatAnalysis, ChatMessage } from '../types';

interface ChatWithAnalysis extends Chat {
  analysis?: ChatAnalysis;
  messages?: ChatMessage[];
}

interface SummaryStats {
  total: number;
  tierCounts: Record<ScoreTierKey, number>;
  avgScore: number;
}

const PAGE_SIZE = 50;

export default function ChatAnalysisList() {
  const { activeBrand } = useBrand();
  const { session, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const deepLinkHandled = useRef(false);
  const [chats, setChats] = useState<ChatWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'analyzed' | 'pending'>('all');
  const [filterSentiment, setFilterSentiment] = useState<'all' | ScoreTierKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedChat, setSelectedChat] = useState<ChatWithAnalysis | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    total: 0,
    tierCounts: { mukemmel: 0, iyi: 0, orta: 0, olumsuz: 0, dikkat: 0, kritik: 0 },
    avgScore: 0,
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<string>('');
  const [matchingChatIds, setMatchingChatIds] = useState<string[]>([]);
  const [loadingCoaching, setLoadingCoaching] = useState(false);
  const [coachingError, setCoachingError] = useState<string>('');
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false);
  const [flagModal, setFlagModal] = useState<{ open: boolean; mode: 'flag' | 'resolve' }>({ open: false, mode: 'flag' });
  const [flagReason, setFlagReason] = useState('');
  const [flagResolutionNote, setFlagResolutionNote] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  const getIstanbulDateBoundaries = (dateStr: string): { start: Date; end: Date } => {
    const start = new Date(dateStr + 'T00:00:00+03:00');
    const end = new Date(dateStr + 'T23:59:59.999+03:00');
    return { start, end };
  };

  const getIstanbulDateString = (date: Date): string => {
    return date
      .toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
      .split('.')
      .reverse()
      .join('-');
  };

  const setQuickDateFilter = (filter: 'today' | 'yesterday' | 'last7days') => {
    const now = new Date();
    const istanbulNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    if (filter === 'today') {
      const d = getIstanbulDateString(istanbulNow);
      setDateFrom(d);
      setDateTo(d);
    } else if (filter === 'yesterday') {
      const y = new Date(istanbulNow);
      y.setDate(y.getDate() - 1);
      const d = getIstanbulDateString(y);
      setDateFrom(d);
      setDateTo(d);
    } else {
      const l = new Date(istanbulNow);
      l.setDate(l.getDate() - 7);
      setDateFrom(getIstanbulDateString(l));
      setDateTo(getIstanbulDateString(istanbulNow));
    }
  };

  const parseScore = (score: number | string | undefined): number => {
    if (!score && score !== 0) return 0;
    if (typeof score === 'string') { const p = parseInt(score); return isNaN(p) ? 0 : p; }
    return score;
  };

  const formatResponseTime = (seconds: number | null | undefined): string => {
    if (!seconds && seconds !== 0) return '-';
    if (seconds < 60) return `${seconds} Sn`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} Dk ${secs} Sn` : `${mins} Dk`;
  };

  const getScoreStyle = (score: number | string) => {
    const n = parseScore(score);
    if (n >= 90) return 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/30';
    if (n >= 70) return 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/30';
    if (n >= 60) return 'text-blue-400 bg-blue-400/10 border border-blue-400/30';
    if (n >= 40) return 'text-amber-400 bg-amber-400/10 border border-amber-400/30';
    if (n >= 30) return 'text-orange-400 bg-orange-400/10 border border-orange-400/30';
    return 'text-rose-400 bg-rose-400/10 border border-rose-400/30';
  };

  const getSentimentIcon = (sentiment?: string) => {
    if (!sentiment) return '😐';
    switch (sentiment.toLowerCase()) {
      case 'positive':
      case 'olumlu':
        return '😊';
      case 'negative':
      case 'olumsuz':
        return '😟';
      default:
        return '😐';
    }
  };

  const loadSummaryStats = useCallback(async () => {
    try {
      let totalQuery = supabase.from('chats').select('*', { count: 'exact', head: true });
      if (activeBrand?.brand_id) totalQuery = totalQuery.eq('brand_id', activeBrand.brand_id);
      if (dateFrom) {
        const { start } = getIstanbulDateBoundaries(dateFrom);
        totalQuery = totalQuery.gte('created_at', start.toISOString());
      }
      if (dateTo) {
        const { end } = getIstanbulDateBoundaries(dateTo);
        totalQuery = totalQuery.lte('created_at', end.toISOString());
      }

      let filteredChatIds: string[] | null = null;
      if (dateFrom || dateTo) {
        let chatIdsQuery = supabase.from('chats').select('id');
        if (activeBrand?.brand_id) chatIdsQuery = chatIdsQuery.eq('brand_id', activeBrand.brand_id);
        if (dateFrom) {
          const { start } = getIstanbulDateBoundaries(dateFrom);
          chatIdsQuery = chatIdsQuery.gte('created_at', start.toISOString());
        }
        if (dateTo) {
          const { end } = getIstanbulDateBoundaries(dateTo);
          chatIdsQuery = chatIdsQuery.lte('created_at', end.toISOString());
        }
        const { data: chatRows } = await chatIdsQuery;
        filteredChatIds = chatRows?.map((c) => c.id) ?? [];

        if (filteredChatIds.length === 0) {
          const totalResult = await totalQuery;
          const tierCounts: Record<ScoreTierKey, number> = { mukemmel: 0, iyi: 0, orta: 0, olumsuz: 0, dikkat: 0, kritik: 0 };
          setSummaryStats({ total: totalResult.count || 0, tierCounts, avgScore: 0 });
          return;
        }
      }

      let scoresQuery = supabase.from('chat_analysis').select('overall_score');
      if (activeBrand?.brand_id) scoresQuery = scoresQuery.eq('brand_id', activeBrand.brand_id);
      if (filteredChatIds) scoresQuery = scoresQuery.in('chat_id', filteredChatIds);

      const tierQueries = SCORE_TIERS.map((tier) => {
        let q = supabase
          .from('chat_analysis')
          .select('*', { count: 'exact', head: true })
          .gte('overall_score', tier.min)
          .lte('overall_score', tier.max);
        if (activeBrand?.brand_id) q = q.eq('brand_id', activeBrand.brand_id);
        if (filteredChatIds) q = q.in('chat_id', filteredChatIds);
        return q;
      });

      const [totalResult, scoresResult, ...tierResults] = await Promise.all([
        totalQuery,
        scoresQuery,
        ...tierQueries,
      ]);

      const scores = scoresResult.data || [];
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + parseScore(s.overall_score), 0) / scores.length)
          : 0;

      const tierCounts: Record<ScoreTierKey, number> = { mukemmel: 0, iyi: 0, orta: 0, olumsuz: 0, dikkat: 0, kritik: 0 };
      SCORE_TIERS.forEach((tier, i) => {
        tierCounts[tier.key as ScoreTierKey] = tierResults[i].count || 0;
      });

      setSummaryStats({
        total: totalResult.count || 0,
        tierCounts,
        avgScore,
      });
    } catch {
      // silent fail
    }
  }, [activeBrand?.brand_id, dateFrom, dateTo]);

  const loadChats = useCallback(async () => {
    setListLoading(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (filterSentiment !== 'all') {
        const tier = SCORE_TIERS.find((t) => t.key === filterSentiment);
        if (!tier) {
          setChats([]);
          setTotalFilteredCount(0);
          return;
        }

        let countQuery = supabase
          .from('chat_analysis')
          .select('*', { count: 'exact', head: true })
          .gte('overall_score', tier.min)
          .lte('overall_score', tier.max);
        if (activeBrand?.brand_id) countQuery = countQuery.eq('brand_id', activeBrand.brand_id);
        const { count } = await countQuery;
        setTotalFilteredCount(count || 0);

        let pageAnalysesQuery = supabase
          .from('chat_analysis')
          .select('chat_id, overall_score, sentiment, ai_summary, is_flagged, flag_reason, analysis_date, requires_attention')
          .gte('overall_score', tier.min)
          .lte('overall_score', tier.max)
          .order('analysis_date', { ascending: false })
          .range(from, to);
        if (activeBrand?.brand_id) pageAnalysesQuery = pageAnalysesQuery.eq('brand_id', activeBrand.brand_id);
        const { data: pageAnalyses } = await pageAnalysesQuery;

        if (!pageAnalyses?.length) {
          setChats([]);
          return;
        }

        const chatIds = pageAnalyses.map((a) => a.chat_id);
        let pageChatsQuery = supabase
          .from('chats')
          .select('id, chat_id, agent_name, customer_name, created_at, analyzed, first_response_time, message_count, status')
          .in('id', chatIds);
        if (activeBrand?.brand_id) pageChatsQuery = pageChatsQuery.eq('brand_id', activeBrand.brand_id);
        const { data: pageChats } = await pageChatsQuery;

        const analysisMap: Record<string, any> = {};
        pageAnalyses.forEach((a) => { analysisMap[a.chat_id] = a; });
        const chatsMap: Record<string, any> = {};
        pageChats?.forEach((c) => { chatsMap[c.id] = c; });

        setChats(chatIds.filter((id) => chatsMap[id]).map((id) => ({ ...chatsMap[id], analysis: analysisMap[id] })));
        return;
      }

      const buildFilters = (q: any) => {
        if (activeBrand?.brand_id) q = q.eq('brand_id', activeBrand.brand_id);
        if (filterStatus === 'analyzed') q = q.eq('analyzed', true);
        else if (filterStatus === 'pending') q = q.eq('analyzed', false);

        if (dateFrom) {
          const { start } = getIstanbulDateBoundaries(dateFrom);
          q = q.gte('created_at', start.toISOString());
        }
        if (dateTo) {
          const { end } = getIstanbulDateBoundaries(dateTo);
          q = q.lte('created_at', end.toISOString());
        }

        if (searchTerm) {
          const orParts = [
            `agent_name.ilike.%${searchTerm}%`,
            `customer_name.ilike.%${searchTerm}%`,
            `id.ilike.%${searchTerm}%`,
          ];
          if (matchingChatIds.length > 0) {
            orParts.push(`id.in.(${matchingChatIds.slice(0, 200).join(',')})`);
          }
          q = q.or(orParts.join(','));
        }

        return q;
      };

      const countQuery = buildFilters(supabase.from('chats').select('*', { count: 'exact', head: true }));
      const { count: totalCount } = await countQuery;
      setTotalFilteredCount(totalCount || 0);

      const dataQuery = buildFilters(
        supabase
          .from('chats')
          .select('id, chat_id, agent_name, customer_name, created_at, analyzed, first_response_time, message_count, status')
          .order('created_at', { ascending: false })
          .range(from, to)
      );
      const { data: pageChats } = await dataQuery;

      if (!pageChats?.length) {
        setChats([]);
        return;
      }

      const chatIds = pageChats.map((c: any) => c.id);
      let analysesQuery = supabase
        .from('chat_analysis')
        .select('chat_id, overall_score, sentiment, ai_summary, is_flagged, flag_reason, analysis_date, requires_attention')
        .in('chat_id', chatIds);
      if (activeBrand?.brand_id) analysesQuery = analysesQuery.eq('brand_id', activeBrand.brand_id);
      const { data: analyses } = await analysesQuery;

      const analysisMap: Record<string, any> = {};
      analyses?.forEach((a) => { analysisMap[a.chat_id] = a; });

      setChats(pageChats.map((chat: any) => ({ ...chat, analysis: analysisMap[chat.id] })));
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setListLoading(false);
      setLoading(false);
    }
  }, [currentPage, filterStatus, filterSentiment, dateFrom, dateTo, searchTerm, matchingChatIds, activeBrand?.brand_id]);

  const searchInMessages = async (term: string) => {
    try {
      let query = supabase
        .from('chat_messages')
        .select('chat_id')
        .ilike('text', `%${term}%`)
        .limit(200);
      if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
      const { data: messages } = await query;
      if (messages) {
        setMatchingChatIds([...new Set(messages.map((m) => m.chat_id))]);
      }
    } catch {
      setMatchingChatIds([]);
    }
  };

  useEffect(() => {
    loadSummaryStats();
  }, [loadSummaryStats]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Deep-link: ?chat=CHATID opens that chat's analysis directly
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const chatId = params.get('chat');
    if (!chatId || deepLinkHandled.current) return;
    deepLinkHandled.current = true;

    (async () => {
      try {
        const { data: chat } = await supabase
          .from('chats')
          .select('*')
          .eq('id', chatId)
          .maybeSingle();

        if (!chat) return;

        const { data: analysis } = await supabase
          .from('chat_analysis')
          .select('*')
          .eq('chat_id', chatId)
          .maybeSingle();

        const { data: messages } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true });

        setSelectedChat({ ...chat, analysis: analysis || undefined, messages: messages || [] });
        // Clean the URL without triggering navigation
        navigate('/chats', { replace: true });
      } catch (err) {
        console.error('Deep-link chat load error:', err);
      }
    })();
  }, [location.search, navigate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterSentiment, dateFrom, dateTo]);

  useEffect(() => {
    setCurrentPage(1);
    if (searchTerm) {
      searchInMessages(searchTerm);
    } else {
      setMatchingChatIds([]);
    }
  }, [searchTerm]);

  const loadChatMessages = async (chat: ChatWithAnalysis) => {
    setCoachingError('');
    setSelectedChat({ ...chat });
    try {
      let messagesQuery = supabase.from('chat_messages').select('*').eq('chat_id', chat.id).order('created_at', { ascending: true });
      if (activeBrand?.brand_id) messagesQuery = messagesQuery.eq('brand_id', activeBrand.brand_id);

      let fullAnalysisQuery: Promise<{ data: any; error: any }>;
      if (chat.analyzed) {
        let q = supabase.from('chat_analysis').select('*').eq('chat_id', chat.id);
        if (activeBrand?.brand_id) q = q.eq('brand_id', activeBrand.brand_id);
        fullAnalysisQuery = q.maybeSingle() as any;
      } else {
        fullAnalysisQuery = Promise.resolve({ data: null, error: null });
      }

      const [messagesResult, fullAnalysisResult] = await Promise.all([
        messagesQuery,
        fullAnalysisQuery,
      ]);
      setSelectedChat((prev) =>
        prev
          ? {
              ...prev,
              messages: messagesResult.data || [],
              analysis: (fullAnalysisResult.data as ChatAnalysis) ?? prev.analysis,
            }
          : null
      );
    } catch {
      // keep what we have
    }
  };

  const parseDialogue = (suggestion: string): Array<{ speaker: 'agent' | 'customer'; text: string }> => {
    let textToParse = '';
    const strictMatch = suggestion.match(/DIYALOG_BASLANGIC([\s\S]*?)DIYALOG_BITIS/);
    if (strictMatch) {
      textToParse = strictMatch[1];
    } else {
      const sectionMatch = suggestion.match(
        /(?:\*\*)?(?:Örnek\s+Diyalog|Örnek\s+Cevap\s+Diyalog)(?:\*\*)?\s*:?\s*([\s\S]*?)(?=(?:\d+\.\s*)?(?:\*\*)?(?:Ana\s+Sorun|Yapılması|Yazım)|$)/i
      );
      if (sectionMatch) {
        textToParse = sectionMatch[1];
      } else {
        textToParse = suggestion;
      }
    }
    return textToParse
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('Üye:') || line.startsWith('Temsilci:'))
      .map((line) => {
        if (line.startsWith('Temsilci:')) return { speaker: 'agent' as const, text: line.replace('Temsilci:', '').trim() };
        return { speaker: 'customer' as const, text: line.replace('Üye:', '').trim() };
      });
  };

  const fetchCoaching = async () => {
    if (!selectedChat || !selectedChat.analysis) return;
    setLoadingCoaching(true);
    setCoachingError('');
    try {
      const messages = (selectedChat.messages || []).map((m) => ({
        author: { name: (m as any).author_name || (m.author_type === 'agent' ? 'Temsilci' : 'Üye') },
        text: m.text,
      }));
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || supabaseKey;
      const res = await fetch(`${supabaseUrl}/functions/v1/get-coaching`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          chatId: selectedChat.id,
          chatAnalysisId: selectedChat.analysis.id,
          messages,
          customerName: selectedChat.customer_name || '',
          brand_id: activeBrand?.brand_id,
          analysis: {
            sentiment: selectedChat.analysis.sentiment,
            score: selectedChat.analysis.overall_score,
            issues: [
              ...(selectedChat.analysis.issues_detected?.critical_errors || []),
              ...(selectedChat.analysis.issues_detected?.improvement_areas || []),
            ],
          },
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.suggestion) {
          setSelectedChat((prev) =>
            prev
              ? { ...prev, analysis: prev.analysis ? { ...prev.analysis, coaching_suggestion: result.suggestion } : prev.analysis }
              : prev
          );
          setChats((prev) =>
            prev.map((c) =>
              c.id === selectedChat.id && c.analysis ? { ...c, analysis: { ...c.analysis, coaching_suggestion: result.suggestion } } : c
            )
          );
        } else {
          setCoachingError(result.error || 'Koçluk önerisi oluşturulamadı.');
        }
      } else {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setCoachingError(errData.error || errData.details || `Hata: HTTP ${res.status}`);
      }
    } catch (err) {
      setCoachingError(err instanceof Error ? err.message : 'Bağlantı hatası oluştu.');
    } finally {
      setLoadingCoaching(false);
    }
  };

  const submitFlag = async () => {
    if (!selectedChat?.analysis) return;
    setFlagging(true);
    try {
      const { error } = await supabase
        .from('chat_analysis')
        .update({ is_flagged: true, flag_reason: flagReason, flag_date: new Date().toISOString(), flag_resolved: false })
        .eq('id', selectedChat.analysis.id);
      if (error) throw error;

      // objection_logs'a kayit at
      const { data: objectionLog, error: objectionError } = await supabase.from('objection_logs').insert({
        chat_id: selectedChat.id,
        brand_id: activeBrand?.brand_id || null,
        agent_name: selectedChat.agent_name || null,
        customer_name: selectedChat.customer_name || null,
        chat_date: selectedChat.created_at || null,
        original_score: selectedChat.analysis.overall_score || null,
        objection_reason: flagReason,
        objected_by: session?.user?.id || null,
        objected_by_name: profile?.full_name || session?.user?.email || null,
        original_summary: selectedChat.analysis.ai_summary || null,
        original_sentiment: selectedChat.analysis.sentiment || null,
        reanalysis_status: 'pending',
      }).select().single();
      
      if (objectionError) throw objectionError;

      setSelectedChat((prev) =>
        prev
          ? { ...prev, analysis: prev.analysis ? { ...prev.analysis, is_flagged: true, flag_reason: flagReason, flag_date: new Date().toISOString(), flag_resolved: false } : prev.analysis }
          : null
      );
      setChats((prev) =>
        prev.map((c) =>
          c.id === selectedChat.id && c.analysis ? { ...c, analysis: { ...c.analysis, is_flagged: true, flag_reason: flagReason } } : c
        )
      );
      setFlagModal({ open: false, mode: 'flag' });
      setFlagReason('');
      logAudit({
        actionType: 'flag',
        entityType: 'chat_analysis',
        entityId: selectedChat.analysis.id,
        entityLabel: selectedChat.agent_name || selectedChat.id,
        description: `Chat analizi itiraz olarak isaretlendi: ${flagReason}`,
        newValues: { is_flagged: true, flag_reason: flagReason },
        brandId: activeBrand?.brand_id,
      });
    } catch (err) {
      console.error('Flag error:', err);
    } finally {
      setFlagging(false);
    }
  };

  const resolveFlag = async () => {
    if (!selectedChat?.analysis) return;
    setFlagging(true);
    try {
      const { error } = await supabase
        .from('chat_analysis')
        .update({ is_flagged: false, flag_resolved: true, flag_resolution_note: flagResolutionNote })
        .eq('id', selectedChat.analysis.id);
      if (error) throw error;

      // objection_logs'da cozum bilgisini guncelle
      await supabase.from('objection_logs')
        .update({
          resolved: true,
          resolved_by: session?.user?.id || null,
          resolved_by_name: profile?.full_name || session?.user?.email || null,
          resolved_at: new Date().toISOString(),
          resolution_note: flagResolutionNote,
        })
        .eq('chat_id', selectedChat.id)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(1);

      setSelectedChat((prev) =>
        prev
          ? { ...prev, analysis: prev.analysis ? { ...prev.analysis, is_flagged: false, flag_resolved: true, flag_resolution_note: flagResolutionNote } : prev.analysis }
          : null
      );
      setChats((prev) =>
        prev.map((c) =>
          c.id === selectedChat.id && c.analysis ? { ...c, analysis: { ...c.analysis, is_flagged: false } } : c
        )
      );
      setFlagModal({ open: false, mode: 'resolve' });
      setFlagResolutionNote('');
      logAudit({
        actionType: 'resolve',
        entityType: 'chat_analysis',
        entityId: selectedChat.analysis.id,
        entityLabel: selectedChat.agent_name || selectedChat.id,
        description: `Chat analizi itirazi cozumlendi: ${flagResolutionNote}`,
        newValues: { flag_resolved: true, flag_resolution_note: flagResolutionNote },
        brandId: activeBrand?.brand_id,
      });
    } catch (err) {
      console.error('Resolve flag error:', err);
    } finally {
      setFlagging(false);
    }
  };

  const callResetFunction = async (chatId?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-analyses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(chatId ? { chatId } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Bilinmeyen hata' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
  };

  const reanalyzeSingleChat = async () => {
    if (!selectedChat) return;
    setReanalyzing(true);
    const chatId = selectedChat.id;
    const objectionReason = selectedChat.analysis?.is_flagged ? selectedChat.analysis.flag_reason : null;
    try {
      await callResetFunction(chatId);
      logAudit({
        actionType: 'reanalyze',
        entityType: 'chat_analysis',
        entityId: chatId,
        entityLabel: selectedChat.agent_name || chatId,
        description: `Chat yeniden analiz edildi`,
        metadata: { had_objection: !!objectionReason },
        brandId: activeBrand?.brand_id,
      });
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, analyzed: false, analysis: undefined } : c)));
      setSelectedChat((prev) => (prev ? { ...prev, analyzed: false, analysis: undefined } : null));
      setAnalyzeStatus('Chat sıfırlandı, analiz başlatılıyor...');

      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, flagReason: objectionReason }),
      });

      const maxWait = 60000;
      const pollInterval = 3000;
      const startTime = Date.now();

      const poll = async () => {
        const { data: analysis } = await supabase.from('chat_analysis').select('*').eq('chat_id', chatId).maybeSingle();
        if (analysis) {
          setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, analyzed: true, analysis } : c)));
          setSelectedChat((prev) => (prev ? { ...prev, analyzed: true, analysis } : null));
          setAnalyzeStatus('Analiz tamamlandı!');
          setReanalyzing(false);
          setTimeout(() => setAnalyzeStatus(''), 3000);
          loadSummaryStats();

          // objection_logs'daki yeni puani guncelle
          if (objectionReason) {
            const { data: updatedObjection } = await supabase.from('objection_logs')
              .update({
                new_score: analysis.overall_score,
                new_summary: analysis.ai_summary,
                new_sentiment: analysis.sentiment,
                reanalysis_status: 'completed',
                reanalyzed_at: new Date().toISOString(),
              })
              .eq('chat_id', chatId)
              .eq('reanalysis_status', 'pending')
              .order('created_at', { ascending: false })
              .limit(1)
              .select()
              .single();
            
            // RAG: Create embedding for future learning (non-blocking)
            if (updatedObjection && updatedObjection.new_score !== updatedObjection.original_score) {
              console.log('RAG: Creating embedding for objection learning...');
              try {
                const { data: { session } } = await supabase.auth.getSession();
                await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-objection-embedding`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    objectionId: updatedObjection.id,
                    objectionReason: objectionReason,
                    chatSummary: analysis.ai_summary,
                    originalScore: updatedObjection.original_score,
                    correctedScore: analysis.overall_score,
                    correctionApplied: analysis.recommendations,
                    tags: [analysis.sentiment, analysis.chat_topic].filter(Boolean),
                  }),
                });
                console.log('RAG: Embedding created successfully for future AI learning');
              } catch (embErr) {
                console.error('RAG embedding failed (non-fatal):', embErr);
                // Don't block user experience if embedding fails
              }
            }
          }
          return;
        }
        if (Date.now() - startTime < maxWait) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          setAnalyzeStatus(`Analiz ediliyor... (${elapsed}s)`);
          setTimeout(poll, pollInterval);
        } else {
          setAnalyzeStatus('Analiz tamamlanamadı. Lütfen birkaç dakika bekleyip tekrar deneyin.');
          setReanalyzing(false);
          loadChats();
        }
      };
      setTimeout(poll, pollInterval);
    } catch (err) {
      console.error('Reanalyze error:', err);
      setAnalyzeStatus('Hata oluştu: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
      setReanalyzing(false);
    }
  };

  const reanalyzeAll = async () => {
    setShowReanalyzeConfirm(false);
    setReanalyzing(true);
    setAnalyzeStatus('Chatler hazırlanıyor...');
    try {
      await callResetFunction();
      let countQuery = supabase.from('chats').select('*', { count: 'exact', head: true }).eq('analyzed', false);
      if (activeBrand?.brand_id) countQuery = countQuery.eq('brand_id', activeBrand.brand_id);
      const { count } = await countQuery;
      const total = count || 0;
      if (total === 0) {
        setAnalyzeStatus('Analiz edilecek chat bulunamadı.');
        setReanalyzing(false);
        return;
      }
      setAnalyzeStatus(`0/${total} chat analiz edildi...`);
      const analyzeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-chat`;
      let analyzed = 0;
      while (analyzed < total) {
        try {
          const res = await fetch(analyzeUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
          });
          const result = await res.json();
          const batch = result.analyzed || 0;
          if (batch === 0) break;
          analyzed += batch;
          setAnalyzeStatus(`${Math.min(analyzed, total)}/${total} chat analiz edildi...`);
        } catch {
          break;
        }
        if (analyzed < total) await new Promise((r) => setTimeout(r, 2000));
      }
      setAnalyzeStatus(`Tamamlandı! ${analyzed} chat analiz edildi.`);
      loadChats();
      loadSummaryStats();
    } catch (err) {
      console.error('Reanalyze all error:', err);
      setAnalyzeStatus('Hata oluştu, tekrar deneyin.');
    } finally {
      setReanalyzing(false);
      setTimeout(() => setAnalyzeStatus(''), 5000);
    }
  };

  const startAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeStatus('Analiz başlatılıyor...');
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const result = await response.json();
        setAnalyzeStatus(`Tamamlandı! ${result.analyzed || 0} chat analiz edildi.`);
      } else {
        setAnalyzeStatus('Analiz başlatıldı. Tamamlanması birkaç dakika sürebilir.');
      }
    } catch {
      setAnalyzeStatus('Analiz başlatıldı. Tamamlanması birkaç dakika sürebilir.');
    } finally {
      setAnalyzing(false);
      setTimeout(() => {
        loadChats();
        loadSummaryStats();
        setAnalyzeStatus('');
      }, 5000);
    }
  };

  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Chat Analizleri</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tüm chat kayıtları ve kalite analizleri</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
        <button
          onClick={() => setFilterSentiment('all')}
          className={`glass-effect rounded-xl p-3 sm:p-4 text-left transition-all border ${
            filterSentiment === 'all' ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-slate-300 dark:border-white/10 hover:border-white/20'
          }`}
        >
          <div className="flex flex-col gap-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Toplam</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{summaryStats.total}</p>
            <div className="w-6 h-1 rounded bg-blue-500/50" />
          </div>
        </button>

        {SCORE_TIERS.map((tier) => (
          <button
            key={tier.key}
            onClick={() => setFilterSentiment(tier.key)}
            className={`glass-effect rounded-xl p-3 sm:p-4 text-left transition-all border ${
              filterSentiment === tier.key ? `${tier.ringColor} ring-1` : 'border-slate-300 dark:border-white/10 hover:border-white/20'
            }`}
            style={filterSentiment === tier.key ? { borderColor: tier.color } : undefined}
          >
            <div className="flex flex-col gap-1">
              <p className="text-xs" style={{ color: tier.color }}>{tier.label}</p>
              <p className="text-xl font-bold" style={{ color: tier.color }}>
                {summaryStats.tierCounts[tier.key as ScoreTierKey] ?? 0}
              </p>
              <div className="text-xs text-slate-600">{tier.min}–{tier.max}</div>
            </div>
          </button>
        ))}

        <div className="glass-effect rounded-xl p-3 sm:p-4 border border-slate-300 dark:border-white/10">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Ort. Puan</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {summaryStats.avgScore}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">/100</span>
            </p>
            <div className="w-6 h-1 rounded bg-cyan-500/50" />
          </div>
        </div>
      </div>

      {/* Filters & List */}
      <div className="glass-effect rounded-xl border border-slate-700/50 overflow-hidden">
        {/* Filter Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-base font-semibold text-slate-900 dark:text-white">Filtreler</span>
            {(filterStatus !== 'all' || filterSentiment !== 'all' || dateFrom || dateTo || searchTerm) && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {[filterStatus !== 'all', filterSentiment !== 'all', !!dateFrom || !!dateTo, !!searchTerm].filter(Boolean).length} aktif
              </span>
            )}
            {showFilters ? <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400 ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 ml-1" />}
          </button>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => loadChats()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Yenile
            </button>
            <button
              onClick={startAnalysis}
              disabled={analyzing || reanalyzing}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
                analyzing
                  ? 'bg-slate-700/40 border-slate-600/40 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              {analyzing ? 'Analiz Ediliyor...' : 'Analiz Başlat'}
            </button>
            <button
              onClick={() => setShowReanalyzeConfirm(true)}
              disabled={analyzing || reanalyzing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tümünü Yeniden Analiz Et
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="px-5 pb-5 pt-5 space-y-5 border-b border-slate-700/50">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Chat ID, temsilci, müşteri adı veya mesaj içeriği ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-10 py-3 filter-input"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Analiz Durumu</label>
                <div className="filter-btn-group">
                  {[
                    { value: 'all', label: 'Tümü' },
                    { value: 'analyzed', label: 'Analiz Edildi' },
                    { value: 'pending', label: 'Bekliyor' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterStatus(opt.value as any)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        filterStatus === opt.value
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-700/40 border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Kategori</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterSentiment('all')}
                    className={`py-2 px-3.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                      filterSentiment === 'all'
                        ? 'bg-slate-600/40 text-slate-700 dark:text-slate-200 border-slate-500/50'
                        : 'text-slate-500 dark:text-slate-400 border-slate-700/50 hover:text-slate-700 dark:text-slate-200 hover:border-slate-600 hover:bg-slate-700/30'
                    }`}
                  >
                    Tümü
                  </button>
                  {SCORE_TIERS.map((tier) => (
                    <button
                      key={tier.key}
                      onClick={() => setFilterSentiment(tier.key)}
                      className={`py-2 px-3.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                        filterSentiment === tier.key
                          ? 'border-current shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/30'
                      }`}
                      style={
                        filterSentiment === tier.key
                          ? { color: tier.color, backgroundColor: `${tier.color}20`, borderColor: `${tier.color}50` }
                          : {}
                      }
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tarih Aralığı</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">Hızlı:</span>
                  {[
                    { key: 'today' as const, label: 'Bugün' },
                    { key: 'yesterday' as const, label: 'Dün' },
                    { key: 'last7days' as const, label: 'Son 7 Gün' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setQuickDateFilter(key)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-600 dark:text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all duration-200 font-medium"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 filter-input dark:[color-scheme:dark]"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 filter-input dark:[color-scheme:dark]"
                  />
                </div>
              </div>
              {(dateFrom || dateTo) && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {dateFrom || '...'} — {dateTo || '...'} arası (İstanbul saatiyle 00:00–23:59)
                </p>
              )}
            </div>

            <div className="flex justify-end pt-1 border-t border-slate-700/40">
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setFilterStatus('all'); setFilterSentiment('all'); setSearchTerm(''); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-700/50 border border-transparent hover:border-slate-600/50 transition-all duration-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Filtreleri Temizle
              </button>
            </div>
          </div>
        )}

        {showReanalyzeConfirm && (
          <div className="px-5 py-4 border-b border-slate-700/50">
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-300 mb-1">Tüm chatler yeniden analiz edilecek</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mevcut puanlar sıfırlanmaz — her chat analiz edildiğinde skoru güncellenir. Dashboard hiç bozulmadan çalışmaya devam eder. Devam etmek istiyor musunuz?
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={reanalyzeAll} className="px-3 py-1.5 bg-amber-500/30 border border-amber-500/50 text-amber-200 rounded-lg text-xs font-medium hover:bg-amber-500/40 transition-colors">
                    Evet, Sıfırla ve Yeniden Analiz Et
                  </button>
                  <button onClick={() => setShowReanalyzeConfirm(false)} className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 rounded-lg text-xs hover:bg-slate-200 dark:bg-white/10 transition-colors">
                    İptal
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {analyzeStatus && (
          <div className="px-5 py-3 border-b border-slate-700/50">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-lg text-sm flex items-center gap-2">
              <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 ${analyzing || reanalyzing ? 'animate-spin' : ''}`} />
              {analyzeStatus}
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6">
          {/* Chat list */}
          <div className="space-y-2 relative">
            {listLoading && (
              <div className="absolute inset-0 bg-slate-100/50 dark:bg-slate-900/50 rounded-xl flex items-center justify-center z-10 backdrop-blur-[2px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
              </div>
            )}
            {chats.length === 0 && !listLoading ? (
              <div className="text-center py-16 text-slate-500">
                <Filter className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Hiç chat bulunamadı</p>
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className="p-4 bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 rounded-lg hover:bg-slate-200 dark:hover:bg-white/6 hover:border-slate-300 dark:hover:border-white/15 transition-all cursor-pointer"
                  onClick={() => loadChatMessages(chat)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-mono text-xs text-slate-500 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 px-2 py-0.5 rounded truncate max-w-[120px] sm:max-w-none">
                          {chat.id}
                        </span>
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">{chat.agent_name}</span>
                        <span className="text-slate-600 hidden sm:inline">—</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{maskName(chat.customer_name)}</span>
                        {chat.analysis && <span className="text-base">{getSentimentIcon(chat.analysis.sentiment)}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 mb-1.5">
                        <span>{new Date(chat.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</span>
                        <span>{chat.message_count} mesaj</span>
                        {chat.first_response_time && <span>İlk yanıt: {formatResponseTime(chat.first_response_time)}</span>}
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          chat.analyzed
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            : 'bg-slate-500/10 border border-slate-500/20 text-slate-500 dark:text-slate-400'
                        }`}>
                          {chat.analyzed ? 'Analiz Edildi' : 'Bekliyor'}
                        </span>
                      </div>
                      {chat.analysis && <p className="text-xs text-slate-500 line-clamp-2">{chat.analysis.ai_summary}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {chat.analysis && (
                        <div className={`px-3 py-1.5 rounded-lg font-bold text-sm ${getScoreStyle(chat.analysis.overall_score)}`}>
                          {parseScore(chat.analysis.overall_score)}/100
                        </div>
                      )}
                      {chat.analysis && parseScore(chat.analysis.overall_score) < 60 && (
                        <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      )}
                      {chat.analysis?.is_flagged && (
                        <Flag className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      )}
                      <Eye className="w-4 h-4 text-slate-600 flex-shrink-0 hidden sm:block" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalFilteredCount > 0 && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-700/40">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                <span className="text-slate-900 dark:text-white font-medium">{totalFilteredCount}</span> sonuç —{' '}
                Sayfa <span className="text-slate-900 dark:text-white font-medium">{currentPage}</span>/{totalPages || 1}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || listLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700/60 border border-slate-600/50 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Önceki
                </button>

                {totalPages > 1 && (
                  <div className="hidden sm:flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          disabled={listLoading}
                          className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                            currentPage === page
                              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-700/60 border border-transparent'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || listLoading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700/60 border border-slate-600/50 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Sonraki
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedChat && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50"
          onClick={() => setSelectedChat(null)}
        >
          <div
            className="bg-white dark:bg-[#0f1623] border border-slate-300 dark:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white dark:bg-[#0f1623] z-10">
              <div className="p-4 sm:p-6 border-b border-slate-300 dark:border-white/10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Chat Detayı</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedChat.agent_name} — {maskName(selectedChat.customer_name)}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5 font-mono truncate">{selectedChat.id}</p>
                </div>
                {selectedChat?.analysis && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setFlagModal({ open: true, mode: selectedChat.analysis?.is_flagged ? 'resolve' : 'flag' })}
                      title={selectedChat.analysis.is_flagged ? 'Bu analizi isaretini kaldir' : 'Bu analizi yanlis olarak isaretle'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selectedChat.analysis.is_flagged
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                          : 'bg-slate-100 dark:bg-white/5 border-white/15 text-slate-500 dark:text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/30'
                      }`}
                    >
                      <Flag className="w-3.5 h-3.5" />
                      {selectedChat.analysis.is_flagged ? 'Itiraz Var' : 'Itiraz Et'}
                    </button>
                    <button
                      onClick={reanalyzeSingleChat}
                      disabled={reanalyzing}
                      title="Bu chati yeniden analiz et"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin' : ''}`} />
                      Yeniden Analiz Et
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setSelectedChat(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/10 transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {analyzeStatus && (
                <div className="px-4 sm:px-6 pb-3">
                  <div className={`p-3 border rounded-lg text-sm flex items-center gap-2 ${analyzeStatus.startsWith('Hata') ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-blue-500/10 border-blue-500/20 text-blue-300'}`}>
                    <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 ${reanalyzing ? 'animate-spin' : ''}`} />
                    {analyzeStatus}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {selectedChat.analysis?.is_flagged && (
                <div className="flex items-start gap-3 p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl">
                  <Flag className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-rose-300">Bu analiz yanlis olarak isaretlendi</p>
                    {selectedChat.analysis.flag_reason && (
                      <p className="text-xs text-rose-400/70 mt-0.5">Gerekce: {selectedChat.analysis.flag_reason}</p>
                    )}
                    {selectedChat.analysis.flag_date && (
                      <p className="text-xs text-rose-400/50 mt-0.5">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(selectedChat.analysis.flag_date).toLocaleString('tr-TR')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selectedChat.analysis?.analysis_date && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Analiz tarihi: {new Date(selectedChat.analysis.analysis_date).toLocaleString('tr-TR')} — AI tarafindan otomatik olusturulmustur
                  </span>
                </div>
              )}

              {selectedChat.messages && selectedChat.messages.length > 0 && (
                <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                      Konuşma Geçmişi ({selectedChat.messages.length} mesaj)
                    </h3>
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {selectedChat.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`p-3 rounded-lg ${
                          message.author_type === 'agent'
                            ? 'bg-blue-500/10 border border-blue-500/15 ml-6 sm:ml-12'
                            : message.author_type === 'client'
                            ? 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 mr-6 sm:mr-12'
                            : 'bg-slate-500/10 border border-slate-500/15'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1 gap-2">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {message.author_type === 'agent' ? 'Temsilci' : message.author_type === 'client' ? 'Müşteri' : 'Sistem'}
                          </span>
                          <span className="text-xs text-slate-600 flex-shrink-0">
                            {new Date(message.created_at).toLocaleTimeString('tr-TR')}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{message.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedChat.analysis ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Genel Skor', value: `${parseScore(selectedChat.analysis.overall_score)}/100` },
                      { label: 'Duygu', value: `${getSentimentIcon(selectedChat.analysis.sentiment)} ${selectedChat.analysis.sentiment}` },
                      { label: 'İlk Yanıt', value: formatResponseTime(selectedChat.first_response_time) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 rounded-xl p-3 sm:p-4">
                        <div className="text-xs text-slate-500 mb-1">{label}</div>
                        <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Kategori Kırılımı</h3>

                    {selectedChat.analysis.language_compliance && (
                      <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Dil & Üslup</span>
                          <div className="flex gap-1.5">
                            {selectedChat.analysis.language_compliance.copy_paste_detected && (
                              <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400">Kopyala-Yapıştır</span>
                            )}
                            {selectedChat.analysis.language_compliance.forbidden_words?.length > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400">
                                Yasaklı: {selectedChat.analysis.language_compliance.forbidden_words.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {[
                            { label: 'Profesyonel Dil', value: selectedChat.analysis.language_compliance.professional_language },
                            { label: 'Kibar Üslup', value: selectedChat.analysis.language_compliance.polite_tone },
                          ].map(({ label, value }) => {
                            const v = typeof value === 'number' ? value : 0;
                            const color = v >= 90 ? 'bg-emerald-500' : v >= 70 ? 'bg-cyan-500' : v >= 60 ? 'bg-blue-500' : v >= 40 ? 'bg-amber-500' : v >= 30 ? 'bg-orange-500' : 'bg-rose-500';
                            const textColor = v >= 90 ? 'text-emerald-600 dark:text-emerald-400' : v >= 70 ? 'text-cyan-600 dark:text-cyan-400' : v >= 60 ? 'text-blue-600 dark:text-blue-400' : v >= 40 ? 'text-amber-600 dark:text-amber-400' : v >= 30 ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400';
                            return (
                              <div key={label}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                                  <span className={`text-xs font-semibold ${textColor}`}>{v}</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 dark:bg-white/8 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${v}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedChat.analysis.quality_metrics && (
                      <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 rounded-xl p-4">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-3">Kalite</span>
                        <div className="space-y-3">
                          {(() => {
                            const qm = selectedChat.analysis.quality_metrics;
                            const ar = typeof qm.answer_relevance === 'number' ? qm.answer_relevance : 0;
                            const arColor = ar >= 90 ? 'bg-emerald-500' : ar >= 70 ? 'bg-cyan-500' : ar >= 60 ? 'bg-blue-500' : ar >= 40 ? 'bg-amber-500' : ar >= 30 ? 'bg-orange-500' : 'bg-rose-500';
                            const arText = ar >= 90 ? 'text-emerald-600 dark:text-emerald-400' : ar >= 70 ? 'text-cyan-600 dark:text-cyan-400' : ar >= 60 ? 'text-blue-600 dark:text-blue-400' : ar >= 40 ? 'text-amber-600 dark:text-amber-400' : ar >= 30 ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400';
                            const satColor = qm.customer_satisfaction === 'positive'
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : qm.customer_satisfaction === 'negative'
                              ? 'bg-red-500/15 border-red-500/30 text-red-400'
                              : 'bg-slate-500/15 border-slate-500/30 text-slate-500 dark:text-slate-400';
                            const satLabel = qm.customer_satisfaction === 'positive' ? 'Olumlu' : qm.customer_satisfaction === 'negative' ? 'Olumsuz' : 'Nötr';
                            return (
                              <>
                                <div>
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Cevap Kalitesi</span>
                                    <span className={`text-xs font-semibold ${arText}`}>{ar}</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-200 dark:bg-white/8 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${arColor}`} style={{ width: `${ar}%` }} />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${qm.stalling_detected ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    Oyalama: {qm.stalling_detected ? 'Var' : 'Yok'}
                                  </div>
                                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${qm.unnecessary_length ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    Uzatma: {qm.unnecessary_length ? 'Var' : 'Yok'}
                                  </div>
                                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${satColor}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    Memnuniyet: {satLabel}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {selectedChat.analysis.performance_metrics && (
                      <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 rounded-xl p-4">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-3">Performans</span>
                        <div className="space-y-2.5">
                          {[
                            { label: 'İlk Yanıt Kalitesi', value: selectedChat.analysis.performance_metrics.first_response_quality },
                            { label: 'Çözüm Odaklılık', value: selectedChat.analysis.performance_metrics.solution_focused },
                            { label: 'İletişim Etkinliği', value: selectedChat.analysis.performance_metrics.communication_effectiveness },
                          ].map(({ label, value }) => {
                            const v = typeof value === 'number' ? value : 0;
                            const color = v >= 90 ? 'bg-emerald-500' : v >= 70 ? 'bg-cyan-500' : v >= 60 ? 'bg-blue-500' : v >= 40 ? 'bg-amber-500' : v >= 30 ? 'bg-orange-500' : 'bg-rose-500';
                            const textColor = v >= 90 ? 'text-emerald-600 dark:text-emerald-400' : v >= 70 ? 'text-cyan-600 dark:text-cyan-400' : v >= 60 ? 'text-blue-600 dark:text-blue-400' : v >= 40 ? 'text-amber-600 dark:text-amber-400' : v >= 30 ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400';
                            return (
                              <div key={label}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                                  <span className={`text-xs font-semibold ${textColor}`}>{v}</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 dark:bg-white/8 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${v}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-2">AI Özeti</h3>
                    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{selectedChat.analysis.ai_summary}</p>
                  </div>

                  {(selectedChat.analysis.issues_detected?.critical_errors?.length > 0 ||
                    selectedChat.analysis.issues_detected?.improvement_areas?.length > 0) && (
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-2">Tespit Edilen Sorunlar</h3>
                      {selectedChat.analysis.issues_detected?.critical_errors?.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs font-medium text-red-400 mb-1.5">Kritik Hatalar</div>
                          <ul className="space-y-1">
                            {selectedChat.analysis.issues_detected.critical_errors.map((issue: string, i: number) => (
                              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                                <span className="text-red-400 mt-0.5">•</span>{issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedChat.analysis.issues_detected?.improvement_areas?.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-amber-400 mb-1.5">Geliştirilmesi Gerekenler</div>
                          <ul className="space-y-1">
                            {selectedChat.analysis.issues_detected.improvement_areas.map((issue: string, i: number) => (
                              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                                <span className="text-amber-400 mt-0.5">•</span>{issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedChat.analysis.positive_aspects?.strengths?.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-2">Güçlü Yönler</h3>
                      <ul className="space-y-1">
                        {selectedChat.analysis.positive_aspects.strengths.map((s: string, i: number) => (
                          <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                            <span className="text-emerald-400 mt-0.5">•</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Öneriler</h3>
                    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{selectedChat.analysis.recommendations}</p>
                  </div>

                  <div className="border border-blue-500/20 rounded-xl overflow-hidden">
                    <div className="bg-blue-500/10 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-blue-300">AI Koçluk & Örnek Konuşma</span>
                      </div>
                      <button
                        onClick={() => { setCoachingError(''); fetchCoaching(); }}
                        disabled={loadingCoaching}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loadingCoaching ? (
                          <span className="w-3.5 h-3.5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {loadingCoaching ? 'Oluşturuluyor...' : selectedChat.analysis.coaching_suggestion ? 'Yeniden Oluştur' : coachingError ? 'Tekrar Dene' : 'Oluştur'}
                      </button>
                    </div>

                    {selectedChat.analysis.coaching_suggestion ? (() => {
                      const suggestion = selectedChat.analysis.coaching_suggestion;
                      const dialogue = parseDialogue(suggestion);
                      const anaSorunMatch = suggestion.match(/(?:\*\*)?Ana Sorun(?:\*\*)?\s*:?\s*([\s\S]*?)(?=(?:\d+\.\s*)?(?:\*\*)?Yapılması|$)/i);
                      const anaSorun = anaSorunMatch ? anaSorunMatch[1].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim() : '';
                      const yapMatch = suggestion.match(/(?:\*\*)?Yapılması Gerekenler?(?:\*\*)?\s*:?\s*([\s\S]*?)(?=(?:\d+\.\s*)?(?:\*\*)?Örnek|$)/i);
                      const bullets = yapMatch
                        ? yapMatch[1].split(/\n|-(?=\s)/).map((s) => s.replace(/\*\*/g, '').trim()).filter((s) => s.length > 5)
                        : [];
                      const ornekCevapMatch = suggestion.match(/(?:\*\*)?Örnek Cevap(?:\*\*)?\s*:?\s*([\s\S]*?)(?=(?:\d+\.\s*)?(?:\*\*)?(?:Örnek Diyalog|DIYALOG_BASLANGIC|$))/i);
                      const ornekCevap = ornekCevapMatch ? ornekCevapMatch[1].replace(/\*\*/g, '').trim() : '';
                      return (
                        <div className="p-4 space-y-4">
                          {anaSorun && (
                            <div>
                              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1.5">Ana Sorun</p>
                              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{anaSorun}</p>
                            </div>
                          )}
                          {bullets.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2">Yapılması Gerekenler</p>
                              <ul className="space-y-1.5">
                                {bullets.map((b, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {dialogue.length > 0 ? (
                            <div>
                              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                <MessageCircle className="w-3.5 h-3.5" />
                                Doğru Konuşma Örneği
                              </p>
                              <div className="bg-slate-900/60 rounded-xl p-3 space-y-2.5 border border-slate-200 dark:border-white/5">
                                {dialogue.map((line, i) => (
                                  <div key={i} className={`flex items-end gap-2 ${line.speaker === 'agent' ? 'justify-end' : 'justify-start'}`}>
                                    {line.speaker === 'customer' && (
                                      <div className="w-7 h-7 rounded-full bg-slate-600/70 border border-slate-300 dark:border-white/10 flex items-center justify-center flex-shrink-0">
                                        <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                                      </div>
                                    )}
                                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                      line.speaker === 'agent'
                                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-sm'
                                        : 'bg-slate-700/70 border border-slate-200 dark:border-white/8 text-slate-700 dark:text-slate-200 rounded-bl-sm'
                                    }`}>
                                      {line.text}
                                    </div>
                                    {line.speaker === 'agent' && (
                                      <div className="w-7 h-7 rounded-full bg-blue-600/50 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                        <Headphones className="w-3.5 h-3.5 text-blue-300" />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <p className="text-xs text-slate-500 mt-2 text-center">Bu örnek, tespit edilen sorunlara göre AI tarafından oluşturulmuştur.</p>
                            </div>
                          ) : ornekCevap ? (
                            <div>
                              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <MessageCircle className="w-3.5 h-3.5" />
                                Örnek Yanıt
                              </p>
                              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-200 dark:border-white/5">
                                <div className="flex items-end gap-2 justify-end">
                                  <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                                    {ornekCevap}
                                  </div>
                                  <div className="w-7 h-7 rounded-full bg-blue-600/50 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                    <Headphones className="w-3.5 h-3.5 text-blue-300" />
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 mt-2 text-center italic">Tam diyalog için koçluk önerisini yeniden oluşturun.</p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })() : (
                      <div className="p-5 space-y-3">
                        {coachingError && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-lg text-sm text-rose-300 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{coachingError}</span>
                          </div>
                        )}
                        <div className="text-center text-slate-500 text-sm py-4">
                          {loadingCoaching
                            ? 'AI koçluk önerisi ve örnek konuşma oluşturuluyor...'
                            : coachingError
                            ? 'Oluşturma sırasında hata oluştu. Yukarıdaki butona tıklayarak tekrar deneyebilirsiniz.'
                            : 'Koçluk önerisi ve örnek konuşma oluşturmak için butona tıklayın.'}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                      { label: 'Mesaj', value: selectedChat.message_count },
                      { label: 'İlk Yanıt', value: formatResponseTime(selectedChat.first_response_time) },
                      { label: 'Durum', value: selectedChat.status },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/8 rounded-xl p-3 sm:p-4">
                        <div className="text-xs text-slate-500 mb-1">{label}</div>
                        <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white capitalize">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-center py-8 text-slate-500 text-sm">Bu chat henüz analiz edilmedi</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {flagModal.open && selectedChat?.analysis && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
          onClick={() => setFlagModal({ open: false, mode: 'flag' })}
        >
          <div
            className="bg-white dark:bg-[#0f1623] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-300 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {flagModal.mode === 'flag' ? (
                  <Flag className="w-5 h-5 text-rose-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {flagModal.mode === 'flag' ? 'Analizi Yanlis Olarak Isaretle' : 'Itiraz Coz / Islemi Tamamla'}
                </h3>
              </div>
              <button onClick={() => setFlagModal({ open: false, mode: 'flag' })} className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-white rounded-lg hover:bg-slate-200 dark:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {flagModal.mode === 'flag' ? (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Bu analiz sonucunun yapay zeka tarafindan yanlis degerlendirildigini dusunuyorsaniz gerekce belirterek isaretleyebilirsiniz.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Gerekce (zorunlu)</label>
                    <textarea
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value)}
                      placeholder="Ornek: Musteri agresif davranmasina ragmen skor cok dusuk verilmis..."
                      className="w-full bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-rose-500/50 resize-none"
                      rows={4}
                    />
                  </div>
                  <button
                    onClick={submitFlag}
                    disabled={flagging || !flagReason.trim()}
                    className="w-full py-2.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {flagging ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Flag className="w-4 h-4" />}
                    {flagging ? 'Isleniyor...' : 'Yanlis Olarak Isaretle'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Bu analiz uzerindeki itiraz cozuldu mu? Aciklama ekleyerek itiraz bayragi kaldirabilirsiniz.</p>
                  {selectedChat.analysis.flag_reason && (
                    <div className="p-3 bg-rose-500/8 border border-rose-500/20 rounded-lg">
                      <p className="text-xs text-rose-400/70 mb-1">Orijinal itiraz gerekce:</p>
                      <p className="text-sm text-rose-300">{selectedChat.analysis.flag_reason}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Cozum Notu (opsiyonel)</label>
                    <textarea
                      value={flagResolutionNote}
                      onChange={(e) => setFlagResolutionNote(e.target.value)}
                      placeholder="Ornek: Analiz incelendi, skor dogru bulundu..."
                      className="w-full bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                      rows={3}
                    />
                  </div>
                  <button
                    onClick={resolveFlag}
                    disabled={flagging}
                    className="w-full py-2.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {flagging ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {flagging ? 'Isleniyor...' : 'Itiraz Bayragi Kaldir'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
