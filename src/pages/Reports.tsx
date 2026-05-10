import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, MessageCircle, Lightbulb, AlertCircle, ChevronDown, ChevronUp, Loader2, Filter, Send, CheckCircle, TrendingUp, Users, Target, AlertTriangle, User, Headphones } from 'lucide-react';
import { getIstanbulDateStartUTC } from '../lib/utils';
import { useNotification } from '../lib/notifications';
import { useBrand } from '../lib/brand';


interface DialogueLine { speaker: 'customer' | 'agent'; text: string; }

function parseCoachingText(suggestion: string): {
  anaSorun: string;
  bullets: string[];
  ornekCevap: string;
  ornekDiyalog: DialogueLine[];
  fallback: string;
} {
  if (!suggestion) return { anaSorun: '', bullets: [], ornekCevap: '', ornekDiyalog: [], fallback: '' };

  const clean = (s: string) => s.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/^#+\s*/gm, '').trim();

  let anaSorun = '';
  let bullets: string[] = [];
  let ornekCevap = '';
  const ornekDiyalog: DialogueLine[] = [];

  const sorunMatch = suggestion.match(/(?:\d+\.\s*)?(?:\*\*)?Ana Sorun(?:\*\*)?\s*:?\s*([\s\S]*?)(?=(?:\d+\.\s*)?(?:\*\*)?Yapılması|$)/i);
  if (sorunMatch) anaSorun = clean(sorunMatch[1]).replace(/\s+/g, ' ').trim();

  const yapMatch = suggestion.match(/(?:\d+\.\s*)?(?:\*\*)?Yapılması Gerekenler?(?:\*\*)?\s*:?\s*([\s\S]*?)(?=(?:\d+\.\s*)?(?:\*\*)?Örnek|$)/i);
  if (yapMatch) {
    bullets = yapMatch[1].split(/\n/).map(s => clean(s).replace(/^[-•]\s*/, '').trim()).filter(s => s.length > 5);
  }

  const cevapMatch = suggestion.match(/(?:\d+\.\s*)?(?:\*\*)?Örnek Cevap(?:\*\*)?\s*:?\s*"?([\s\S]*?)(?="?\s*(?:\d+\.\s*)?(?:\*\*)?Örnek Diyalog|\s*DIYALOG_BASLANGIC|$)/i);
  if (cevapMatch) ornekCevap = clean(cevapMatch[1]).replace(/["]+$/, '').trim();

  const diyalogMatch = suggestion.match(/DIYALOG_BASLANGIC([\s\S]*?)DIYALOG_BITIS/i);
  if (diyalogMatch) {
    const lines = diyalogMatch[1].split(/\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const uyeMatch = line.match(/^(?:Üye|Müşteri|Kullanıcı)\s*:\s*(.*)/i);
      const temsilciMatch = line.match(/^(?:Temsilci|Agent|Operatör)\s*:\s*(.*)/i);
      if (uyeMatch) ornekDiyalog.push({ speaker: 'customer', text: clean(uyeMatch[1]) });
      else if (temsilciMatch) ornekDiyalog.push({ speaker: 'agent', text: clean(temsilciMatch[1]) });
    }
  }

  if (!anaSorun && bullets.length === 0 && !ornekCevap && ornekDiyalog.length === 0) {
    return { anaSorun: '', bullets: [], ornekCevap: '', ornekDiyalog: [], fallback: clean(suggestion) };
  }

  return { anaSorun, bullets, ornekCevap, ornekDiyalog, fallback: '' };
}

function CoachingContent({ text }: { text: string }) {
  const parsed = parseCoachingText(text);

  if (parsed.fallback) {
    return <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{parsed.fallback}</p>;
  }

  return (
    <div className="space-y-4">
      {parsed.anaSorun && (
        <div className="flex gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-semibold text-rose-400 uppercase tracking-wide mb-1">Tespit Edilen Sorun</p>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{parsed.anaSorun}</p>
          </div>
        </div>
      )}

      {parsed.bullets.length > 0 && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            Yapılması Gerekenler
          </p>
          <ul className="space-y-1.5">
            {parsed.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 flex-shrink-0 mt-1.5" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.ornekCevap && (
        <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <p className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wide mb-1.5">Örnek Yaklaşım</p>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed italic border-l-2 border-cyan-500/40 pl-3">{parsed.ornekCevap}</p>
        </div>
      )}

      {parsed.ornekDiyalog.length > 0 && (
        <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-700/40 border-b border-slate-700/50 flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide">Örnek Diyalog</span>
          </div>
          <div className="p-4 space-y-3">
            {parsed.ornekDiyalog.map((line, i) => (
              <div key={i} className={`flex gap-2.5 ${line.speaker === 'agent' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  line.speaker === 'customer' ? 'bg-slate-600/60 border border-slate-500/40' : 'bg-blue-600/30 border border-blue-500/40'
                }`}>
                  {line.speaker === 'customer'
                    ? <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                    : <Headphones className="w-3.5 h-3.5 text-blue-400" />
                  }
                </div>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  line.speaker === 'customer'
                    ? 'bg-slate-700/60 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                    : 'bg-blue-600/20 text-blue-100 border border-blue-500/20 rounded-tr-sm'
                }`}>
                  <span className={`block text-[10px] font-semibold mb-1 ${line.speaker === 'customer' ? 'text-slate-500 dark:text-slate-400' : 'text-blue-400'}`}>
                    {line.speaker === 'customer' ? 'Müşteri' : 'Temsilci'}
                  </span>
                  {line.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ReportData {
  daily: any[];
  weekly: any[];
  monthly: any[];
}

interface ChatMessage {
  author_id: string;
  text: string;
  created_at: string;
}

interface NegativeChat {
  id: string;
  chat_id: string;
  agent_name: string;
  agent_email?: string;
  started_at: string;
  ended_at: string;
  sentiment: string;
  overall_score: number;
  issues_detected: { improvement_areas?: string[] };
  ai_summary: string;
  chat_data: { all_messages?: ChatMessage[] };
  messages?: Array<{ author: { name: string }; text: string }>;
  coaching?: string;
  loadingCoaching?: boolean;
  sent_feedback?: boolean;
  sending_feedback?: boolean;
}

type TabType = 'trends' | 'coaching' | 'improvement';

export default function Reports() {
  const { showSuccess, showError, showInfo, showConfirm } = useNotification();
  const { activeBrand } = useBrand();
  const [reportData, setReportData] = useState<ReportData>({
    daily: [],
    weekly: [],
    monthly: [],
  });
  const [negativeChats, setNegativeChats] = useState<NegativeChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [expandedChat, setExpandedChat] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('trends');

  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');
  const [selectedIssue, setSelectedIssue] = useState<string>('all');
  const [selectedCoachingStatus, setSelectedCoachingStatus] = useState<string>('all');
  const [selectedFeedbackStatus, setSelectedFeedbackStatus] = useState<string>('all');
  const [selectedScoreRange, setSelectedScoreRange] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });

  const [improvementReports, setImprovementReports] = useState<any[]>([]);
  const [loadingImprovements, setLoadingImprovements] = useState(false);
  const [selectedImprovementAgent, setSelectedImprovementAgent] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [activeBrand?.brand_id]);

  const parseScore = (score: number | string): number => {
    if (typeof score === 'string') {
      const parsed = parseFloat(score);
      return isNaN(parsed) ? 0 : parsed;
    }
    return score;
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (remainingSeconds === 0) {
      return `${minutes}dk`;
    }
    return `${minutes}dk ${remainingSeconds}s`;
  };

  const loadData = async () => {
    try {
      const thirtyDaysAgoUTC = getIstanbulDateStartUTC(30);

      const { data: dailyStatsData, error: dailyStatsError } = await supabase
        .rpc('get_reports_daily_stats', { p_days_ago: 30, p_brand_id: activeBrand?.brand_id });

      if (dailyStatsError) {
        console.error('Error loading daily stats:', dailyStatsError);
        throw dailyStatsError;
      }

      const dailyArray = (dailyStatsData || []).map((day: any) => ({
        date: day.date,
        total_chats: Number(day.total_chats),
        average_score: parseFloat(day.average_score || 0),
        average_response_time: parseFloat(day.average_response_time || 0),
        average_resolution_time: parseFloat(day.average_resolution_time || 0),
      }));

      setReportData({
        daily: dailyArray || [],
        weekly: dailyArray || [],
        monthly: dailyArray || [],
      });

      let chatsQuery = supabase
        .from('chat_analysis')
        .select(`
          id,
          chat_id,
          overall_score,
          sentiment,
          issues_detected,
          ai_summary,
          analysis_date,
          coaching_suggestion,
          chats!inner (
            agent_name,
            created_at,
            ended_at,
            chat_data
          )
        `)
        .or('sentiment.eq.negative,overall_score.lt.60')
        .gte('analysis_date', thirtyDaysAgoUTC)
        .order('analysis_date', { ascending: false })
        .limit(5000);
      if (activeBrand?.brand_id) chatsQuery = chatsQuery.eq('brand_id', activeBrand.brand_id);
      const { data: chatsData } = await chatsQuery;

      let feedbacksQuery = supabase
        .from('coaching_feedbacks')
        .select('chat_id');
      if (activeBrand?.brand_id) feedbacksQuery = feedbacksQuery.eq('brand_id', activeBrand.brand_id);
      const { data: sentFeedbacks } = await feedbacksQuery;

      const sentChatIds = new Set((sentFeedbacks || []).map(f => f.chat_id));

      const generateAgentEmail = (agentName: string): string => {
        return agentName.toLowerCase().replace(/\s+/g, '.') + '@company.com';
      };

      const processedChats = (chatsData || []).map((item: any) => {
        const agentName = item.chats?.agent_name || 'Unknown';
        const chatData = item.chats?.chat_data || {};
        const fullChatData = chatData.properties?.full_chat_data || chatData;
        const allMessages = fullChatData.all_messages || [];

        const chatMessages = allMessages
          .filter((msg: any) => msg.text && msg.text.trim() !== '' && msg.type === 'message')
          .map((msg: any) => ({
            author: { name: msg.author_id && msg.author_id.includes('@') ? agentName : 'Müşteri' },
            text: msg.text.trim()
          }));

        return {
          id: item.id,
          chat_id: item.chat_id,
          overall_score: parseFloat(item.overall_score || 0),
          sentiment: item.sentiment,
          issues_detected: item.issues_detected || {},
          ai_summary: item.ai_summary,
          agent_name: agentName,
          agent_email: generateAgentEmail(agentName),
          started_at: item.chats?.created_at,
          ended_at: item.chats?.ended_at,
          chat_data: chatData,
          messages: chatMessages,
          coaching: item.coaching_suggestion,
          sent_feedback: sentChatIds.has(item.id),
        };
      });

      setNegativeChats(processedChats);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWeekNumber = (date: Date): string => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNumber}`;
  };

  const getMonthKey = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const getTrendData = () => {
    const data = timeRange === 'daily' ? reportData.daily :
                 timeRange === 'weekly' ? reportData.weekly :
                 reportData.monthly;

    console.log(`=== GET TREND DATA (${timeRange}) ===`);
    console.log('Input data length:', data.length);

    if (timeRange === 'daily') {
      const result = data.map((item: any) => ({
        date: item.date,
        analysisScore: Math.round(item.average_score || 0),
        personnelScore: Math.round(item.average_score || 0),
        responseTime: Math.round(item.average_response_time || 0),
        resolutionTime: Math.round(item.average_resolution_time || 0),
        totalChats: item.total_chats || 0,
      })).sort((a: any, b: any) => b.date.localeCompare(a.date));
      console.log('Daily result (first 5):', result.slice(0, 5));
      return result;
    }

    const grouped = data.reduce((acc: any, curr: any) => {
      let groupKey: string;
      const dateObj = new Date(curr.date);

      if (timeRange === 'weekly') {
        groupKey = getWeekNumber(dateObj);
      } else {
        groupKey = getMonthKey(dateObj);
      }

      if (!acc[groupKey]) {
        acc[groupKey] = {
          date: groupKey,
          totalPersonnelScore: 0,
          personnelCount: 0,
          totalResponseTime: 0,
          responseTimeCount: 0,
          totalResolutionTime: 0,
          resolutionTimeCount: 0,
          totalChats: 0,
        };
      }

      console.log(`Grouping ${curr.date} into ${groupKey}: adding ${curr.total_chats} chats`);

      if (curr.average_score > 0 && curr.total_chats > 0) {
        acc[groupKey].totalPersonnelScore += parseScore(curr.average_score) * curr.total_chats;
        acc[groupKey].personnelCount += curr.total_chats;
      }

      if (curr.total_chats > 0) {
        acc[groupKey].totalChats += curr.total_chats;
      }

      if (curr.average_response_time > 0) {
        acc[groupKey].totalResponseTime += curr.average_response_time;
        acc[groupKey].responseTimeCount++;
      }

      if (curr.average_resolution_time > 0) {
        acc[groupKey].totalResolutionTime += curr.average_resolution_time;
        acc[groupKey].resolutionTimeCount++;
      }

      return acc;
    }, {});

    const result = Object.values(grouped).map((item: any) => {
      const personnelScore = item.personnelCount > 0 ? Math.round(item.totalPersonnelScore / item.personnelCount) : 0;
      return {
        date: item.date,
        analysisScore: personnelScore,
        personnelScore: personnelScore,
        responseTime: item.responseTimeCount > 0 ? Math.round(item.totalResponseTime / item.responseTimeCount) : 0,
        resolutionTime: item.resolutionTimeCount > 0 ? Math.round(item.totalResolutionTime / item.resolutionTimeCount) : 0,
        totalChats: item.totalChats,
      };
    }).sort((a: any, b: any) => b.date.localeCompare(a.date));
    console.log(`Grouped ${timeRange} result (first 5):`, result.slice(0, 5));
    return result;
  };

  const getCoachingSuggestion = async (chat: NegativeChat): Promise<string | null> => {
    try {
      setNegativeChats(prev =>
        prev.map(c => c.id === chat.id ? { ...c, loadingCoaching: true } : c)
      );

      let formattedMessages: Array<{ author: { name: string }; text: string }> = [];

      if (chat.messages && chat.messages.length > 0) {
        formattedMessages = chat.messages;
      } else {
        const chatData: any = chat.chat_data || {};
        const fullChatData = chatData.properties?.full_chat_data || chatData;
        const allMessages = fullChatData.all_messages || [];
        formattedMessages = allMessages
          .filter((msg: any) => msg.text && msg.text.trim() !== '' && msg.type === 'message')
          .map((msg: any) => ({
            author: { name: msg.author_id && msg.author_id.includes('@') ? chat.agent_name : 'Müşteri' },
            text: msg.text.trim()
          }));
      }

      if (formattedMessages.length === 0) {
        let dbMsgsQuery = supabase
          .from('chat_messages')
          .select('author_type, text')
          .eq('chat_id', chat.chat_id)
          .eq('is_system', false)
          .order('created_at', { ascending: true })
          .limit(100);
        if (activeBrand?.brand_id) dbMsgsQuery = dbMsgsQuery.eq('brand_id', activeBrand.brand_id);
        const { data: dbMsgs } = await dbMsgsQuery;
        if (dbMsgs && dbMsgs.length > 0) {
          formattedMessages = dbMsgs
            .filter((m: any) => m.text?.trim())
            .map((m: any) => ({
              author: { name: m.author_type === 'agent' ? chat.agent_name : 'Müşteri' },
              text: m.text.trim()
            }));
        }
      }

      if (formattedMessages.length === 0) {
        throw new Error('Chat mesajları bulunamadı');
      }

      const requestBody = {
        chatId: chat.chat_id,
        chatAnalysisId: chat.id,
        messages: formattedMessages,
        brand_id: activeBrand?.brand_id,
        analysis: {
          sentiment: chat.sentiment,
          score: chat.overall_score,
          issues: chat.issues_detected?.improvement_areas || [],
          summary: chat.ai_summary,
        },
      };

      console.log('Sending coaching request:', {
        chatId: chat.chat_id,
        chatAnalysisId: chat.id,
        messageCount: formattedMessages.length,
        firstMessage: formattedMessages[0],
      });

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-coaching`;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = {
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      };

      const response = await Promise.race([
        fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout after 90 seconds')), 90000)
        )
      ]) as Response;

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', response.status, errorText);
        throw new Error(`API hatası: ${response.status} - ${errorText.substring(0, 100)}`);
      }

      const result = await response.json();
      console.log('API Response for chat', chat.id, ':', {
        hasSuggestion: !!result.suggestion,
        saved: result.saved,
        suggestionLength: result.suggestion?.length,
        fullResult: result
      });

      if (!result.suggestion) {
        console.error('No suggestion in API response:', result);
        throw new Error('API yanıtı beklenen formatta değil');
      }

      if (!result.saved) {
        console.warn('Coaching suggestion generated but not saved to database');
      }

      setNegativeChats(prev =>
        prev.map(c =>
          c.id === chat.id
            ? { ...c, coaching: result.suggestion, loadingCoaching: false, messages: formattedMessages }
            : c
        )
      );
      return result.suggestion as string;
    } catch (error: any) {
      console.error('Error generating coaching for chat:', chat.id, error);
      setNegativeChats(prev =>
        prev.map(c =>
          c.id === chat.id
            ? { ...c, coaching: undefined, loadingCoaching: false }
            : c
        )
      );
      throw error;
    }
  };

  const sendCoachingFeedback = async (chat: NegativeChat) => {
    if (!chat.coaching || !chat.agent_email) return;

    try {
      setNegativeChats(prev =>
        prev.map(c => c.id === chat.id ? { ...c, sending_feedback: true } : c)
      );

      const { data: { user } } = await supabase.auth.getUser();

      const insertData: any = {
        chat_id: chat.id,
        agent_name: chat.agent_name,
        agent_email: chat.agent_email,
        coaching_suggestion: chat.coaching,
        sent_by: user?.id,
      };
      if (activeBrand?.brand_id) insertData.brand_id = activeBrand.brand_id;
      const { error } = await supabase
        .from('coaching_feedbacks')
        .insert(insertData);

      if (error) throw error;

      setNegativeChats(prev =>
        prev.map(c => c.id === chat.id
          ? { ...c, sent_feedback: true, sending_feedback: false }
          : c
        )
      );
    } catch (error) {
      console.error('Error sending coaching feedback:', error);
      setNegativeChats(prev =>
        prev.map(c => c.id === chat.id ? { ...c, sending_feedback: false } : c)
      );
      showError('Koçluk önerisi gönderilirken bir hata oluştu.');
    }
  };

  const bulkGenerateCoaching = async () => {
    const chatsToGenerate = filteredChats.filter(c => !c.coaching && !c.loadingCoaching);

    if (chatsToGenerate.length === 0) {
      showInfo('Tüm görünür chatler için koçluk önerisi zaten oluşturulmuş!');
      return;
    }

    showConfirm(
      'Toplu Koçluk Önerisi Oluştur',
      `${chatsToGenerate.length} chat için koçluk önerisi oluşturulacak. Devam etmek istiyor musunuz?`,
      async () => {
        await executeBulkGeneration(chatsToGenerate);
      },
      'Oluştur',
      'İptal'
    );
  };

  const executeBulkGeneration = async (chatsToGenerate: NegativeChat[]) => {
    const BATCH_SIZE = 10;
    setBulkGenerating(true);
    setBulkProgress({ current: 0, total: chatsToGenerate.length, success: 0, failed: 0 });

    let successCount = 0;
    let failedCount = 0;
    let sentCount = 0;

    const { data: { user } } = await supabase.auth.getUser();

    for (let batchStart = 0; batchStart < chatsToGenerate.length; batchStart += BATCH_SIZE) {
      const batch = chatsToGenerate.slice(batchStart, batchStart + BATCH_SIZE);
      const generatedInBatch: { chat: NegativeChat; suggestion: string }[] = [];

      for (let i = 0; i < batch.length; i++) {
        const chat = batch[i];
        const globalIdx = batchStart + i;

        try {
          const suggestion = await getCoachingSuggestion(chat);
          if (suggestion) {
            generatedInBatch.push({ chat, suggestion });
            successCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
          console.error(`Error generating coaching for chat ${chat.id}:`, error);
        }

        setBulkProgress({
          current: globalIdx + 1,
          total: chatsToGenerate.length,
          success: successCount,
          failed: failedCount,
        });

        if (i < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      for (const { chat, suggestion } of generatedInBatch) {
        if (!chat.agent_email) continue;
        try {
          const insertData: any = {
            chat_id: chat.id,
            agent_name: chat.agent_name,
            agent_email: chat.agent_email,
            coaching_suggestion: suggestion,
            sent_by: user?.id,
          };
          if (activeBrand?.brand_id) insertData.brand_id = activeBrand.brand_id;
          const { error } = await supabase.from('coaching_feedbacks').insert(insertData);
          if (!error) {
            sentCount++;
            setNegativeChats(prev =>
              prev.map(c => c.id === chat.id ? { ...c, sent_feedback: true } : c)
            );
          }
        } catch (err) {
          console.error(`Error sending feedback for chat ${chat.id}:`, err);
        }
      }
    }

    setBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0, success: 0, failed: 0 });

    await loadData();

    const resultMessage = `Toplam ${chatsToGenerate.length} chat işlendi:\n✓ Öneri Oluşturuldu: ${successCount}\n✓ İletildi: ${sentCount}\n✗ Başarısız: ${failedCount}`;
    if (successCount > 0) {
      showSuccess(resultMessage);
    } else {
      showError(resultMessage);
    }
  };

  const bulkSendFeedback = async () => {
    const chatsToSend = filteredChats.filter(c => c.coaching && !c.sent_feedback && !c.sending_feedback);

    if (chatsToSend.length === 0) {
      showInfo('İletilecek koçluk önerisi bulunamadı!');
      return;
    }

    showConfirm(
      'Koçluk Önerilerini İlet',
      `${chatsToSend.length} koçluk önerisi personele iletilecek. Devam etmek istiyor musunuz?`,
      async () => {
        await executeBulkSendFeedback(chatsToSend);
      },
      'İlet',
      'İptal'
    );
  };

  const executeBulkSendFeedback = async (chatsToSend: NegativeChat[]) => {

    setBulkSending(true);
    setBulkProgress({ current: 0, total: chatsToSend.length, success: 0, failed: 0 });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < chatsToSend.length; i++) {
      const chat = chatsToSend[i];

      try {
        await sendCoachingFeedback(chat);

        // Verify that the feedback was saved
        let verifyFeedbackQuery = supabase
          .from('coaching_feedbacks')
          .select('id')
          .eq('chat_id', chat.id);
        if (activeBrand?.brand_id) verifyFeedbackQuery = verifyFeedbackQuery.eq('brand_id', activeBrand.brand_id);
        const { data: verifyData } = await verifyFeedbackQuery.maybeSingle();

        if (verifyData) {
          successCount++;
        } else {
          failedCount++;
          console.error(`Chat ${chat.id} feedback not saved to database`);
        }
      } catch (error) {
        failedCount++;
        console.error(`Error sending feedback for chat ${chat.id}:`, error);
      }

      setBulkProgress({
        current: i + 1,
        total: chatsToSend.length,
        success: successCount,
        failed: failedCount
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setBulkSending(false);
    setBulkProgress({ current: 0, total: 0, success: 0, failed: 0 });

    // Reload data to show updated feedback status
    await loadData();

    const resultMessage = `Toplam ${chatsToSend.length} öneri işlendi:\n✓ İletildi: ${successCount}\n✗ Başarısız: ${failedCount}`;
    if (successCount > 0) {
      showSuccess(resultMessage);
    } else {
      showError(resultMessage);
    }
  };

  const loadImprovementReport = async (agentEmail: string) => {
    if (!agentEmail) return;

    setLoadingImprovements(true);
    try {
      const { data, error } = await supabase.rpc('get_personnel_improvement_report', {
        p_agent_email: agentEmail,
        p_days_before: 30,
        p_days_after: 30
      });

      if (error) throw error;

      if (data && data.has_data) {
        setImprovementReports([data]);
      } else {
        setImprovementReports([]);
      }
    } catch (error) {
      console.error('Error loading improvement report:', error);
      setImprovementReports([]);
    } finally {
      setLoadingImprovements(false);
    }
  };

  useEffect(() => {
    if (selectedImprovementAgent) {
      loadImprovementReport(selectedImprovementAgent);
    }
  }, [selectedImprovementAgent, activeBrand?.brand_id]);

  const toggleChat = async (chatId: string) => {
    if (expandedChat === chatId) {
      setExpandedChat(null);
    } else {
      setExpandedChat(chatId);
      const chat = negativeChats.find(c => c.id === chatId);
      if (chat && !chat.coaching && !chat.loadingCoaching) {
        try {
          await getCoachingSuggestion(chat);
        } catch (error) {
          console.error('Error in toggleChat:', error);
          // Error is already handled in getCoachingSuggestion
        }
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSentimentColor = (sentiment: string, score: number) => {
    if (sentiment === 'negative' || score < 30) return 'text-rose-400 bg-rose-500/15 border-rose-500/30';
    if (score < 40) return 'text-orange-400 bg-orange-500/15 border-orange-500/30';
    if (score < 60) return 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    if (score < 70) return 'text-blue-400 bg-blue-500/15 border-blue-500/30';
    if (score < 90) return 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30';
    return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
  };

  const getSentimentLabel = (sentiment: string) => {
    if (sentiment === 'negative') return 'Olumsuz';
    if (sentiment === 'neutral') return 'Nötr';
    return 'Olumlu';
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400 bg-emerald-500/15';
    if (score >= 70) return 'text-cyan-400 bg-cyan-500/15';
    if (score >= 60) return 'text-blue-400 bg-blue-500/15';
    if (score >= 40) return 'text-amber-400 bg-amber-500/15';
    if (score >= 30) return 'text-orange-400 bg-orange-500/15';
    return 'text-rose-400 bg-rose-500/15';
  };

  const getIssues = (chat: NegativeChat): string[] => {
    return chat.issues_detected?.improvement_areas || [];
  };

  const uniqueAgents = useMemo(() => {
    const agents = new Set(negativeChats.map(chat => chat.agent_name));
    return Array.from(agents).sort();
  }, [negativeChats]);

  const agentsWithCoaching = useMemo(() => {
    const agents = new Map<string, string>();
    negativeChats.forEach(chat => {
      if (chat.agent_email && chat.sent_feedback) {
        agents.set(chat.agent_email, chat.agent_name);
      }
    });
    return Array.from(agents.entries()).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [negativeChats]);

  const allIssues = useMemo(() => {
    const issues = new Set<string>();
    negativeChats.forEach(chat => {
      getIssues(chat).forEach(issue => issues.add(issue));
    });
    return Array.from(issues).sort();
  }, [negativeChats]);

  const filteredChats = useMemo(() => {
    return negativeChats.filter(chat => {
      if (selectedAgent !== 'all' && chat.agent_name !== selectedAgent) {
        return false;
      }

      if (selectedDateRange === 'custom') {
        const chatDate = new Date(chat.started_at);

        if (customStartDate) {
          const startDate = new Date(customStartDate);
          startDate.setHours(0, 0, 0, 0);
          if (chatDate < startDate) return false;
        }

        if (customEndDate) {
          const endDate = new Date(customEndDate);
          endDate.setHours(23, 59, 59, 999);
          if (chatDate > endDate) return false;
        }
      } else if (selectedDateRange !== 'all') {
        const chatDate = new Date(chat.started_at);
        const now = new Date();
        const daysAgo = Math.floor((now.getTime() - chatDate.getTime()) / (1000 * 60 * 60 * 24));

        if (selectedDateRange === '7' && daysAgo > 7) return false;
        if (selectedDateRange === '14' && daysAgo > 14) return false;
        if (selectedDateRange === '30' && daysAgo > 30) return false;
      }

      if (selectedIssue !== 'all') {
        const issues = getIssues(chat);
        if (!issues.includes(selectedIssue)) return false;
      }

      if (selectedCoachingStatus !== 'all') {
        if (selectedCoachingStatus === 'generated' && !chat.coaching) return false;
        if (selectedCoachingStatus === 'not_generated' && chat.coaching) return false;
      }

      if (selectedFeedbackStatus !== 'all') {
        if (selectedFeedbackStatus === 'sent' && !chat.sent_feedback) return false;
        if (selectedFeedbackStatus === 'not_sent' && chat.sent_feedback) return false;
      }

      if (selectedScoreRange !== 'all') {
        const s = chat.overall_score;
        if (selectedScoreRange === '0-29' && (s < 0 || s > 29)) return false;
        if (selectedScoreRange === '30-39' && (s < 30 || s > 39)) return false;
        if (selectedScoreRange === '40-59' && (s < 40 || s > 59)) return false;
        if (selectedScoreRange === '60-69' && (s < 60 || s > 69)) return false;
        if (selectedScoreRange === '70-89' && (s < 70 || s > 89)) return false;
        if (selectedScoreRange === '90-100' && s < 90) return false;
      }

      return true;
    });
  }, [negativeChats, selectedAgent, selectedDateRange, selectedIssue, selectedCoachingStatus, selectedFeedbackStatus, selectedScoreRange, customStartDate, customEndDate]);

  const trendData = useMemo(() => {
    const data = getTrendData();
    console.log('=== TREND DATA RESULT ===');
    console.log('Time Range:', timeRange);
    console.log('Trend Data (first 5):', data.slice(0, 5));
    console.log('Total items:', data.length);
    const totalChatsSum = data.reduce((sum: number, item: any) => sum + (item.totalChats || 0), 0);
    console.log('Sum of all totalChats:', totalChatsSum);
    console.log('Report Data Daily (first 5):', reportData.daily.slice(0, 5));
    return data;
  }, [reportData, timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Raporlar & Analizler</h1>
          <p className="text-slate-700 dark:text-slate-200 mt-1">Performans takibi, trend analizi ve gelişim raporları</p>
        </div>

        <div className="border-b border-slate-600/50">
          <nav className="-mb-px flex gap-2">
            <button
              onClick={() => setActiveTab('trends')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'trends'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:text-white hover:border-slate-600/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Trend Analizi
              </div>
            </button>
            <button
              onClick={() => setActiveTab('coaching')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'coaching'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:text-white hover:border-slate-600/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Koçluk Önerileri
                {negativeChats.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                    {negativeChats.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('improvement')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'improvement'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:text-white hover:border-slate-600/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Gelişim Takibi
                {agentsWithCoaching.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-full">
                    {agentsWithCoaching.length}
                  </span>
                )}
              </div>
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'trends' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <div className="flex gap-2">
              <button
                onClick={() => setTimeRange('daily')}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  timeRange === 'daily'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-white/15 hover:border-blue-500/50 hover:bg-slate-200 dark:bg-white/10'
                }`}
              >
                Günlük
              </button>
              <button
                onClick={() => setTimeRange('weekly')}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  timeRange === 'weekly'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-white/15 hover:border-blue-500/50 hover:bg-slate-200 dark:bg-white/10'
                }`}
              >
                Haftalık
              </button>
              <button
                onClick={() => setTimeRange('monthly')}
                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  timeRange === 'monthly'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-white/15 hover:border-blue-500/50 hover:bg-slate-200 dark:bg-white/10'
                }`}
              >
                Aylık
              </button>
            </div>
          </div>

          <div className="glass-effect rounded-xl shadow-lg p-6">
            {trendData.length === 0 ? (
              <div className="text-center py-16">
                <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-700 dark:text-slate-200" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Veri Bulunamadı</h3>
                <p className="text-slate-700 dark:text-slate-200">Bu dönem için henüz analiz verisi bulunmuyor.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trendData.map((item: any) => {
                  let displayDate = item.date;
                  if (timeRange === 'daily') {
                    displayDate = new Date(item.date).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
                  } else if (timeRange === 'weekly') {
                    displayDate = `Hafta ${item.date}`;
                  } else {
                    const [year, month] = item.date.split('-');
                    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                                        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                    displayDate = `${monthNames[parseInt(month) - 1]} ${year}`;
                  }

                  return (
                    <div key={item.date} className="bg-slate-100 dark:bg-white/5 rounded-xl p-5 border border-slate-300 dark:border-white/10 hover:border-white/20 hover:bg-slate-200 dark:bg-white/8 transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-500/15 rounded-lg">
                            <Calendar className="w-5 h-5 text-blue-400" />
                          </div>
                          <div>
                            <div className="text-lg font-bold text-slate-900 dark:text-white">{displayDate}</div>
                            <div className="text-sm text-slate-700 dark:text-slate-200">{item.totalChats} toplam görüşme</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className={`p-4 rounded-lg ${getScoreColor(item.analysisScore)}`}>
                          <div className="text-xs font-medium mb-1 opacity-75">Analiz Skoru</div>
                          <div className="text-2xl font-bold">
                            {item.analysisScore}
                          </div>
                          <div className="text-xs opacity-75 mt-1">/ 100</div>
                        </div>

                        <div className={`p-4 rounded-lg ${getScoreColor(item.personnelScore)}`}>
                          <div className="text-xs font-medium mb-1 opacity-75">Personel Skoru</div>
                          <div className="text-2xl font-bold">
                            {item.personnelScore}
                          </div>
                          <div className="text-xs opacity-75 mt-1">/ 100</div>
                        </div>

                        <div className="p-4 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                          <div className="text-xs font-medium mb-1 opacity-75">Ort. Yanıt Süresi</div>
                          <div className="text-2xl font-bold text-slate-900 dark:text-white">
                            {formatTime(item.responseTime)}
                          </div>
                        </div>

                        <div className="p-4 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                          <div className="text-xs font-medium mb-1 opacity-75">Ort. Çözüm Süresi</div>
                          <div className="text-2xl font-bold text-slate-900 dark:text-white">
                            {formatTime(item.resolutionTime)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'coaching' && (
        <div className="space-y-6">
          {negativeChats.length === 0 ? (
            <div className="glass-effect rounded-xl shadow-lg p-12">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Mükemmel Performans!</h3>
                <p className="text-slate-700 dark:text-slate-200">Son 30 günde olumsuz değerlendirilen chat bulunamadı.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="glass-effect rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500/15 rounded-lg">
                    <Filter className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Filtreler</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Personel</label>
                    <select
                      value={selectedAgent}
                      onChange={(e) => setSelectedAgent(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-600 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&>option]:bg-slate-100 dark:bg-slate-800 [&>option]:text-slate-900 dark:text-white"
                    >
                      <option value="all">Tümü ({negativeChats.length})</option>
                      {uniqueAgents.map(agent => (
                        <option key={agent} value={agent}>
                          {agent} ({negativeChats.filter(c => c.agent_name === agent).length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Tarih Aralığı</label>
                    <select
                      value={selectedDateRange}
                      onChange={(e) => setSelectedDateRange(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-600 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&>option]:bg-slate-100 dark:bg-slate-800 [&>option]:text-slate-900 dark:text-white"
                    >
                      <option value="all">Tüm Zamanlar</option>
                      <option value="7">Son 7 Gün</option>
                      <option value="14">Son 14 Gün</option>
                      <option value="30">Son 30 Gün</option>
                      <option value="custom">Özel Tarih Aralığı</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Sorun Tipi</label>
                    <select
                      value={selectedIssue}
                      onChange={(e) => setSelectedIssue(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-600 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&>option]:bg-slate-100 dark:bg-slate-800 [&>option]:text-slate-900 dark:text-white"
                    >
                      <option value="all">Tüm Sorunlar</option>
                      {allIssues.map(issue => (
                        <option key={issue} value={issue}>
                          {issue}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Koçluk Önerisi Durumu</label>
                    <select
                      value={selectedCoachingStatus}
                      onChange={(e) => setSelectedCoachingStatus(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-600 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&>option]:bg-slate-100 dark:bg-slate-800 [&>option]:text-slate-900 dark:text-white"
                    >
                      <option value="all">Tümü</option>
                      <option value="generated">Öneri Oluşturulmuş ({negativeChats.filter(c => c.coaching).length})</option>
                      <option value="not_generated">Öneri Oluşturulmamış ({negativeChats.filter(c => !c.coaching).length})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">İletim Durumu</label>
                    <select
                      value={selectedFeedbackStatus}
                      onChange={(e) => setSelectedFeedbackStatus(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-600 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&>option]:bg-slate-100 dark:bg-slate-800 [&>option]:text-slate-900 dark:text-white"
                    >
                      <option value="all">Tümü</option>
                      <option value="sent">İletilmiş ({negativeChats.filter(c => c.sent_feedback).length})</option>
                      <option value="not_sent">İletilmemiş ({negativeChats.filter(c => !c.sent_feedback).length})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Puan Aralığı</label>
                    <select
                      value={selectedScoreRange}
                      onChange={(e) => setSelectedScoreRange(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-600 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&>option]:bg-slate-100 dark:bg-slate-800 [&>option]:text-slate-900 dark:text-white"
                    >
                      <option value="all">Tüm Puanlar</option>
                      <option value="0-29">Kritik — 0-29</option>
                      <option value="30-39">Dikkat — 30-39</option>
                      <option value="40-59">Olumsuz — 40-59</option>
                      <option value="60-69">Orta — 60-69</option>
                      <option value="70-89">İyi — 70-89</option>
                      <option value="90-100">Mükemmel — 90-100</option>
                    </select>
                  </div>
                </div>

                {selectedDateRange === 'custom' && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Başlangıç Tarihi</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Bitiş Tarihi</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                {(selectedAgent !== 'all' || selectedDateRange !== 'all' || selectedIssue !== 'all' || selectedCoachingStatus !== 'all' || selectedFeedbackStatus !== 'all' || selectedScoreRange !== 'all') && (
                  <div className="mt-4 flex items-center justify-between p-3 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-300 dark:border-white/10">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {filteredChats.length} sonuç gösteriliyor
                    </span>
                    <button
                      onClick={() => {
                        setSelectedAgent('all');
                        setSelectedDateRange('all');
                        setSelectedIssue('all');
                        setSelectedCoachingStatus('all');
                        setSelectedFeedbackStatus('all');
                        setSelectedScoreRange('all');
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Filtreleri Temizle
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-amber-400" />
                        Toplu Koçluk Önerisi Oluştur
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Filtrelenmiş tüm chatler için AI koçluk önerileri oluştur
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={bulkGenerateCoaching}
                    disabled={bulkGenerating || filteredChats.filter(c => !c.coaching).length === 0}
                    className="w-full flex flex-col items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-medium rounded-lg transition-colors shadow-sm"
                  >
                    {bulkGenerating ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{bulkProgress.current}/{bulkProgress.total} Oluşturuluyor ve İletiliyor...</span>
                        </div>
                        {bulkProgress.current > 0 && (
                          <div className="text-xs opacity-90">
                            ✓ {bulkProgress.success} Başarılı • ✗ {bulkProgress.failed} Hata
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Lightbulb className="w-5 h-5" />
                        {filteredChats.filter(c => !c.coaching).length} Chat için Öneri Oluştur ve İlet
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                        <Send className="w-5 h-5 text-emerald-400" />
                        Toplu Öneri İletimi
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Oluşturulmuş tüm önerileri personele ilet
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={bulkSendFeedback}
                    disabled={bulkSending || filteredChats.filter(c => c.coaching && !c.sent_feedback).length === 0}
                    className="w-full flex flex-col items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium rounded-lg transition-colors shadow-sm"
                  >
                    {bulkSending ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{bulkProgress.current}/{bulkProgress.total} İletiliyor...</span>
                        </div>
                        {bulkProgress.current > 0 && (
                          <div className="text-xs opacity-90">
                            ✓ {bulkProgress.success} İletildi • ✗ {bulkProgress.failed} Hata
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        {filteredChats.filter(c => c.coaching && !c.sent_feedback).length} Öneriyi İlet
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <strong className="font-semibold">Nasıl Kullanılır:</strong> Bu bölüm, müşteri memnuniyetsizliği yaşanan görüşmeleri listeler.
                    Her görüşme için AI destekli iyileştirme önerileri oluşturabilir ve personele gönderebilirsiniz.
                    Toplu işlem butonları ile tüm görünür chatler için aynı anda işlem yapabilirsiniz.
                  </div>
                </div>
              </div>

              {filteredChats.length === 0 ? (
                <div className="glass-effect rounded-xl shadow-lg p-12">
                  <div className="text-center">
                    <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-700 dark:text-slate-200" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Sonuç Bulunamadı</h3>
                    <p className="text-slate-700 dark:text-slate-200 mb-4">Seçtiğiniz filtrelere uygun chat bulunamadı.</p>
                    <button
                      onClick={() => {
                        setSelectedAgent('all');
                        setSelectedDateRange('all');
                        setSelectedIssue('all');
                        setSelectedCoachingStatus('all');
                        setSelectedFeedbackStatus('all');
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Filtreleri Temizle
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredChats.map((chat) => {
                    const isExpanded = expandedChat === chat.id;
                    return (
                      <div
                        key={chat.id}
                        className="glass-effect rounded-xl shadow-lg overflow-hidden hover:shadow-lg transition-shadow"
                      >
                        <button
                          onClick={() => toggleChat(chat.id)}
                          className="w-full p-5 text-left hover:bg-slate-100 dark:bg-white/5 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                  <span className="font-bold text-slate-900 dark:text-white">{chat.agent_name}</span>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSentimentColor(chat.sentiment, chat.overall_score)}`}>
                                  {getSentimentLabel(chat.sentiment)} • {Math.round(chat.overall_score)}/100
                                </span>
                                <span className="text-xs text-slate-100 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(chat.started_at)}
                                </span>
                              </div>

                              {chat.ai_summary && (
                                <p className="text-sm text-slate-900 dark:text-white mb-3 leading-relaxed">{chat.ai_summary}</p>
                              )}

                              {getIssues(chat).length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {getIssues(chat).slice(0, 4).map((issue, idx) => (
                                    <span key={idx} className="text-xs bg-red-500/15 text-red-400 border border-red-500/20 px-3 py-1 rounded-full font-medium">
                                      {issue}
                                    </span>
                                  ))}
                                  {getIssues(chat).length > 4 && (
                                    <span className="text-xs text-slate-100 font-medium">+{getIssues(chat).length - 4} daha</span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex-shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="w-6 h-6 text-slate-700 dark:text-slate-200" />
                              ) : (
                                <ChevronDown className="w-6 h-6 text-slate-700 dark:text-slate-200" />
                              )}
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-600/50 p-5 bg-gradient-to-br from-slate-800/30 to-blue-50/30 space-y-5">
                            {chat.messages && chat.messages.length > 0 && (
                              <div>
                                <h4 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                                  <MessageCircle className="w-5 h-5 text-blue-600" />
                                  Chat Görüşmesi
                                </h4>
                                <div className="bg-slate-100/60 dark:bg-slate-800/30 rounded-lg border border-slate-600/50 p-4 max-h-72 overflow-y-auto space-y-3">
                                  {chat.messages.map((msg, idx) => (
                                    <div key={idx} className="text-sm">
                                      <span className="font-semibold text-slate-900 dark:text-white">{msg.author.name}:</span>
                                      <span className="text-slate-900 dark:text-white ml-2">{msg.text}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className={`rounded-xl border p-5 ${
                              chat.sent_feedback
                                ? 'bg-emerald-500/10 border-emerald-500/25'
                                : 'bg-blue-500/10 border-blue-500/25'
                            }`}>
                              <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-lg">
                                  {chat.sent_feedback ? (
                                    <>
                                      <div className="p-2 bg-emerald-500/15 rounded-lg">
                                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                                      </div>
                                      AI Koçluk Önerileri
                                      <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 px-2 py-1 rounded-full">İletildi</span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="p-2 bg-blue-500/15 rounded-lg">
                                        <Lightbulb className="w-5 h-5 text-blue-400" />
                                      </div>
                                      AI Koçluk Önerileri
                                    </>
                                  )}
                                </h4>

                                {chat.coaching && !chat.sent_feedback && (
                                  <button
                                    onClick={() => sendCoachingFeedback(chat)}
                                    disabled={chat.sending_feedback}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                                  >
                                    {chat.sending_feedback ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Gönderiliyor...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-4 h-4" />
                                        Önerileri İlet
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>

                              {chat.loadingCoaching ? (
                                <div className="flex items-center gap-3 text-blue-600 py-4">
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  <span className="text-sm font-medium">AI analiz yapıyor ve öneri hazırlıyor...</span>
                                </div>
                              ) : chat.coaching ? (
                                <>
                                  <CoachingContent text={chat.coaching} />
                                  {chat.sent_feedback && (
                                    <div className="mt-4 pt-4 border-t border-emerald-500/25">
                                      <p className="text-sm text-emerald-400 flex items-center gap-2 font-medium">
                                        <CheckCircle className="w-4 h-4" />
                                        Bu öneriler personele iletildi. Gelişim takibi "Gelişim Takibi" sekmesinden yapılabilir.
                                      </p>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-sm text-slate-100">Öneri yükleniyor...</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'improvement' && (
        <div className="space-y-6">
          {agentsWithCoaching.length === 0 ? (
            <div className="glass-effect rounded-xl shadow-lg p-12">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-100 rounded-full mb-4">
                  <Target className="w-10 h-10 text-slate-700 dark:text-slate-200" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Henüz Gelişim Verisi Yok</h3>
                <p className="text-slate-700 dark:text-slate-200 mb-4">Personel gelişimini takip etmek için öncelikle koçluk önerileri göndermelisiniz.</p>
                <button
                  onClick={() => setActiveTab('coaching')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Koçluk Önerileri Sekmesine Git
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
                <div className="flex gap-3">
                  <div className="p-2 bg-blue-500/15 rounded-lg flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <strong className="font-semibold text-base">Nasıl Çalışır:</strong>
                    <p className="mt-2 leading-relaxed">
                      Koçluk önerisi gönderilen personellerin, öneri öncesi 30 gün ve sonrası 30 günlük performans değişimini görebilirsiniz.
                      Bu sayede koçluk önerilerinin etkisini ölçebilir ve personel gelişimini takip edebilirsiniz.
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-effect rounded-xl shadow-lg p-6">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Personel Seçin</label>
                <select
                  value={selectedImprovementAgent}
                  onChange={(e) => setSelectedImprovementAgent(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-white/15 text-slate-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent [&>option]:bg-slate-100 dark:bg-slate-800 [&>option]:text-slate-900 dark:text-white"
                >
                  <option value="" className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">Bir personel seçin...</option>
                  {agentsWithCoaching.map(agent => (
                    <option key={agent.email} value={agent.email} className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              {loadingImprovements && (
                <div className="glass-effect rounded-xl shadow-lg p-12">
                  <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-12 h-12 animate-spin text-green-600 mb-4" />
                    <span className="text-slate-700 dark:text-slate-200 font-medium">Gelişim raporu hazırlanıyor...</span>
                  </div>
                </div>
              )}

              {!loadingImprovements && improvementReports.length > 0 && improvementReports[0].has_data && (
                <div className="space-y-6">
                  {improvementReports.map((report, idx) => {
                    const beforeAvgScore = Math.round(report.before_coaching?.average_score || 0);
                    const afterAvgScore = Math.round(report.after_coaching?.average_score || 0);
                    const scoreDiff = afterAvgScore - beforeAvgScore;

                    const beforeAnalysisScore = Math.round(report.before_coaching?.total_analysis_score || 0);
                    const afterAnalysisScore = Math.round(report.after_coaching?.total_analysis_score || 0);
                    const analysisDiff = afterAnalysisScore - beforeAnalysisScore;

                    const isImproved = scoreDiff > 5 && analysisDiff > 5;
                    const isSlightImproved = (scoreDiff > 0 || analysisDiff > 0) && scoreDiff <= 5 && analysisDiff <= 5;

                    return (
                      <div key={idx} className="bg-emerald-500/10 rounded-xl border border-emerald-500/25 p-6 shadow-md">
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-500/15 rounded-xl">
                              <Target className="w-8 h-8 text-emerald-400" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                {agentsWithCoaching.find(a => a.email === report.agent_email)?.name}
                              </h3>
                              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                İlk Koçluk: {new Date(report.first_coaching_date).toLocaleDateString('tr-TR')}
                              </p>
                              <p className="text-sm text-emerald-400 font-semibold mt-1">
                                {report.total_coaching_sent} koçluk önerisi gönderildi
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                          <div className="bg-slate-100/60 dark:bg-slate-800/30 rounded-xl border-2 border-slate-600/50 p-5 shadow-sm">
                            <h4 className="text-base font-bold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                              <Calendar className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                              Öneri Öncesi (30 Gün)
                            </h4>
                            <div className="space-y-4">
                              <div className="flex justify-between items-center p-3 bg-slate-100/60 dark:bg-slate-800/30 rounded-lg">
                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Personel Skoru</span>
                                <span className="text-xl font-bold text-slate-900 dark:text-white">{beforeAvgScore}/100</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-slate-100/60 dark:bg-slate-800/30 rounded-lg">
                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Analiz Skoru</span>
                                <span className="text-xl font-bold text-slate-900 dark:text-white">{beforeAnalysisScore}/100</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-slate-100/60 dark:bg-slate-800/30 rounded-lg">
                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Toplam Chat</span>
                                <span className="text-xl font-bold text-slate-900 dark:text-white">{report.before_coaching?.total_chats || 0}</span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-emerald-500/10 rounded-xl border border-emerald-500/25 p-5 shadow-sm">
                            <h4 className="text-base font-bold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                              <TrendingUp className="w-5 h-5 text-emerald-400" />
                              Öneri Sonrası (30 Gün)
                            </h4>
                            <div className="space-y-4">
                              <div className="flex justify-between items-center p-3 bg-emerald-500/10 rounded-lg">
                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Personel Skoru</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xl font-bold text-slate-900 dark:text-white">{afterAvgScore}/100</span>
                                  <span className={`text-sm font-bold px-2 py-1 rounded-full ${
                                    scoreDiff > 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                                    scoreDiff < 0 ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                                    'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 border border-white/15'
                                  }`}>
                                    {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-emerald-500/10 rounded-lg">
                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Analiz Skoru</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xl font-bold text-slate-900 dark:text-white">{afterAnalysisScore}/100</span>
                                  <span className={`text-sm font-bold px-2 py-1 rounded-full ${
                                    analysisDiff > 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                                    analysisDiff < 0 ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                                    'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 border border-white/15'
                                  }`}>
                                    {analysisDiff > 0 ? `+${analysisDiff}` : analysisDiff}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-emerald-500/10 rounded-lg">
                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Toplam Chat</span>
                                <span className="text-xl font-bold text-slate-900 dark:text-white">{report.after_coaching?.total_chats || 0}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={`p-5 rounded-xl ${
                          isImproved ? 'bg-emerald-500/10 border border-emerald-500/25' :
                          isSlightImproved ? 'bg-blue-500/10 border border-blue-500/25' :
                          'bg-amber-500/10 border border-amber-500/25'
                        }`}>
                          <div className="flex items-start gap-3">
                            {isImproved ? (
                              <>
                                <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                                <div>
                                  <h5 className="font-bold text-emerald-300 mb-1">Mükemmel Gelişme!</h5>
                                  <p className="text-sm text-emerald-400/80">
                                    Koçluk önerileri belirgin şekilde olumlu etki gösterdi. Personel performansında kayda değer iyileşme gözlemlendi.
                                  </p>
                                </div>
                              </>
                            ) : isSlightImproved ? (
                              <>
                                <AlertCircle className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
                                <div>
                                  <h5 className="font-bold text-blue-300 mb-1">Küçük Gelişmeler Var</h5>
                                  <p className="text-sm text-blue-400/80">
                                    Performansta hafif iyileşme görülüyor. Süreci takip etmeye devam edin ve gerekirse ek koçluk desteği sağlayın.
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                  <h5 className="font-bold text-amber-300 mb-1">Gelişme Görülmedi</h5>
                                  <p className="text-sm text-amber-400/80">
                                    Beklenen gelişme henüz gözlemlenmedi. Farklı koçluk yaklaşımları veya ek destek gerekebilir. Personelle birebir görüşme düşünülebilir.
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!loadingImprovements && selectedImprovementAgent && improvementReports.length === 0 && (
                <div className="glass-effect rounded-xl shadow-lg p-12">
                  <div className="text-center">
                    <MessageCircle className="w-16 h-16 mx-auto mb-4 text-slate-700 dark:text-slate-200" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Gelişim Verisi Bulunamadı</h3>
                    <p className="text-slate-700 dark:text-slate-200">
                      Bu personel için henüz yeterli gelişim verisi bulunmuyor.
                      Koçluk önerisinden sonra 30 gün geçmesi gerekiyor.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
