import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { maskName } from '../lib/utils';
import { useBrand } from '../lib/brand';
import { MessageSquare, User, Calendar, Clock, Search, AlertCircle, CheckCircle, X, ThumbsUp, ThumbsDown, MessageCircle, ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';

interface Chat {
  id: string;
  agent_name: string;
  customer_name: string;
  created_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  message_count: number;
  status: string;
  analyzed: boolean;
  first_response_time: number | null;
  rating_score: number | null;
  rating_status: string | null;
  rating_comment: string | null;
  has_rating_comment: boolean | null;
  complaint_flag: boolean | null;
}

interface ChatMessage {
  message_id: string;
  author_type: string;
  text: string;
  created_at: string;
  is_system: boolean;
}

interface StatCounts {
  total: number;
  analyzed: number;
  liked: number;
  disliked: number;
  commented: number;
  notRated: number;
}

const PAGE_SIZE = 50;

export default function ChatList() {
  const { activeBrand } = useBrand();
  const location = useLocation();
  const navigate = useNavigate();
  const deepLinkHandled = useRef(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [statCounts, setStatCounts] = useState<StatCounts>({ total: 0, analyzed: 0, liked: 0, disliked: 0, commented: 0, notRated: 0 });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [analyzedFilter, setAnalyzedFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [missedFilter, setMissedFilter] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [agents, setAgents] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(true);

  const getIstanbulDateString = (date: Date): string => {
    return date.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
      .split('.').reverse().join('-');
  };

  const setQuickDateFilter = (filter: 'today' | 'yesterday' | 'last7days') => {
    const now = new Date();
    const istanbulNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));

    switch (filter) {
      case 'today': {
        const today = getIstanbulDateString(istanbulNow);
        setDateFrom(today);
        setDateTo(today);
        break;
      }
      case 'yesterday': {
        const yesterday = new Date(istanbulNow);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getIstanbulDateString(yesterday);
        setDateFrom(yesterdayStr);
        setDateTo(yesterdayStr);
        break;
      }
      case 'last7days': {
        const last7days = new Date(istanbulNow);
        last7days.setDate(last7days.getDate() - 7);
        setDateFrom(getIstanbulDateString(last7days));
        setDateTo(getIstanbulDateString(istanbulNow));
        break;
      }
    }
  };

  const loadChats = useCallback(async () => {
    try {
      setListLoading(true);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('chats')
        .select('id, chat_id, agent_name, customer_name, created_at, ended_at, duration_seconds, message_count, status, analyzed, first_response_time, rating_score, rating_status, rating_comment, has_rating_comment, complaint_flag', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (agentFilter) query = query.eq('agent_name', agentFilter);
      if (analyzedFilter === 'analyzed') query = query.eq('analyzed', true);
      if (analyzedFilter === 'not_analyzed') query = query.eq('analyzed', false);
      if (missedFilter) query = query.eq('is_missed', true);
      if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00+03:00');
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999+03:00');
      if (searchQuery) {
        query = query.or(`agent_name.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,id.ilike.%${searchQuery}%`);
      }
      if (ratingFilter === 'like') query = query.eq('rating_status', 'rated_good');
      if (ratingFilter === 'dislike') query = query.eq('rating_status', 'rated_bad');
      if (ratingFilter === 'commented') query = query.eq('rating_status', 'rated_commented');
      if (ratingFilter === 'with_comment') query = query.not('rating_comment', 'is', null).neq('rating_comment', '');
      if (ratingFilter === 'not_rated') query = query.eq('rating_status', 'not_rated');

      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setChats(data || []);
      setTotalFilteredCount(count || 0);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setListLoading(false);
      setLoading(false);
    }
  }, [currentPage, statusFilter, agentFilter, analyzedFilter, missedFilter, dateFrom, dateTo, searchQuery, ratingFilter, activeBrand?.brand_id]);

  const loadStats = useCallback(async () => {
    try {
      const baseFilters = (q: any) => {
        if (activeBrand?.brand_id) q = q.eq('brand_id', activeBrand.brand_id);
        if (statusFilter !== 'all') q = q.eq('status', statusFilter);
        if (agentFilter) q = q.eq('agent_name', agentFilter);
        if (missedFilter) q = q.eq('is_missed', true);
        if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00+03:00');
        if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59.999+03:00');
        if (searchQuery) q = q.or(`agent_name.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,id.ilike.%${searchQuery}%`);
        return q;
      };

      const applyRatingFilter = (q: any) => {
        if (ratingFilter === 'like') q = q.eq('rating_status', 'rated_good');
        if (ratingFilter === 'dislike') q = q.eq('rating_status', 'rated_bad');
        if (ratingFilter === 'commented') q = q.eq('rating_status', 'rated_commented');
        if (ratingFilter === 'with_comment') q = q.not('rating_comment', 'is', null).neq('rating_comment', '');
        if (ratingFilter === 'not_rated') q = q.eq('rating_status', 'not_rated');
        return q;
      };

      const applyAnalyzedFilter = (q: any) => {
        if (analyzedFilter === 'analyzed') q = q.eq('analyzed', true);
        if (analyzedFilter === 'not_analyzed') q = q.eq('analyzed', false);
        return q;
      };

      const [totalRes, analyzedRes, likedRes, dislikedRes, commentedRes, notRatedRes] = await Promise.all([
        applyRatingFilter(applyAnalyzedFilter(baseFilters(supabase.from('chats').select('*', { count: 'exact', head: true })))),
        applyRatingFilter(baseFilters(supabase.from('chats').select('*', { count: 'exact', head: true }).eq('analyzed', true))),
        applyAnalyzedFilter(baseFilters(supabase.from('chats').select('*', { count: 'exact', head: true }).eq('rating_status', 'rated_good'))),
        applyAnalyzedFilter(baseFilters(supabase.from('chats').select('*', { count: 'exact', head: true }).eq('rating_status', 'rated_bad'))),
        applyAnalyzedFilter(baseFilters(supabase.from('chats').select('*', { count: 'exact', head: true }).eq('rating_status', 'rated_commented'))),
        applyAnalyzedFilter(baseFilters(supabase.from('chats').select('*', { count: 'exact', head: true }).eq('rating_status', 'not_rated'))),
      ]);

      setStatCounts({
        total: totalRes.count || 0,
        analyzed: analyzedRes.count || 0,
        liked: likedRes.count || 0,
        disliked: dislikedRes.count || 0,
        commented: commentedRes.count || 0,
        notRated: notRatedRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, [statusFilter, agentFilter, analyzedFilter, missedFilter, dateFrom, dateTo, searchQuery, ratingFilter, activeBrand?.brand_id]);

  const loadAgents = async () => {
    try {
      const { data } = await supabase.from('personnel').select('name').order('name');
      setAgents(data?.map(p => p.name) || []);
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, agentFilter, analyzedFilter, ratingFilter, missedFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    loadChats();
    loadStats();
  }, [loadChats, loadStats]);

  // Deep-link: ?chat=CHATID opens that chat directly
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

        setSelectedChat(chat);

        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: true });

        setMessages(msgs || []);
        navigate('/all-chats', { replace: true });
      } catch (err) {
        console.error('Deep-link chat load error:', err);
      }
    })();
  }, [location.search, navigate]);

  const loadMessages = async (chatId: string) => {
    try {
      setLoadingMessages(true);
      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .range(0, 999);

      if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);

      const { data, error } = await query;

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleChatClick = async (chat: Chat) => {
    setSelectedChat(chat);
    await loadMessages(chat.id);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setAgentFilter('');
    setAnalyzedFilter('all');
    setRatingFilter('all');
    setMissedFilter(false);
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Aktif</span>;
      case 'archived':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-slate-900 dark:text-white">Arsiv</span>;
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const hasActiveFilters = statusFilter !== 'all' || !!agentFilter || analyzedFilter !== 'all' || ratingFilter !== 'all' || missedFilter || !!dateFrom || !!dateTo || !!searchQuery;
  const activeFilterCount = [statusFilter !== 'all', !!agentFilter, analyzedFilter !== 'all', ratingFilter !== 'all', missedFilter, !!dateFrom || !!dateTo, !!searchQuery].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Tum Chatler</h1>
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 mt-1">LiveChat'ten gelen tum sohbetler</p>
        </div>
        <button
          onClick={() => { loadChats(); loadStats(); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex-shrink-0 self-start"
        >
          Yenile
        </button>
      </div>

      {/* Filters Section */}
      <div className="glass-effect rounded-xl border border-slate-700/50 overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-700/20 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-base font-semibold text-slate-900 dark:text-white">Filtreler</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {activeFilterCount} aktif
              </span>
            )}
          </div>
          {showFilters ? <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
        </button>

        {showFilters && (
          <div className="px-5 pb-5 space-y-5 border-t border-slate-700/50">
            {/* Search */}
            <div className="pt-5">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Chat ID, musteri veya temsilci adi ara..."
                  className="w-full pl-11 pr-10 py-3 filter-input"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 1: Status + Analyzed */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Durum</label>
                <div className="filter-btn-group">
                  {[
                    { value: 'all', label: 'Tumu' },
                    { value: 'active', label: 'Aktif' },
                    { value: 'archived', label: 'Arsiv' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setStatusFilter(opt.value)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        statusFilter === opt.value
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
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Analiz Durumu</label>
                <div className="filter-btn-group">
                  {[
                    { value: 'all', label: 'Tumu' },
                    { value: 'analyzed', label: 'Analiz Edildi' },
                    { value: 'not_analyzed', label: 'Analiz Edilmedi' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAnalyzedFilter(opt.value)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        analyzedFilter === opt.value
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-700/40 border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Rating + Agent */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Musteri Degerlendirmesi</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 'all', label: 'Tumu', color: 'cyan' },
                    { value: 'like', label: 'Begenilen', color: 'emerald' },
                    { value: 'dislike', label: 'Begenilmeyen', color: 'rose' },
                    { value: 'with_comment', label: 'Yorumlu', color: 'blue' },
                    { value: 'not_rated', label: 'Degerlendirilmemis', color: 'slate' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setRatingFilter(opt.value)}
                      className={`py-2 px-3.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                        ratingFilter === opt.value
                          ? opt.color === 'cyan' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : opt.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : opt.color === 'rose' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : opt.color === 'blue' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-slate-600/40 text-slate-600 dark:text-slate-300 border-slate-500/40'
                          : 'text-slate-500 dark:text-slate-400 border-slate-700/50 hover:text-slate-700 dark:text-slate-200 hover:border-slate-600 hover:bg-slate-700/30'
                      }`}
                    >
                      {opt.value === 'like' && <ThumbsUp className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                      {opt.value === 'dislike' && <ThumbsDown className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                      {opt.value === 'with_comment' && <MessageCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Temsilci</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
                  <select
                    value={agentFilter}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 filter-input appearance-none"
                  >
                    <option value="">Tum Temsilciler</option>
                    {agents.map(agent => (
                      <option key={agent} value={agent}>{agent}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Date Range */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tarih Araligi</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">Hizli:</span>
                  {[
                    { key: 'today' as const, label: 'Bugun' },
                    { key: 'yesterday' as const, label: 'Dun' },
                    { key: 'last7days' as const, label: 'Son 7 Gun' },
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
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-600/60 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 text-sm transition-all"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-600/60 text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 text-sm transition-all"
                  />
                </div>
              </div>
              {(dateFrom || dateTo) && (
                <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {dateFrom || '...'} — {dateTo || '...'} arasi (Istanbul saatiyle 00:00–23:59)
                </p>
              )}
            </div>

            {/* Bottom Row: Missed filter + Clear */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
              <button
                onClick={() => setMissedFilter(!missedFilter)}
                className="flex items-center gap-3 group"
              >
                <div className={`relative w-10 rounded-full transition-all duration-200 ${missedFilter ? 'bg-cyan-500' : 'bg-slate-600'}`} style={{ height: '22px' }}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${missedFilter ? 'left-5' : 'left-0.5'}`} />
                </div>
                <span className={`text-sm font-medium transition-colors ${missedFilter ? 'text-cyan-300' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:text-slate-200'}`}>
                  Sadece kacirılmis chatleri goster
                </span>
              </button>

              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-700/50 border border-transparent hover:border-slate-600/50 transition-all duration-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Filtreleri Temizle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        <div className="glass-effect rounded-lg shadow-lg p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Toplam Chat</p>
          <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{statCounts.total.toLocaleString('tr-TR')}</p>
        </div>
        <div className="glass-effect rounded-lg shadow-sm border border-slate-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Analiz Edildi</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600">{statCounts.analyzed.toLocaleString('tr-TR')}</p>
        </div>
        <div className="glass-effect rounded-lg shadow-sm border border-slate-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Begenilen</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600">{statCounts.liked.toLocaleString('tr-TR')}</p>
        </div>
        <div className="glass-effect rounded-lg shadow-sm border border-slate-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Begenilmeyen</p>
          <p className="text-lg sm:text-2xl font-bold text-red-600">{statCounts.disliked.toLocaleString('tr-TR')}</p>
        </div>
        <div className="glass-effect rounded-lg shadow-sm border border-slate-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Yorumlu</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-600">{statCounts.commented.toLocaleString('tr-TR')}</p>
        </div>
        <div className="glass-effect rounded-lg shadow-sm border border-slate-700 p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">Degerlendirilmemis</p>
          <p className="text-lg sm:text-2xl font-bold text-slate-700 dark:text-slate-200">{statCounts.notRated.toLocaleString('tr-TR')}</p>
        </div>
      </div>

      {/* Chat List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Left: Chat List */}
        <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Chatler ({totalFilteredCount.toLocaleString('tr-TR')})
          </h2>

          {listLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-8 text-slate-100">
              Chat bulunamadi
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[650px] lg:max-h-[700px]">
              {chats.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => handleChatClick(chat)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedChat?.id === chat.id
                      ? 'border-blue-500 bg-blue-900/30'
                      : 'border-slate-700 hover:border-slate-500 hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-100" />
                      <span className="text-sm font-mono text-slate-600">#{chat.id.slice(0, 8)}</span>
                    </div>
                    {getStatusBadge(chat.status)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                      <span className="font-medium text-slate-900 dark:text-white">{maskName(chat.customer_name)}</span>
                      <span className="text-slate-100">→</span>
                      <span className="text-slate-700 dark:text-slate-200">{chat.agent_name}</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-100">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(chat.created_at).toLocaleString('tr-TR', {
                          timeZone: 'Europe/Istanbul',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {chat.message_count} mesaj
                      </div>
                      {chat.first_response_time && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {chat.first_response_time}s
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {chat.analyzed ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          Analiz Edildi
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-orange-600">
                          <AlertCircle className="w-3 h-3" />
                          Analiz Bekliyor
                        </span>
                      )}
                      {(() => {
                        const rawScore = chat.rating_score;
                        const ratingScore = Number(rawScore);
                        const ratingComment = chat.rating_comment;

                        if (!isNaN(ratingScore) && rawScore !== null && rawScore !== undefined) {
                          if (ratingScore >= 4) {
                            return (
                              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                <ThumbsUp className="w-3 h-3" />
                                Begenildi
                              </span>
                            );
                          } else if (ratingScore <= 2) {
                            return (
                              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                <ThumbsDown className="w-3 h-3" />
                                Begenilmedi
                              </span>
                            );
                          }
                        }

                        if (ratingComment) {
                          return (
                            <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              <MessageCircle className="w-3 h-3" />
                              Yorumlu
                            </span>
                          );
                        }

                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {totalFilteredCount.toLocaleString('tr-TR')} sonuc — Sayfa {currentPage}/{totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-700/50 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
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
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                        currentPage === page
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-700/50 border border-transparent'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-700/50 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Chat Details */}
        <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-6 max-h-[600px] lg:max-h-[800px] overflow-y-auto">
          {!selectedChat ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-100">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p>Detaylari gormek icin bir chat secin</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Chat Detaylari</h2>
                <button
                  onClick={() => setSelectedChat(null)}
                  className="text-slate-700 dark:text-slate-200 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mb-6 pb-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Chat ID:</span>
                  <span className="text-sm font-mono text-slate-900 dark:text-white">{selectedChat.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Musteri:</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{maskName(selectedChat.customer_name)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Temsilci:</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedChat.agent_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Durum:</span>
                  {getStatusBadge(selectedChat.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Baslangic:</span>
                  <span className="text-sm text-slate-900 dark:text-white">
                    {new Date(selectedChat.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                  </span>
                </div>
                {selectedChat.ended_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Bitis:</span>
                    <span className="text-sm text-slate-900 dark:text-white">
                      {new Date(selectedChat.ended_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                    </span>
                  </div>
                )}
                {selectedChat.duration_seconds && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Sure:</span>
                    <span className="text-sm text-slate-900 dark:text-white">
                      {Math.floor(selectedChat.duration_seconds / 60)}d {selectedChat.duration_seconds % 60}s
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Mesaj Sayisi:</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{selectedChat.message_count}</span>
                </div>
                {(() => {
                  const rawScore = selectedChat.rating_score;
                  const ratingScore = Number(rawScore);
                  const ratingComment = selectedChat.rating_comment;
                  const isLike = !isNaN(ratingScore) && ratingScore >= 4;
                  const isDislike = !isNaN(ratingScore) && ratingScore >= 1 && ratingScore <= 2;

                  if (rawScore !== null && rawScore !== undefined && (isLike || isDislike)) {
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Degerlendirme:</span>
                          <span className={`flex items-center gap-1 text-sm font-medium ${isLike ? 'text-green-600' : 'text-red-600'}`}>
                            {isLike ? <ThumbsUp className="w-4 h-4" /> : <ThumbsDown className="w-4 h-4" />}
                            {isLike ? 'Begenildi' : 'Begenilmedi'} ({ratingScore}/5)
                          </span>
                        </div>
                        {ratingComment && (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm text-slate-600">Musteri Yorumu:</span>
                            <div className="text-sm bg-slate-700/40 text-slate-700 dark:text-slate-200 p-3 rounded border border-slate-600">
                              {ratingComment}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  }

                  return null;
                })()}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Mesajlar</h3>
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-slate-100">
                    Mesaj bulunamadi
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map(msg => (
                      <div
                        key={msg.message_id}
                        className={`p-3 rounded-lg ${
                          msg.is_system
                            ? 'bg-slate-700/40 border border-slate-600'
                            : msg.author_type === 'agent'
                            ? 'bg-blue-900/30 border border-blue-700/50'
                            : 'bg-emerald-900/30 border border-emerald-700/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">
                            {msg.is_system ? 'Sistem' : msg.author_type === 'agent' ? 'Temsilci' : 'Musteri'}
                          </span>
                          <span className="text-xs text-slate-100">
                            {new Date(msg.created_at).toLocaleTimeString('tr-TR')}
                          </span>
                        </div>
                        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
