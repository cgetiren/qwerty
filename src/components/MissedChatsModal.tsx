import { useEffect, useState } from 'react';
import { X, PhoneOff, User, Calendar, ChevronLeft, Loader2, MessageSquare, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { maskName } from '../lib/utils';
import { useBrand } from '../lib/brand';

interface MissedChat {
  id: string;
  chat_id: string;
  customer_name: string;
  agent_name: string | null;
  created_at: string;
  message_count: number;
  chat_data: any;
}

interface ChatMessage {
  message_id: string;
  author_type: string;
  text: string;
  created_at: string;
  is_system: boolean;
}

interface MissedChatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName?: string;
}

export default function MissedChatsModal({ isOpen, onClose, agentName }: MissedChatsModalProps) {
  const { activeBrand } = useBrand();
  const [chats, setChats] = useState<MissedChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<MissedChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedChat(null);
    setMessages([]);
    loadChats();
  }, [isOpen, agentName, activeBrand?.brand_id]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const loadChats = async () => {
    if (!activeBrand?.brand_id) {
      setChats([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      let query = supabase
        .from('chats')
        .select('id, chat_id, customer_name, agent_name, created_at, message_count, chat_data')
        .eq('is_missed', true)
        .eq('brand_id', activeBrand.brand_id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (agentName) query = query.eq('agent_name', agentName);
      const { data, error } = await query;
      if (error) throw error;
      setChats(data || []);
    } catch (err) {
      console.error('Error loading missed chats:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleChatClick = async (chat: MissedChat) => {
    setSelectedChat(chat);
    await loadMessages(chat.id);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getDuration = (chat: MissedChat) => {
    const secs = chat.chat_data?.properties?.raw_chat_data?.chat_duration_seconds;
    if (!secs && secs !== 0) return null;
    if (secs === 0) return '0 sn';
    if (secs < 60) return `${secs} sn`;
    return `${Math.floor(secs / 60)} dk`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-50 dark:bg-slate-900 border border-orange-500/40 rounded-2xl shadow-2xl shadow-orange-500/10 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-900/50 to-red-900/30 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            {selectedChat ? (
              <button
                onClick={() => { setSelectedChat(null); setMessages([]); }}
                className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white transition-colors text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                Geri
              </button>
            ) : (
              <>
                <div className="p-1.5 bg-orange-500/20 rounded-lg border border-orange-500/30">
                  <PhoneOff className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Kaçan Chatler</h2>
                  {agentName && <p className="text-xs text-orange-300/70 mt-0.5">{agentName}</p>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  {chats.length} chat
                </span>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {!selectedChat ? (
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
                </div>
              ) : chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400 gap-3">
                  <PhoneOff className="w-10 h-10 text-slate-600" />
                  <span>Kaçan chat bulunamadı</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {chats.map(chat => {
                    const duration = getDuration(chat);
                    return (
                      <button
                        key={chat.id}
                        onClick={() => handleChatClick(chat)}
                        className="text-left p-4 rounded-xl border border-slate-700 hover:border-orange-500/50 hover:bg-orange-900/10 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <PhoneOff className="w-3.5 h-3.5 text-orange-400/70 group-hover:text-orange-400 transition-colors" />
                            <span className="text-xs font-mono text-slate-500 group-hover:text-slate-600 dark:text-slate-300 transition-colors">
                              #{chat.id.slice(0, 10)}
                            </span>
                          </div>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/25">
                            Kaçan
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm mb-2">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-slate-900 dark:text-white font-medium">{maskName(chat.customer_name)}</span>
                        </div>

                        <div className="text-xs text-slate-500 italic mb-2">
                          Temsilci atanmadı
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(chat.created_at)}
                          </div>
                          {duration !== null && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {duration}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {chat.message_count ?? 0} mesaj
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-orange-500/20">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <PhoneOff className="w-4 h-4 text-orange-400" />
                  <span className="text-orange-300 font-medium">Kaçan Chat</span>
                  <span className="mx-1 text-slate-600">•</span>
                  <User className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white font-medium">{maskName(selectedChat.customer_name)}</span>
                  <span className="ml-auto text-xs text-slate-500 font-mono">#{selectedChat.id.slice(0, 10)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{formatDate(selectedChat.created_at)}</div>
              </div>

              {loadingMessages ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400 gap-3">
                  <MessageSquare className="w-10 h-10 text-slate-600" />
                  <span>Bu chat'e ait mesaj kaydı bulunamadı</span>
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
                          : 'bg-orange-900/20 border border-orange-700/30 mr-6'
                      }`}
                    >
                      {!msg.is_system && (
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-semibold ${
                            msg.author_type === 'agent' ? 'text-blue-300' : 'text-orange-300'
                          }`}>
                            {msg.author_type === 'agent' ? 'Temsilci' : 'Müşteri'}
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
    </div>
  );
}
