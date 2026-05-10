import { useEffect, useState, useMemo } from 'react';
import { X, MessageSquare, User, Calendar, ChevronLeft, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { maskName, SCORE_TIERS } from '../lib/utils';
import { useBrand } from '../lib/brand';

interface ChatItem {
  id: string;
  chat_id: string;
  agent_name: string;
  customer_name: string;
  created_at: string;
  message_count: number;
  overall_score: number | null;
}

interface ChatMessage {
  message_id: string;
  author_type: string;
  text: string;
  created_at: string;
  is_system: boolean;
}

interface ComplaintChatsModalProps {
  category: string | null;
  chatIds: string[];
  onClose: () => void;
}

export default function ComplaintChatsModal({ category, chatIds, onClose }: ComplaintChatsModalProps) {
  const { activeBrand } = useBrand();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [view, setView] = useState<'list' | 'daily'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!category) return;
    setSelectedChat(null);
    setMessages([]);
    setSearchQuery('');
    setView('list');
    loadChats();
  }, [category, chatIds.join(',')]);

  const loadChats = async () => {
    if (!activeBrand?.brand_id) {
      setChats([]);
      setLoading(false);
      return;
    }
    if (chatIds.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const batchSize = 1000;
      let allChatData: any[] = [];
      for (let i = 0; i < chatIds.length; i += batchSize) {
        const batch = chatIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from('chats')
          .select('id, chat_id, agent_name, customer_name, created_at, message_count')
          .eq('brand_id', activeBrand.brand_id)
          .in('id', batch);
        if (data) allChatData = [...allChatData, ...data];
      }

      let allAnalysis: any[] = [];
      for (let i = 0; i < chatIds.length; i += batchSize) {
        const batch = chatIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from('chat_analysis')
          .select('chat_id, overall_score')
          .in('chat_id', batch);
        if (data) allAnalysis = [...allAnalysis, ...data];
      }

      const scoreMap: Record<string, number> = {};
      allAnalysis.forEach(a => { scoreMap[a.chat_id] = a.overall_score; });

      const merged = allChatData.map(c => ({
        ...c,
        overall_score: scoreMap[c.id] ?? null,
      }));

      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setChats(merged);
    } catch (err) {
      console.error('Error loading complaint chats:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      setLoadingMessages(true);
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleChatClick = async (chat: ChatItem) => {
    setSelectedChat(chat);
    await loadMessages(chat.id);
  };

  const dailyBreakdown = useMemo(() => {
    const map: Record<string, { count: number; isoDate: string }> = {};
    chats.forEach(chat => {
      const d = new Date(chat.created_at);
      const isoDate = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
      const displayDate = d.toLocaleDateString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      if (!map[isoDate]) map[isoDate] = { count: 0, isoDate };
      map[isoDate].count++;
      (map[isoDate] as any).displayDate = displayDate;
    });
    return Object.entries(map)
      .map(([isoDate, v]) => ({ isoDate, displayDate: (v as any).displayDate, count: v.count }))
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  }, [chats]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter(c =>
      c.agent_name?.toLowerCase().includes(q) ||
      c.customer_name?.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  }, [chats, searchQuery]);

  const maxDailyCount = Math.max(...dailyBreakdown.map(d => d.count), 1);

  if (!category) return null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getScoreColor = (score: number | null) => {
    if (score === null) return '#6b7280';
    const t = SCORE_TIERS.find(ti => score >= ti.min && score <= ti.max);
    return t?.color || '#6b7280';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-50 dark:bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeSlideUp 0.2s ease-out' }}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-red-900/60 to-rose-900/40 border-b border-slate-700/60 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {selectedChat ? (
              <button
                onClick={() => { setSelectedChat(null); setMessages([]); }}
                className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white transition-colors text-sm flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                Geri
              </button>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{category}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 flex-shrink-0">
                  {chats.length} chat
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!selectedChat && !loading && chats.length > 0 && (
              <div className="flex items-center bg-slate-200 dark:bg-white/10 rounded-lg p-0.5">
                <button
                  onClick={() => setView('list')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'list' ? 'bg-white/20 text-slate-900 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                >
                  Liste
                </button>
                <button
                  onClick={() => setView('daily')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'daily' ? 'bg-white/20 text-slate-900 dark:text-white font-medium' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                >
                  Gunluk
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors p-1 rounded-lg hover:bg-slate-200 dark:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {!selectedChat ? (
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-500 dark:text-slate-400" />
                </div>
              ) : chats.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm">
                  Bu kategoride chat bulunamadi
                </div>
              ) : view === 'daily' ? (
                <div className="space-y-2">
                  <div className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                    Secilen zaman araliginda gune gore sikayet dagilimi
                  </div>
                  {dailyBreakdown.map(({ displayDate, count }) => (
                    <div key={displayDate} className="group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">{displayDate}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{count}</span>
                      </div>
                      <div className="relative h-8 bg-slate-200 dark:bg-white/10 rounded-lg overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ease-out bg-red-500/70 group-hover:bg-red-500/90"
                          style={{ width: `${(count / maxDailyCount) * 100}%` }}
                        >
                          <div className="absolute inset-0 flex items-center justify-end pr-2">
                            {(count / maxDailyCount) * 100 > 12 && (
                              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                {Math.round((count / maxDailyCount) * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="mb-3 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Temsilci, musteri veya ID ara..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 transition-colors"
                    />
                  </div>
                  {filteredChats.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-500 dark:text-slate-400 text-sm">
                      Arama sonucu bulunamadi
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredChats.map(chat => {
                        const scoreColor = getScoreColor(chat.overall_score);
                        return (
                          <button
                            key={chat.id}
                            onClick={() => handleChatClick(chat)}
                            className="text-left p-4 rounded-xl border border-slate-700/60 hover:border-red-500/40 hover:bg-slate-800/60 transition-all group"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-red-300 transition-colors" />
                                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:text-slate-200 transition-colors">
                                  #{chat.id.slice(0, 10)}
                                </span>
                              </div>
                              {chat.overall_score !== null && (
                                <span
                                  className="text-xs font-bold px-2 py-0.5 rounded-full border"
                                  style={{
                                    backgroundColor: `${scoreColor}22`,
                                    color: scoreColor,
                                    borderColor: `${scoreColor}44`,
                                  }}
                                >
                                  {chat.overall_score}/100
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm mb-1.5 min-w-0">
                              <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              <span className="text-slate-900 dark:text-white font-medium truncate">{maskName(chat.customer_name)}</span>
                              <span className="text-slate-500 flex-shrink-0">→</span>
                              <span className="text-slate-600 dark:text-slate-300 truncate">{chat.agent_name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(chat.created_at)}
                              </div>
                              <div className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {chat.message_count} mesaj
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white font-medium">{maskName(selectedChat.customer_name)}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-slate-600 dark:text-slate-300">{selectedChat.agent_name}</span>
                  <span className="ml-auto text-xs text-slate-500 font-mono">#{selectedChat.id.slice(0, 10)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{formatDate(selectedChat.created_at)}</div>
              </div>
              {loadingMessages ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-500 dark:text-slate-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm">
                  Mesaj bulunamadi
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map(msg => (
                    <div
                      key={msg.message_id}
                      className={`p-3 rounded-lg text-sm ${
                        msg.is_system
                          ? 'bg-slate-700/30 border border-slate-600/50 text-slate-500 dark:text-slate-400 text-xs text-center'
                          : msg.author_type === 'agent'
                          ? 'bg-blue-900/30 border border-blue-700/40 ml-6'
                          : 'bg-emerald-900/30 border border-emerald-700/40 mr-6'
                      }`}
                    >
                      {!msg.is_system && (
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-semibold ${msg.author_type === 'agent' ? 'text-blue-300' : 'text-emerald-300'}`}>
                            {msg.author_type === 'agent' ? 'Temsilci' : 'Musteri'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(msg.created_at).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                          </span>
                        </div>
                      )}
                      <p className="text-slate-900 dark:text-white whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
