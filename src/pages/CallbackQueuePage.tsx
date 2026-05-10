import { useState, useEffect, useCallback } from 'react';
import { Phone, PhoneCall, PhoneMissed, CheckCircle, Clock, AlertTriangle, XCircle, RefreshCw, ChevronDown, Search, Filter, Zap, Tag, MessageSquare, User, Bot, Calendar, ExternalLink, Hash, Send, CalendarRange, PhoneOff, Voicemail as VoicemailIcon, UserCheck, Activity, PhoneIncoming, Settings, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useBrand } from '../lib/brand';

interface ChatMessage {
  id: string;
  chat_id: string;
  author_type: string;
  text: string;
  created_at: string;
  is_system: boolean;
}

interface CallbackRequest {
  id: string;
  chat_id: string;
  agent_name: string;
  customer_name: string;
  detected_at: string;
  chat_started_at: string | null;
  matched_keywords: string[];
  matched_categories: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sample_message: string;
  phone_number: string | null;
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed' | 'no_call_needed';
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  telegram_sent: boolean;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  call_count: number;
  last_called_at: string | null;
}

interface CallLog {
  id: string;
  callback_request_id: string;
  agent_user_id: string | null;
  agent_name: string;
  called_at: string;
  outcome: string;
  note: string | null;
  created_at: string;
}

interface CallbackSetting {
  id: string;
  category: string;
  label: string;
  keywords: string[];
  send_telegram: boolean;
  min_urgency_for_alert: string;
  is_active: boolean;
}

interface ChatInfo {
  chat_id: string;
  customer_name: string;
  agent_name: string;
}

type ActivityLog = CallLog & {
  customer_name?: string;
  phone_number?: string;
  chat_id?: string;
  request_agent_name?: string;
  matched_categories?: string[];
  urgency?: string;
  sample_message?: string;
};

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'resolved' | 'dismissed' | 'no_call_needed';
type UrgencyFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

const urgencyConfig = {
  critical: { label: 'Kritik', bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30', dot: 'bg-rose-400', ring: 'ring-rose-500/40' },
  high: { label: 'Yuksek', bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30', dot: 'bg-orange-400', ring: 'ring-orange-500/40' },
  medium: { label: 'Orta', bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-400', ring: 'ring-amber-500/40' },
  low: { label: 'Dusuk', bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-500/30', dot: 'bg-slate-400', ring: 'ring-slate-500/40' },
};

const statusConfig = {
  pending: { label: 'Bekliyor', bg: 'bg-amber-500/12', text: 'text-amber-300', border: 'border-amber-500/25', icon: Clock },
  in_progress: { label: 'Isleniyor', bg: 'bg-cyan-500/12', text: 'text-cyan-300', border: 'border-cyan-500/25', icon: PhoneCall },
  resolved: { label: 'Cozuldu', bg: 'bg-emerald-500/12', text: 'text-emerald-300', border: 'border-emerald-500/25', icon: CheckCircle },
  dismissed: { label: 'Reddedildi', bg: 'bg-slate-500/12', text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-500/20', icon: XCircle },
  no_call_needed: { label: 'Arama Gerekmez', bg: 'bg-sky-500/12', text: 'text-sky-300', border: 'border-sky-500/25', icon: PhoneOff },
};

const outcomeConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  answered: { label: 'Cevapladi', color: 'text-emerald-400', icon: PhoneIncoming },
  no_answer: { label: 'Cevap Yok', color: 'text-amber-400', icon: PhoneOff },
  busy: { label: 'Mesgul', color: 'text-orange-400', icon: PhoneMissed },
  voicemail: { label: 'Sesli Mesaj', color: 'text-slate-500 dark:text-slate-400', icon: VoicemailIcon },
  wrong_number: { label: 'Yanlis Numara', color: 'text-rose-400', icon: XCircle },
  callback_scheduled: { label: 'Randevu Alindi', color: 'text-cyan-400', icon: Calendar },
};

const categoryLabels: Record<string, string> = {
  explicit_callback: 'Geri Arama',
  urgency: 'Acil',
  dissatisfaction: 'Sikayet',
  follow_up: 'Takip',
  phone_number: 'Telefon No',
};

const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az once';
  if (mins < 60) return `${mins}dk once`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}sa once`;
  return `${Math.floor(hrs / 24)}g once`;
}

export default function CallbackQueuePage() {
  const { profile } = useAuth();
  const { activeBrand } = useBrand();
  const [requests, setRequests] = useState<CallbackRequest[]>([]);
  const [settings, setSettings] = useState<CallbackSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'activity' | 'settings'>('queue');
  const [selectedRequest, setSelectedRequest] = useState<CallbackRequest | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ detected: number; scanned: number; skipped?: number; scan_all?: boolean; telegram_sent?: number; telegram_errors?: string[] } | null>(null);
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState<Set<string>>(new Set());
  const [settingErrors, setSettingErrors] = useState<Record<string, string>>({});
  const [settingSuccess, setSettingSuccess] = useState<Set<string>>(new Set());
  const [chatModalRequest, setChatModalRequest] = useState<ChatInfo | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [globalStats, setGlobalStats] = useState({ pending: 0, pendingOnly: 0, critical: 0, inProgress: 0, resolvedToday: 0, totalContacted: 0 });
  const [callbackTgToken, setCallbackTgToken] = useState('');
  const [callbackTgChatId, setCallbackTgChatId] = useState('');
  const [savingTg, setSavingTg] = useState(false);
  const [fetchingChatId, setFetchingChatId] = useState(false);
  const [detectedChats, setDetectedChats] = useState<{ id: string; title: string; type: string }[]>([]);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [botInfo, setBotInfo] = useState<{ ok: boolean; name?: string; username?: string; error?: string } | null>(null);
  const [verifyingBot, setVerifyingBot] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{ url: string; hasCustomCertificate: boolean; pendingUpdateCount: number; lastErrorDate?: number; lastErrorMessage?: string } | null>(null);
  const [checkingWebhook, setCheckingWebhook] = useState(false);
  const [logCallModal, setLogCallModal] = useState<CallbackRequest | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [noCallNeedModal, setNoCallNeedModal] = useState<CallbackRequest | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('callback_requests')
        .select('*', { count: 'exact' })
        .order('detected_at', { ascending: false });

      if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (urgencyFilter !== 'all') query = query.eq('urgency', urgencyFilter);
      if (dateFrom) query = query.gte('detected_at', dateFrom + 'T00:00:00+03:00');
      if (dateTo) query = query.lte('detected_at', dateTo + 'T23:59:59.999+03:00');
      if (search.trim()) {
        const q = search.trim();
        query = query.or(`customer_name.ilike.%${q}%,agent_name.ilike.%${q}%,chat_id.ilike.%${q}%,phone_number.ilike.%${q}%`);
      }

      query = query.range(from, to);

      let settingsQuery = supabase.from('callback_settings').select('*').order('category');
      if (activeBrand?.brand_id) settingsQuery = settingsQuery.eq('brand_id', activeBrand.brand_id);

      const [reqRes, setRes, cfgRes] = await Promise.all([
        query,
        settingsQuery,
        supabase.from('system_config').select('callback_telegram_bot_token, callback_telegram_chat_id').maybeSingle(),
      ]);

      if (reqRes.data) {
        const sorted = [...(reqRes.data as CallbackRequest[])].sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return -1;
          if (b.status === 'pending' && a.status !== 'pending') return 1;
          const uDiff = (urgencyOrder[b.urgency] ?? 0) - (urgencyOrder[a.urgency] ?? 0);
          if (uDiff !== 0) return uDiff;
          return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
        });
        setRequests(sorted);
      }
      setTotalCount(reqRes.count ?? 0);

      if (setRes.data) {
        setSettings(setRes.data as CallbackSetting[]);
        const kw: Record<string, string> = {};
        for (const s of setRes.data) kw[s.category] = s.keywords.join(', ');
        setEditingKeywords(kw);
      }
      if (cfgRes.data) {
        setCallbackTgToken(cfgRes.data.callback_telegram_bot_token ?? '');
        setCallbackTgChatId(cfgRes.data.callback_telegram_chat_id ?? '');
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, urgencyFilter, dateFrom, dateTo, search, activeBrand?.brand_id]);

  const loadGlobalStats = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    let totalRequestsQ = supabase.from('callback_requests').select('*', { count: 'exact', head: true });
    let pendingOnlyQ = supabase.from('callback_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    let criticalQ = supabase.from('callback_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('urgency', 'critical');
    let inProgressQ = supabase.from('callback_requests').select('*', { count: 'exact', head: true }).eq('status', 'in_progress');
    let resolvedQ = supabase.from('callback_requests').select('*', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', today + 'T00:00:00+03:00');
    let callCountQ = supabase.from('callback_requests').select('call_count').gt('call_count', 0);
    if (activeBrand?.brand_id) {
      totalRequestsQ = totalRequestsQ.eq('brand_id', activeBrand.brand_id);
      pendingOnlyQ = pendingOnlyQ.eq('brand_id', activeBrand.brand_id);
      criticalQ = criticalQ.eq('brand_id', activeBrand.brand_id);
      inProgressQ = inProgressQ.eq('brand_id', activeBrand.brand_id);
      resolvedQ = resolvedQ.eq('brand_id', activeBrand.brand_id);
      callCountQ = callCountQ.eq('brand_id', activeBrand.brand_id);
    }
    const [totalRequestsRes, pendingOnlyRes, criticalRes, inProgressRes, resolvedRes, callCountRes] = await Promise.all([totalRequestsQ, pendingOnlyQ, criticalQ, inProgressQ, resolvedQ, callCountQ]);
    const totalContacted = (callCountRes.data ?? []).reduce((sum, r) => sum + (r.call_count ?? 0), 0);
    setGlobalStats({
      pending: totalRequestsRes.count ?? 0,
      pendingOnly: pendingOnlyRes.count ?? 0,
      critical: criticalRes.count ?? 0,
      inProgress: inProgressRes.count ?? 0,
      resolvedToday: resolvedRes.count ?? 0,
      totalContacted,
    });
  }, [activeBrand?.brand_id]);

  const fetchCallLogs = useCallback(async (requestId: string) => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from('callback_call_logs')
      .select('*')
      .eq('callback_request_id', requestId)
      .order('called_at', { ascending: false });
    setCallLogs((data ?? []) as CallLog[]);
    setLoadingLogs(false);
  }, []);

  const fetchRecentActivity = useCallback(async () => {
    setLoadingActivity(true);
    let query = supabase
      .from('callback_call_logs')
      .select('*, callback_requests(customer_name, phone_number, chat_id, agent_name, matched_categories, urgency, sample_message, brand_id)')
      .order('called_at', { ascending: false });
    if (activeBrand?.brand_id) query = (query as any).eq('callback_requests.brand_id', activeBrand.brand_id);
    const { data } = await query;
    if (data) {
      const filtered = activeBrand?.brand_id
        ? (data as any[]).filter((row: any) => row.callback_requests?.brand_id === activeBrand.brand_id)
        : (data as any[]);
      setRecentActivity(filtered.map((row: CallLog & { callback_requests?: { customer_name?: string; phone_number?: string; chat_id?: string; agent_name?: string; matched_categories?: string[]; urgency?: string; sample_message?: string; brand_id?: string } }) => ({
        ...row,
        customer_name: row.callback_requests?.customer_name,
        phone_number: row.callback_requests?.phone_number,
        chat_id: row.callback_requests?.chat_id,
        request_agent_name: row.callback_requests?.agent_name,
        matched_categories: row.callback_requests?.matched_categories,
        urgency: row.callback_requests?.urgency,
        sample_message: row.callback_requests?.sample_message,
      })));
    }
    setLoadingActivity(false);
  }, [activeBrand?.brand_id]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, urgencyFilter, search, dateFrom, dateTo]);
  useEffect(() => { fetchData(currentPage); loadGlobalStats(); }, [fetchData, loadGlobalStats, currentPage]);

  useEffect(() => {
    if (selectedRequest) {
      fetchCallLogs(selectedRequest.id);
    }
  }, [selectedRequest, fetchCallLogs]);

  useEffect(() => {
    if (activeTab === 'activity') {
      fetchRecentActivity();
    }
  }, [activeTab, fetchRecentActivity]);

  const callDetectFunction = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('detect-callbacks', { body });
    if (error) throw error;
    return data;
  };

  const runDetection = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const result = await callDetectFunction({ lookback_hours: 6 });
      setRunResult({ detected: result?.detected ?? 0, scanned: result?.scanned ?? 0, skipped: result?.skipped ?? 0, telegram_sent: result?.telegram_sent ?? 0, telegram_errors: result?.telegram_errors ?? [] });
      setCurrentPage(1);
      await fetchData(1);
      loadGlobalStats();
    } catch (_) {
    } finally {
      setRunning(false);
    }
  };

  const runFullScan = async () => {
    setRunningAll(true);
    setRunResult(null);
    try {
      const result = await callDetectFunction({ scan_all: true, batch_size: 300 });
      setRunResult({ detected: result?.detected ?? 0, scanned: result?.scanned ?? 0, skipped: result?.skipped ?? 0, scan_all: true, telegram_sent: result?.telegram_sent ?? 0, telegram_errors: result?.telegram_errors ?? [] });
      setCurrentPage(1);
      await fetchData(1);
      loadGlobalStats();
    } catch (_) {
    } finally {
      setRunningAll(false);
    }
  };

  const runTelegramTest = async () => {
    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const result = await callDetectFunction({ test_telegram: true });
      if (result?.success) {
        setTelegramTestResult({ success: true, message: 'Test mesaji gonderildi! Telegram grubunu kontrol edin.' });
      } else {
        const errMsg = result?.telegram_response?.description ?? result?.error ?? 'Bilinmeyen hata';
        setTelegramTestResult({ success: false, message: `Telegram hatasi: ${errMsg}` });
      }
    } catch (e) {
      setTelegramTestResult({ success: false, message: `Baglanti hatasi: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setTestingTelegram(false);
    }
  };

  const updateStatus = async (id: string, status: CallbackRequest['status'], note?: string) => {
    setUpdatingId(id);
    const patch: Partial<CallbackRequest> = { status };
    if (status === 'resolved' || status === 'no_call_needed') {
      patch.resolved_at = new Date().toISOString();
      if (profile) patch.resolved_by = profile.full_name;
      if (note) patch.resolution_note = note;
    }
    if (status === 'in_progress' && profile) {
      patch.assigned_to_user_id = profile.id;
      patch.assigned_to_name = profile.full_name;
      patch.assigned_at = new Date().toISOString();
    }
    await supabase.from('callback_requests').update(patch).eq('id', id);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    if (selectedRequest?.id === id) {
      setSelectedRequest(prev => prev ? { ...prev, ...patch } : null);
    }
    setUpdatingId(null);
    setResolutionNote('');
    loadGlobalStats();
  };

  const submitCallLog = async (outcome: string, note: string) => {
    if (!logCallModal || !profile) return;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('callback_call_logs')
      .insert({
        callback_request_id: logCallModal.id,
        agent_user_id: profile.id,
        agent_name: profile.full_name,
        called_at: now,
        outcome,
        note: note || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Call log kaydedilemedi:', error);
      return;
    }

    const newCount = (logCallModal.call_count ?? 0) + 1;
    await supabase
      .from('callback_requests')
      .update({ call_count: newCount, last_called_at: now })
      .eq('id', logCallModal.id);

    setRequests(prev => prev.map(r =>
      r.id === logCallModal.id ? { ...r, call_count: newCount, last_called_at: now } : r
    ));
    if (selectedRequest?.id === logCallModal.id) {
      setSelectedRequest(prev => prev ? { ...prev, call_count: newCount, last_called_at: now } : null);
      if (data) setCallLogs(prev => [data as CallLog, ...prev]);
    }
    setLogCallModal(null);
    loadGlobalStats();
  };

  const saveSetting = async (category: string) => {
    setSavingSettings(prev => new Set(prev).add(category));
    setSettingErrors(prev => { const n = { ...prev }; delete n[category]; return n; });
    setSettingSuccess(prev => { const n = new Set(prev); n.delete(category); return n; });
    const setting = settings.find(s => s.category === category);
    if (!setting) { setSavingSettings(prev => { const n = new Set(prev); n.delete(category); return n; }); return; }
    const rawKeywords = editingKeywords[category] ?? '';
    const keywords = rawKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const { error } = await supabase.from('callback_settings').update({ keywords }).eq('id', setting.id);
    if (error) {
      setSettingErrors(prev => ({ ...prev, [category]: error.message }));
    } else {
      setSettings(prev => prev.map(s => s.category === category ? { ...s, keywords } : s));
      setSettingSuccess(prev => new Set(prev).add(category));
      setTimeout(() => setSettingSuccess(prev => { const n = new Set(prev); n.delete(category); return n; }), 2500);
    }
    setSavingSettings(prev => { const n = new Set(prev); n.delete(category); return n; });
  };

  const toggleSettingFlag = async (category: string, field: 'is_active' | 'send_telegram', value: boolean) => {
    const setting = settings.find(s => s.category === category);
    if (!setting) return;
    setSettings(prev => prev.map(s => s.category === category ? { ...s, [field]: value } : s));
    const { error } = await supabase.from('callback_settings').update({ [field]: value }).eq('id', setting.id);
    if (error) {
      setSettings(prev => prev.map(s => s.category === category ? { ...s, [field]: !value } : s));
    }
  };

  const saveTelegramConfig = async () => {
    setSavingTg(true);
    setWebhookResult(null);
    await supabase
      .from('system_config')
      .update({
        callback_telegram_bot_token: callbackTgToken.trim() || null,
        callback_telegram_chat_id: callbackTgChatId.trim() || null,
      })
      .gte('id', 0);
    if (callbackTgToken.trim()) {
      try {
        const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/callback-telegram-webhook`;
        const res = await fetch(`https://api.telegram.org/bot${callbackTgToken.trim()}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl, drop_pending_updates: false }),
        });
        const data = await res.json();
        if (data.ok) {
          setWebhookResult({ ok: true, message: 'Ayarlar kaydedildi ve webhook basariyla aktif edildi. /chat komutu artik calisacak.' });
        } else {
          setWebhookResult({ ok: false, message: `Ayarlar kaydedildi fakat webhook hatasi: ${data.description ?? 'Bilinmeyen hata'}` });
        }
      } catch {
        setWebhookResult({ ok: false, message: 'Ayarlar kaydedildi fakat webhook kaydedilemedi - internet baglantisini kontrol edin.' });
      }
    }
    setSavingTg(false);
  };

  const checkWebhookStatus = async () => {
    if (!callbackTgToken.trim()) return;
    setCheckingWebhook(true);
    setWebhookStatus(null);
    try {
      const res = await fetch(`https://api.telegram.org/bot${callbackTgToken.trim()}/getWebhookInfo`);
      const data = await res.json();
      if (data.ok) {
        setWebhookStatus({
          url: data.result.url ?? '',
          hasCustomCertificate: data.result.has_custom_certificate ?? false,
          pendingUpdateCount: data.result.pending_update_count ?? 0,
          lastErrorDate: data.result.last_error_date,
          lastErrorMessage: data.result.last_error_message,
        });
      }
    } catch {
    }
    setCheckingWebhook(false);
  };

  const verifyBot = async () => {
    if (!callbackTgToken.trim()) return;
    setVerifyingBot(true);
    setBotInfo(null);
    try {
      const res = await fetch(`https://api.telegram.org/bot${callbackTgToken.trim()}/getMe`);
      const data = await res.json();
      if (data.ok) {
        setBotInfo({ ok: true, name: data.result.first_name, username: data.result.username });
      } else {
        setBotInfo({ ok: false, error: data.description ?? 'Gecersiz token' });
      }
    } catch {
      setBotInfo({ ok: false, error: 'Ag hatasi' });
    }
    setVerifyingBot(false);
  };

  const sendTestTelegram = async () => {
    if (!callbackTgToken.trim() || !callbackTgChatId.trim()) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch(`https://api.telegram.org/bot${callbackTgToken.trim()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: callbackTgChatId.trim(),
          text: '✅ *Geri Arama Botu Test Mesaji*\n\nBot basariyla yapilandirildi ve mesaj gonderebiliyor.',
          parse_mode: 'Markdown',
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, message: 'Test mesaji basariyla gonderildi!' });
      } else {
        const code = data.error_code ? `[${data.error_code}] ` : '';
        setTestResult({ ok: false, message: `${code}${data.description ?? 'Bilinmeyen hata'}` });
      }
    } catch {
      setTestResult({ ok: false, message: 'Ag hatasi - token veya chat ID yanlis olabilir' });
    }
    setSendingTest(false);
  };

  const registerWebhook = async () => {
    if (!callbackTgToken.trim()) return;
    setRegisteringWebhook(true);
    setWebhookResult(null);
    try {
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/callback-telegram-webhook`;
      const res = await fetch(`https://api.telegram.org/bot${callbackTgToken.trim()}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setWebhookResult({ ok: true, message: 'Webhook basariyla kaydedildi! /chat komutu artik calisacak.' });
      } else {
        setWebhookResult({ ok: false, message: data.description ?? 'Webhook kaydedilemedi' });
      }
    } catch {
      setWebhookResult({ ok: false, message: 'Ag hatasi - webhook kaydedilemedi' });
    }
    setRegisteringWebhook(false);
  };

  const fetchGroupChatId = async () => {
    if (!callbackTgToken.trim()) return;
    setFetchingChatId(true);
    setDetectedChats([]);
    try {
      const res = await fetch(`https://api.telegram.org/bot${callbackTgToken.trim()}/getUpdates?limit=50`);
      const data = await res.json();
      if (!data.ok) { setFetchingChatId(false); return; }
      const seen = new Map<string, { id: string; title: string; type: string }>();
      for (const update of data.result ?? []) {
        const chat = update.message?.chat ?? update.my_chat_member?.chat;
        if (!chat) continue;
        const id = String(chat.id);
        if (!seen.has(id)) {
          seen.set(id, {
            id,
            title: chat.title ?? chat.username ?? chat.first_name ?? id,
            type: chat.type,
          });
        }
      }
      setDetectedChats(Array.from(seen.values()));
    } catch (_) {}
    setFetchingChatId(false);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Geri Arama Kuyrugu</h1>
          <p className="text-sm text-slate-500 mt-1">Musteri geri arama taleplerini tespit et ve yonet</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runTelegramTest}
            disabled={testingTelegram || running || runningAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-500/12 hover:bg-slate-500/20 border border-slate-500/25 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
            title="Telegram bot baglantisini test et"
          >
            {testingTelegram ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testingTelegram ? 'Test Ediliyor...' : 'TG Test'}
          </button>
          <button
            onClick={runFullScan}
            disabled={running || runningAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
            title="Tum gecmis chatleri tara"
          >
            {runningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {runningAll ? 'Gecmis Taranıyor...' : 'Tum Gecmisi Tara'}
          </button>
          <button
            onClick={runDetection}
            disabled={running || runningAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
          >
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {running ? 'Taranıyor...' : 'Son 6 Saat'}
          </button>
        </div>
      </div>

      {telegramTestResult && (
        <div className={`flex items-center gap-3 px-4 py-3 border rounded-xl text-sm ${telegramTestResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
          {telegramTestResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          <span>{telegramTestResult.message}</span>
        </div>
      )}

      {runResult && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-300">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              {runResult.scan_all ? 'Gecmis tarama' : 'Tarama'} tamamlandi:{' '}
              <strong>{runResult.scanned}</strong> chat tarandı
              {(runResult.skipped ?? 0) > 0 && <>, <strong>{runResult.skipped}</strong> zaten islenmisti</>}
              , <strong>{runResult.detected}</strong> yeni tespit
              {(runResult.telegram_sent ?? 0) > 0 && <>, <strong>{runResult.telegram_sent}</strong> Telegram bildirimi gönderildi</>}
            </span>
          </div>
          {(runResult.telegram_errors ?? []).length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-sm text-rose-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium mb-1">Telegram hatalari:</div>
                {(runResult.telegram_errors ?? []).map((e, i) => <div key={i} className="text-xs opacity-80">{e}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard icon={Phone} label="Gelen Talepler" value={globalStats.pending} color="amber"
          onClick={() => { setActiveTab('queue'); setStatusFilter('all'); setUrgencyFilter('all'); }}
          hint="Tum talepleri goster"
        />
        <StatCard icon={Clock} label="Bekleyen" value={globalStats.pendingOnly} color="orange"
          onClick={() => { setActiveTab('queue'); setStatusFilter('pending'); setUrgencyFilter('all'); }}
          hint="Bekleyenleri filtrele"
        />
        <StatCard icon={AlertTriangle} label="Kritik Bekleyen" value={globalStats.critical} color="rose"
          onClick={() => { setActiveTab('queue'); setStatusFilter('pending'); setUrgencyFilter('critical'); }}
          hint="Kritik talepleri filtrele"
        />
        <StatCard icon={UserCheck} label="Temas Kurulan" value={globalStats.totalContacted} color="cyan"
          onClick={() => setActiveTab('activity')}
          hint="Toplam yapilan arama sayisi"
        />
        <StatCard icon={PhoneCall} label="Isleniyor" value={globalStats.inProgress} color="sky"
          onClick={() => { setActiveTab('queue'); setStatusFilter('in_progress'); setUrgencyFilter('all'); }}
          hint="Islenenleri filtrele"
        />
        <StatCard icon={CheckCircle} label="Bugun Cozuldu" value={globalStats.resolvedToday} color="emerald"
          onClick={() => { setActiveTab('queue'); setStatusFilter('resolved'); setUrgencyFilter('all'); }}
          hint="Cozulenleri filtrele"
        />
      </div>

      <div className="relative flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 rounded-xl">
        {([
          { id: 'queue', label: 'Talep Kuyrugu', icon: PhoneIncoming },
          { id: 'activity', label: 'Ekip Aktivitesi', icon: Activity },
          { id: 'settings', label: 'Ayarlar', icon: Settings },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`relative flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 flex-1 justify-center ${
              activeTab === id
                ? 'text-white bg-cyan-500/20 border border-cyan-400/40'
                : 'text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5 border border-transparent'
            }`}
            style={activeTab === id ? { boxShadow: '0 0 18px 0 rgba(34,211,238,0.25), inset 0 1px 0 rgba(34,211,238,0.15)' } : {}}
          >
            <Icon className={`w-4 h-4 transition-all duration-200 ${activeTab === id ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]' : ''}`} />
            <span className={activeTab === id ? 'text-cyan-100' : ''}>{label}</span>
            {activeTab === id && (
              <span className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'queue' && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Musteri, temsilci, telefon veya chat ara..."
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/40 focus:bg-slate-200 dark:bg-white/8 transition-all"
                  />
                </div>
                <FilterSelect
                  value={statusFilter}
                  onChange={v => setStatusFilter(v as StatusFilter)}
                  options={[
                    { value: 'all', label: 'Tum Durumlar' },
                    { value: 'pending', label: 'Bekliyor' },
                    { value: 'in_progress', label: 'Isleniyor' },
                    { value: 'resolved', label: 'Cozuldu' },
                    { value: 'dismissed', label: 'Reddedildi' },
                    { value: 'no_call_needed', label: 'Arama Gerekmez' },
                  ]}
                />
                <FilterSelect
                  value={urgencyFilter}
                  onChange={v => setUrgencyFilter(v as UrgencyFilter)}
                  options={[
                    { value: 'all', label: 'Tum Aciliyetler' },
                    { value: 'critical', label: 'Kritik' },
                    { value: 'high', label: 'Yuksek' },
                    { value: 'medium', label: 'Orta' },
                    { value: 'low', label: 'Dusuk' },
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <CalendarRange className="w-3 h-3" />
                </div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500/40 transition-all dark:[color-scheme:dark]"
                />
                <span className="text-slate-700 text-xs">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500/40 transition-all dark:[color-scheme:dark]"
                />
                {(statusFilter !== 'all' || urgencyFilter !== 'all' || search || dateFrom || dateTo) && (
                  <button
                    onClick={() => { setSearch(''); setStatusFilter('all'); setUrgencyFilter('all'); setDateFrom(''); setDateTo(''); }}
                    className="ml-1 text-xs text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100 dark:bg-white/5 border border-transparent hover:border-slate-200 dark:border-white/8"
                  >
                    <XCircle className="w-3 h-3" />
                    Filtreleri Temizle
                  </button>
                )}
                <span className="text-xs text-slate-600 ml-auto">
                  {totalCount} talep
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-2">
                <PhoneMissed className="w-10 h-10 opacity-40" />
                <p className="text-sm">Hic geri arama talebi bulunamadi</p>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.map(req => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    isSelected={selectedRequest?.id === req.id}
                    onSelect={() => setSelectedRequest(prev => prev?.id === req.id ? null : req)}
                    onStatusChange={(status) => updateStatus(req.id, status)}
                    updating={updatingId === req.id}
                    onLogCall={() => setLogCallModal(req)}
                    onNoCallNeeded={() => setNoCallNeedModal(req)}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/8">
                <span className="text-xs text-slate-500">
                  Sayfa {currentPage} / {totalPages} &middot; {totalCount} talep
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || loading}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg hover:bg-slate-200 dark:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Onceki
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                    const page = startPage + i;
                    return page <= totalPages ? (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        disabled={loading}
                        className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                          page === currentPage
                            ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                            : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 hover:bg-slate-200 dark:bg-white/10'
                        }`}
                      >
                        {page}
                      </button>
                    ) : null;
                  })}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || loading}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg hover:bg-slate-200 dark:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedRequest && (
            <div className="w-full lg:w-80 flex-shrink-0">
              <RequestDetailPanel
                request={selectedRequest}
                callLogs={callLogs}
                loadingLogs={loadingLogs}
                resolutionNote={resolutionNote}
                setResolutionNote={setResolutionNote}
                onStatusChange={(status, note) => updateStatus(selectedRequest.id, status, note)}
                updating={updatingId === selectedRequest.id}
                onClose={() => setSelectedRequest(null)}
                onOpenChat={() => setChatModalRequest({ chat_id: selectedRequest.chat_id, customer_name: selectedRequest.customer_name, agent_name: selectedRequest.agent_name })}
                onLogCall={() => setLogCallModal(selectedRequest)}
                onNoCallNeeded={() => setNoCallNeedModal(selectedRequest)}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <TeamActivityView
          activity={recentActivity}
          loading={loadingActivity}
          onRefresh={fetchRecentActivity}
          onOpenChat={(info) => setChatModalRequest(info)}
          totalPending={globalStats.pending}
        />
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/8 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Callback Telegram Botu</h3>
            </div>
            <p className="text-xs text-slate-500">
              Bu sayfadaki geri arama talepleri icin ayri bir Telegram botu kullanabilirsiniz. Bos birakilirsa ana bot kullanilir.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-500 font-medium block mb-1.5">Bot Token</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={callbackTgToken}
                    onChange={e => { setCallbackTgToken(e.target.value); setBotInfo(null); }}
                    placeholder="1234567890:ABCdef..."
                    className="flex-1 px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-600 dark:text-slate-300 placeholder-slate-600 focus:outline-none focus:border-sky-500/40 font-mono transition-all"
                  />
                  <button
                    onClick={verifyBot}
                    disabled={verifyingBot || !callbackTgToken.trim()}
                    className="px-3 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 transition-all disabled:opacity-40 flex-shrink-0"
                    title="Token'i dogrula"
                  >
                    {verifyingBot ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {botInfo && (
                  <p className={`mt-1.5 text-[11px] flex items-center gap-1 ${botInfo.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {botInfo.ok
                      ? <><CheckCircle className="w-3 h-3 flex-shrink-0" /> @{botInfo.username} ({botInfo.name})</>
                      : <><XCircle className="w-3 h-3 flex-shrink-0" /> {botInfo.error}</>}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-600 dark:text-slate-500 font-medium block mb-1.5">Chat / Kanal ID</label>
                <input
                  type="text"
                  value={callbackTgChatId}
                  onChange={e => setCallbackTgChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-600 dark:text-slate-300 placeholder-slate-600 focus:outline-none focus:border-sky-500/40 font-mono transition-all"
                />
                <p className="mt-1.5 text-[11px] text-slate-600">Kisisel chat icin kullanici ID'niz, grup icin negatif sayi</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={saveTelegramConfig}
                disabled={savingTg}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-500/12 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 rounded-lg transition-all disabled:opacity-40"
              >
                {savingTg ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Kaydet
              </button>
              <button
                onClick={fetchGroupChatId}
                disabled={fetchingChatId || !callbackTgToken.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-amber-500/12 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 rounded-lg transition-all disabled:opacity-40"
              >
                {fetchingChatId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Grup ID'sini Otomatik Al
              </button>
              <button
                onClick={sendTestTelegram}
                disabled={sendingTest || !callbackTgToken.trim() || !callbackTgChatId.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 rounded-lg transition-all disabled:opacity-40"
              >
                {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Test Mesaji Gonder
              </button>
              <button
                onClick={registerWebhook}
                disabled={registeringWebhook || !callbackTgToken.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-500/12 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 rounded-lg transition-all disabled:opacity-40"
              >
                {registeringWebhook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                /chat Komutunu Aktifle
              </button>
              <button
                onClick={checkWebhookStatus}
                disabled={checkingWebhook || !callbackTgToken.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-500/12 hover:bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-500/25 rounded-lg transition-all disabled:opacity-40"
              >
                {checkingWebhook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                Webhook Durumu
              </button>
            </div>
            {webhookStatus && (
              <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-white/3 text-xs">
                <div className="flex items-center gap-2">
                  {webhookStatus.url ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  )}
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Mevcut Webhook URL:</span>
                  {webhookStatus.url ? (
                    <span className="font-mono text-slate-600 dark:text-slate-300 truncate text-[10px]">{webhookStatus.url}</span>
                  ) : (
                    <span className="text-rose-400">Webhook kayitli degil - Ayarlari kaydedin veya aktifle butonuna basin</span>
                  )}
                </div>
                {webhookStatus.lastErrorMessage && (
                  <div className="flex items-start gap-2 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <span className="text-amber-300">Son hata: {webhookStatus.lastErrorMessage}</span>
                  </div>
                )}
                <div className="text-slate-600 text-[10px]">
                  Bekleyen guncelleme: {webhookStatus.pendingUpdateCount}
                </div>
              </div>
            )}
            {webhookResult && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                webhookResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}>
                {webhookResult.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                {webhookResult.message}
              </div>
            )}
            {testResult && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                testResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}>
                {testResult.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                {testResult.message}
              </div>
            )}
            {detectedChats.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Botun mesaj aldigi sohbetler — dogru olani secin:</p>
                {detectedChats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setCallbackTgChatId(chat.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs transition-all ${
                      callbackTgChatId === chat.id
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/8 text-slate-600 dark:text-slate-300 hover:border-cyan-500/30 hover:bg-slate-200 dark:bg-white/8'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{chat.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        chat.type === 'group' || chat.type === 'supergroup'
                          ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                          : 'bg-slate-500/10 border-slate-500/20 text-slate-500 dark:text-slate-400'
                      }`}>{chat.type}</span>
                    </span>
                    <span className="font-mono text-slate-500 text-[10px]">{chat.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm text-slate-500 mb-4">
              Her kategori icin anahtar kelimeleri virgul ile ayirin. Telefon numarasi kategorisi regex ile otomatik taranir.
            </p>
            {settings.map(setting => (
              <SettingCard
                key={setting.category}
                setting={setting}
                keywordsRaw={editingKeywords[setting.category] ?? ''}
                onKeywordsChange={v => setEditingKeywords(prev => ({ ...prev, [setting.category]: v }))}
                onSave={() => saveSetting(setting.category)}
                saving={savingSettings.has(setting.category)}
                saveError={settingErrors[setting.category]}
                saveSuccess={settingSuccess.has(setting.category)}
                onToggleActive={v => toggleSettingFlag(setting.category, 'is_active', v)}
                onToggleTelegram={v => toggleSettingFlag(setting.category, 'send_telegram', v)}
              />
            ))}
          </div>
        </div>
      )}

      {chatModalRequest && (
        <ChatConversationModal
          request={chatModalRequest}
          onClose={() => setChatModalRequest(null)}
        />
      )}

      {logCallModal && (
        <LogCallModal
          request={logCallModal}
          onClose={() => setLogCallModal(null)}
          onSubmit={submitCallLog}
        />
      )}

      {noCallNeedModal && (
        <NoCallNeededModal
          request={noCallNeedModal}
          onClose={() => setNoCallNeedModal(null)}
          onConfirm={async (note) => {
            await updateStatus(noCallNeedModal.id, 'no_call_needed', note || undefined);
            setNoCallNeedModal(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, onClick, hint }: { icon: React.ElementType; label: string; value: number; color: string; onClick?: () => void; hint?: string }) {
  const colors: Record<string, string> = {
    amber: 'text-amber-300 bg-amber-500/12 border-amber-500/20 hover:bg-amber-500/18 hover:border-amber-500/35',
    orange: 'text-orange-300 bg-orange-500/12 border-orange-500/20 hover:bg-orange-500/18 hover:border-orange-500/35',
    rose: 'text-rose-300 bg-rose-500/12 border-rose-500/20 hover:bg-rose-500/18 hover:border-rose-500/35',
    cyan: 'text-cyan-300 bg-cyan-500/12 border-cyan-500/20 hover:bg-cyan-500/18 hover:border-cyan-500/35',
    sky: 'text-sky-300 bg-sky-500/12 border-sky-500/20 hover:bg-sky-500/18 hover:border-sky-500/35',
    emerald: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/20 hover:bg-emerald-500/18 hover:border-emerald-500/35',
  };
  const iconColors: Record<string, string> = {
    amber: 'text-amber-400 bg-amber-500/15',
    rose: 'text-rose-400 bg-rose-500/15',
    cyan: 'text-cyan-400 bg-cyan-500/15',
    sky: 'text-sky-400 bg-sky-500/15',
    emerald: 'text-emerald-400 bg-emerald-500/15',
  };
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 transition-all duration-200 ${colors[color]} ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      title={hint}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          {hint && <p className="text-[10px] text-slate-600 mt-0.5">{hint}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-xl text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-cyan-500/40 cursor-pointer transition-all"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
    </div>
  );
}

function RequestCard({
  request, isSelected, onSelect, onStatusChange, updating, onLogCall, onNoCallNeeded
}: {
  request: CallbackRequest;
  isSelected: boolean;
  onSelect: () => void;
  onStatusChange: (s: CallbackRequest['status']) => void;
  updating: boolean;
  onLogCall: () => void;
  onNoCallNeeded: () => void;
}) {
  const urgency = urgencyConfig[request.urgency];
  const status = statusConfig[request.status];
  const StatusIcon = status.icon;

  const urgencyBorderColor = {
    critical: 'border-l-rose-500',
    high: 'border-l-orange-500',
    medium: 'border-l-amber-500',
    low: 'border-l-slate-600',
  }[request.urgency] ?? 'border-l-slate-600';

  return (
    <div
      className={`rounded-xl border border-l-[3px] transition-all duration-200 cursor-pointer overflow-hidden ${urgencyBorderColor} ${
        isSelected
          ? 'border-cyan-500/40 bg-cyan-500/5 shadow-lg shadow-cyan-500/10'
          : 'border-slate-200 dark:border-white/6 bg-slate-100 dark:bg-white/[0.03] hover:bg-slate-200/50 dark:bg-white/[0.05] hover:border-slate-300 dark:border-white/10'
      }`}
      onClick={onSelect}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{request.customer_name || 'Bilinmeyen Musteri'}</span>
              {request.phone_number && (
                <span className="text-xs text-cyan-300 font-mono flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {request.phone_number}
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${urgency.bg} ${urgency.text} ${urgency.border}`}>
                  {urgency.label}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.bg} ${status.text} ${status.border} flex items-center gap-1`}>
                  <StatusIcon className="w-2.5 h-2.5" />
                  {status.label}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Bot className="w-3 h-3 flex-shrink-0" />
                {request.agent_name || '-'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                {request.chat_started_at ? formatTime(request.chat_started_at) : timeAgo(request.detected_at)}
              </span>
              {request.call_count > 0 ? (
                <span className="flex items-center gap-1 text-cyan-400/80">
                  <PhoneCall className="w-3 h-3 flex-shrink-0" />
                  {request.call_count}x arandı {request.last_called_at ? `· Son: ${timeAgo(request.last_called_at)}` : ''}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-600">
                  <PhoneOff className="w-3 h-3 flex-shrink-0" />
                  Hic aranmadi
                </span>
              )}
              {request.assigned_to_name && (
                <span className="flex items-center gap-1 text-emerald-400/70">
                  <UserCheck className="w-3 h-3 flex-shrink-0" />
                  {request.assigned_to_name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {request.matched_categories.map(cat => (
                <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/8">
                  {categoryLabels[cat] ?? cat}
                </span>
              ))}
              {request.sample_message && (
                <span className="text-[10px] text-slate-600 italic truncate max-w-[280px]">"{request.sample_message}"</span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex gap-1 items-start" onClick={e => e.stopPropagation()}>
            <button
              onClick={onLogCall}
              title="Arama kaydet"
              className="p-1.5 rounded-lg border bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/20 transition-all duration-200"
            >
              <PhoneCall className="w-3.5 h-3.5" />
            </button>
            {request.status === 'pending' && (
              <>
                <ActionButton label="Baslat" color="emerald" icon={PhoneCall} onClick={() => onStatusChange('in_progress')} disabled={updating} />
                <ActionButton label="Arama Gerekmez" color="sky" icon={PhoneOff} onClick={onNoCallNeeded} disabled={updating} />
                <ActionButton label="Kapat" color="slate" icon={XCircle} onClick={() => onStatusChange('dismissed')} disabled={updating} />
              </>
            )}
            {request.status === 'in_progress' && (
              <>
                <ActionButton label="Cozuldu" color="emerald" icon={CheckCircle} onClick={() => onStatusChange('resolved')} disabled={updating} />
                <ActionButton label="Arama Gerekmez" color="sky" icon={PhoneOff} onClick={onNoCallNeeded} disabled={updating} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, color, icon: Icon, onClick, disabled }: {
  label: string; color: string; icon: React.ElementType; onClick: () => void; disabled: boolean;
}) {
  const colors: Record<string, string> = {
    cyan: 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/20',
    emerald: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
    slate: 'bg-slate-500/10 hover:bg-slate-500/20 text-slate-500 dark:text-slate-400 border-slate-500/20',
    sky: 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/20',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`p-1.5 rounded-lg border transition-all duration-200 disabled:opacity-40 ${colors[color] ?? colors.slate}`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function RequestDetailPanel({
  request, callLogs, loadingLogs, resolutionNote, setResolutionNote, onStatusChange, updating, onClose, onOpenChat, onLogCall, onNoCallNeeded
}: {
  request: CallbackRequest;
  callLogs: CallLog[];
  loadingLogs: boolean;
  resolutionNote: string;
  setResolutionNote: (v: string) => void;
  onStatusChange: (s: CallbackRequest['status'], note?: string) => void;
  updating: boolean;
  onClose: () => void;
  onOpenChat: () => void;
  onLogCall: () => void;
  onNoCallNeeded: () => void;
}) {
  const urgency = urgencyConfig[request.urgency];
  const status = statusConfig[request.status];
  const StatusIcon = status.icon;
  const [noteModal, setNoteModal] = useState<{ note: string; agentName: string; outcome: string } | null>(null);

  return (
    <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/8 rounded-xl p-5 space-y-4 sticky top-8 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Talep Detayi</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5 transition-all">
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={onOpenChat}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold bg-cyan-500/12 hover:bg-cyan-500/22 text-cyan-300 border border-cyan-500/25 rounded-lg transition-all duration-200 group"
      >
        <MessageSquare className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
        Chat Konusmasini Goruntule
        <ExternalLink className="w-3 h-3 opacity-50" />
      </button>

      <div className="space-y-3">
        <DetailRow icon={User} label="Musteri" value={request.customer_name || '-'} />
        <DetailRow icon={Bot} label="Temsilci" value={request.agent_name || '-'} />
        <DetailRow icon={Calendar} label="Tespit Zamani" value={formatTime(request.detected_at)} />
        {request.chat_started_at && (
          <DetailRow icon={MessageSquare} label="Chat Baslangici" value={formatTime(request.chat_started_at)} />
        )}
        {request.phone_number && (
          <DetailRow icon={Phone} label="Telefon No" value={request.phone_number} highlight />
        )}
        {request.assigned_to_name && (
          <DetailRow icon={UserCheck} label="Atanan Kisi" value={request.assigned_to_name} />
        )}
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
            <Hash className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">Chat ID</p>
            <button
              onClick={onOpenChat}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 hover:underline transition-colors truncate max-w-full flex items-center gap-1 group"
            >
              <span className="truncate">{request.chat_id}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${urgency.bg} ${urgency.text} ${urgency.border}`}>
          {urgency.label}
        </span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.bg} ${status.text} ${status.border} flex items-center gap-1`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
        {request.call_count > 0 && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {request.call_count} kez arandı
          </span>
        )}
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2 font-medium">Eslesme Kategorileri</p>
        <div className="flex flex-wrap gap-1.5">
          {request.matched_categories.map(cat => (
            <span key={cat} className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/8">
              {categoryLabels[cat] ?? cat}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2 font-medium">Anahtar Kelimeler</p>
        <div className="flex flex-wrap gap-1.5">
          {request.matched_keywords.map((kw, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-lg bg-cyan-500/8 text-cyan-300 border border-cyan-500/15 flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" />
              {kw}
            </span>
          ))}
        </div>
      </div>

      {request.sample_message && (
        <div>
          <p className="text-xs text-slate-500 mb-2 font-medium">Tetikleyen Mesaj</p>
          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 rounded-lg p-3 border border-slate-200 dark:border-white/6 italic leading-relaxed">
            "{request.sample_message}"
          </p>
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-white/5 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-600 dark:text-slate-500 font-medium flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            Arama Gecmisi
            {callLogs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full text-[10px] font-semibold">{callLogs.length}</span>
            )}
          </p>
          <button
            onClick={onLogCall}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 rounded-lg transition-all"
          >
            <PhoneCall className="w-3 h-3" />
            Arama Kaydet
          </button>
        </div>

        {loadingLogs ? (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
          </div>
        ) : callLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-slate-600 space-y-1">
            <PhoneOff className="w-6 h-6 opacity-40" />
            <p className="text-[11px]">Henuz arama kaydedilmedi</p>
          </div>
        ) : (
          <div className="space-y-2">
            {callLogs.map(log => {
              const oc = outcomeConfig[log.outcome] ?? outcomeConfig.no_answer;
              const OcIcon = oc.icon;
              return (
                <div key={log.id} className="bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/6 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${oc.color}`}>
                      <OcIcon className="w-3.5 h-3.5" />
                      {oc.label}
                    </div>
                    <span className="text-[10px] text-slate-600">{formatTime(log.called_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <User className="w-3 h-3" />
                    {log.agent_name}
                  </div>
                  {log.note && (
                    <button
                      onClick={() => setNoteModal({ note: log.note!, agentName: log.agent_name, outcome: log.outcome })}
                      className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 bg-white/4 hover:bg-slate-200 dark:bg-white/8 border border-slate-200 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/15 rounded-lg px-2.5 py-1.5 transition-all w-full text-left"
                    >
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      <span>Notu Goruntule</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {request.resolution_note && request.status === 'resolved' && (
        <div>
          <p className="text-xs text-slate-500 mb-1 font-medium">Cozum Notu</p>
          <p className="text-xs text-emerald-300 bg-emerald-500/8 rounded-lg p-3 border border-emerald-500/15">{request.resolution_note}</p>
        </div>
      )}

      {request.status === 'no_call_needed' && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <PhoneOff className="w-3.5 h-3.5 text-sky-400" />
            <p className="text-xs text-sky-300 font-medium">Arama Gerekmez</p>
            {request.resolved_by && (
              <span className="ml-auto text-[10px] text-slate-600">{request.resolved_by}</span>
            )}
          </div>
          {request.resolution_note ? (
            <p className="text-xs text-sky-200 bg-sky-500/8 rounded-lg p-3 border border-sky-500/15">{request.resolution_note}</p>
          ) : (
            <p className="text-xs text-slate-500 italic">Not eklenmemis</p>
          )}
          {request.resolved_at && (
            <p className="text-[10px] text-slate-600 mt-1">{formatTime(request.resolved_at)}</p>
          )}
        </div>
      )}

      {(request.status === 'pending' || request.status === 'in_progress') && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/5">
          <p className="text-xs text-slate-600 dark:text-slate-500 font-medium">Islem</p>
          {request.status === 'in_progress' && (
            <textarea
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              placeholder="Cozum notu ekle (opsiyonel)..."
              rows={2}
              className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/30 resize-none"
            />
          )}
          <div className="flex gap-2">
            {request.status === 'pending' && (
              <>
                <button
                  onClick={() => onStatusChange('in_progress')}
                  disabled={updating}
                  className="flex-1 py-2 text-xs font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 rounded-lg transition-all disabled:opacity-40"
                >
                  Isleme Al
                </button>
                <button
                  onClick={() => onStatusChange('dismissed')}
                  disabled={updating}
                  className="flex-1 py-2 text-xs font-medium bg-slate-500/12 hover:bg-slate-500/20 text-slate-500 dark:text-slate-400 border border-slate-500/20 rounded-lg transition-all disabled:opacity-40"
                >
                  Reddet
                </button>
              </>
            )}
            {request.status === 'in_progress' && (
              <button
                onClick={() => onStatusChange('resolved', resolutionNote)}
                disabled={updating}
                className="flex-1 py-2 text-xs font-medium bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 rounded-lg transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {updating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                Cozuldu
              </button>
            )}
          </div>
          <button
            onClick={onNoCallNeeded}
            disabled={updating}
            className="w-full py-2 text-xs font-medium bg-sky-500/12 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 rounded-lg transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <PhoneOff className="w-3 h-3" />
            Arama Gerekmez (Not Ekle)
          </button>
        </div>
      )}
      {noteModal && (
        <NoteViewModal
          note={noteModal.note}
          agentName={noteModal.agentName}
          outcome={noteModal.outcome}
          onClose={() => setNoteModal(null)}
        />
      )}
    </div>
  );
}

function LogCallModal({ request, onClose, onSubmit }: {
  request: CallbackRequest;
  onClose: () => void;
  onSubmit: (outcome: string, note: string) => Promise<void>;
}) {
  const [outcome, setOutcome] = useState('no_answer');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit(outcome, note);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Arama Kaydet</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/8 transition-all">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/6 rounded-lg px-3 py-2.5">
          <p className="text-xs text-slate-500">Musteri</p>
          <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{request.customer_name || 'Bilinmeyen'}</p>
          {request.phone_number && (
            <p className="text-xs text-cyan-400 mt-1 font-mono">{request.phone_number}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-slate-600 dark:text-slate-500 font-medium block mb-2">Arama Sonucu</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(outcomeConfig).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => setOutcome(key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    outcome === key
                      ? `${cfg.color} bg-slate-200 dark:bg-white/8 border-white/20`
                      : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/6 bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:bg-white/5 hover:border-slate-300 dark:border-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-600 dark:text-slate-500 font-medium block mb-1.5">Not (opsiyonel)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Aramayla ilgili not..."
            rows={3}
            className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/30 resize-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 border border-slate-600/30 rounded-xl hover:bg-slate-100 dark:bg-white/5 transition-all"
          >
            Iptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

function NoCallNeededModal({ request, onClose, onConfirm }: {
  request: CallbackRequest;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    await onConfirm(note);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneOff className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Arama Gerekmez</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/8 transition-all">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/6 rounded-lg px-3 py-2.5">
          <p className="text-xs text-slate-500">Musteri</p>
          <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{request.customer_name || 'Bilinmeyen'}</p>
          {request.phone_number && (
            <p className="text-xs text-cyan-400 mt-1 font-mono">{request.phone_number}</p>
          )}
        </div>

        <div>
          <label className="text-xs text-slate-600 dark:text-slate-500 font-medium block mb-1.5">
            Neden aranmasina gerek yok? <span className="text-slate-600">(opsiyonel)</span>
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ornek: Musteri chat'te sorunu cozdu, bilgilendirme maili gonderildi..."
            rows={3}
            autoFocus
            className="w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/30 resize-none"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 border border-slate-600/30 rounded-xl hover:bg-slate-100 dark:bg-white/5 transition-all"
          >
            Iptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 text-xs font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5" />}
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteViewModal({ note, agentName, outcome, onClose }: {
  note: string;
  agentName: string;
  outcome: string;
  onClose: () => void;
}) {
  const oc = outcomeConfig[outcome] ?? outcomeConfig.no_answer;
  const OcIcon = oc.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-[#0d1117] border border-white/12 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/6 flex items-center justify-center">
              <FileText className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{agentName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <OcIcon className={`w-3 h-3 ${oc.color}`} />
                <span className={`text-[11px] font-medium ${oc.color}`}>{oc.label}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:bg-white/10 flex items-center justify-center transition-colors"
          >
            <XCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mb-2">Personel Notu</p>
          <div className="bg-white/4 border border-slate-200 dark:border-white/8 rounded-xl p-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed italic">{note}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamActivityView({ activity, loading, onRefresh, onOpenChat, totalPending }: {
  activity: ActivityLog[];
  loading: boolean;
  onRefresh: () => void;
  onOpenChat: (info: ChatInfo) => void;
  totalPending: number;
}) {
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [filterUrgency, setFilterUrgency] = useState<string | null>(null);
  const [filterOutcome, setFilterOutcome] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [noteModal, setNoteModal] = useState<{ note: string; agentName: string; outcome: string } | null>(null);

  const agentStats = activity.reduce<Record<string, { name: string; total: number; answered: number; lastCall: string }>>((acc, log) => {
    if (!acc[log.agent_name]) {
      acc[log.agent_name] = { name: log.agent_name, total: 0, answered: 0, lastCall: log.called_at };
    }
    acc[log.agent_name].total++;
    if (log.outcome === 'answered') acc[log.agent_name].answered++;
    if (new Date(log.called_at) > new Date(acc[log.agent_name].lastCall)) {
      acc[log.agent_name].lastCall = log.called_at;
    }
    return acc;
  }, {});

  const agentList = Object.values(agentStats).sort((a, b) => b.total - a.total);

  const filteredActivity = activity.filter(log => {
    if (filterAgent && log.agent_name !== filterAgent) return false;
    if (filterUrgency && log.urgency !== filterUrgency) return false;
    if (filterOutcome && log.outcome !== filterOutcome) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      const inCustomer = (log.customer_name ?? '').toLowerCase().includes(q);
      const inAgent = log.agent_name.toLowerCase().includes(q);
      const inPhone = (log.phone_number ?? '').toLowerCase().includes(q);
      const inNote = (log.note ?? '').toLowerCase().includes(q);
      if (!inCustomer && !inAgent && !inPhone && !inNote) return false;
    }
    return true;
  });

  const activeFilterCount = [filterAgent, filterUrgency, filterOutcome, searchText.trim() || null].filter(Boolean).length;

  function clearAllFilters() {
    setFilterAgent(null);
    setFilterUrgency(null);
    setFilterOutcome(null);
    setSearchText('');
    setSelectedLog(null);
  }

  function toggleAgentFilter(name: string) {
    setFilterAgent(prev => prev === name ? null : name);
    setSelectedLog(null);
  }

  const urgencyFilterOptions: Array<{ key: string; label: string; color: string; bg: string; border: string }> = [
    { key: 'critical', label: 'Kritik', color: 'text-rose-300', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
    { key: 'high', label: 'Yuksek', color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/30' },
    { key: 'medium', label: 'Orta', color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
    { key: 'low', label: 'Dusuk', color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-500/15', border: 'border-slate-500/30' },
  ];

  const outcomeFilterOptions = Object.entries(outcomeConfig).map(([key, val]) => ({ key, ...val }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ekip Performansi</h3>
          <span className="text-[10px] text-slate-500">— filtrelemek icin karta tiklayin</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/8 rounded-lg hover:bg-slate-100 dark:bg-white/5 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {agentList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agentList.map(agent => {
            const rate = agent.total > 0 ? Math.round((agent.answered / agent.total) * 100) : 0;
            const coverageRate = totalPending > 0 ? Math.round((agent.total / totalPending) * 100) : 0;
            const isActive = filterAgent === agent.name;
            return (
              <div
                key={agent.name}
                onClick={() => toggleAgentFilter(agent.name)}
                className={`bg-white dark:bg-[#0d1117] border rounded-xl p-4 space-y-3 cursor-pointer transition-all duration-200 ${
                  isActive
                    ? 'border-cyan-500/45 shadow-sm shadow-cyan-500/15 ring-1 ring-cyan-500/20'
                    : 'border-slate-200 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/15 hover:bg-slate-50 dark:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold transition-all ${
                    isActive ? 'bg-cyan-500/25 border-cyan-500/50 text-cyan-200' : 'bg-cyan-500/15 border-cyan-500/25 text-cyan-300'
                  }`}>
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{agent.name}</p>
                    <p className="text-[11px] text-slate-500">{timeAgo(agent.lastCall)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isActive && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-wide">
                        Filtreli
                      </span>
                    )}
                    <div className={`text-sm font-bold ${rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {rate}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 dark:bg-white/3 rounded-lg p-2.5 text-center">
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{agent.total}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Toplam Arama</p>
                  </div>
                  <div className="bg-emerald-500/8 rounded-lg p-2.5 text-center">
                    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{agent.answered}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Ulasilan</p>
                  </div>
                  <div className="bg-amber-500/8 rounded-lg p-2.5 text-center">
                    <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{coverageRate}%</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Kapsama</p>
                  </div>
                </div>
                {totalPending > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                      <span>Bekleyenden Kapsama</span>
                      <span className="text-amber-400">{agent.total} / {totalPending} bekleyen</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${Math.min(coverageRate, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {agent.total > 0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                      <span>Erisim Orani</span>
                      <span className={rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>{rate}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/8 rounded-2xl p-4 mb-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-none">Filtrele</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
                    {activeFilterCount > 0 ? `${activeFilterCount} aktif filtre — ${filteredActivity.length} / ${activity.length} sonuc` : 'Aramalar icin filtre uygula'}
                  </p>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 border border-rose-500/25 hover:border-rose-500/45 bg-rose-500/8 hover:bg-rose-500/15 px-3 py-1.5 rounded-xl transition-all duration-200"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Temizle
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Temsilci, musteri, telefon veya not ara..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/[0.04] border border-slate-300 dark:border-white/10 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:bg-slate-200 dark:bg-white/[0.06] transition-all duration-200"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Aciliyet Seviyesi</p>
                <div className="grid grid-cols-4 gap-2">
                  {urgencyFilterOptions.map(opt => {
                    const isActive = filterUrgency === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => { setFilterUrgency(prev => prev === opt.key ? null : opt.key); setSelectedLog(null); }}
                        className={`relative flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border transition-all duration-200 ${
                          isActive
                            ? `${opt.bg} ${opt.border} shadow-lg`
                            : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/8 hover:bg-slate-200/50 dark:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/15'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${isActive ? opt.color.replace('text-', 'bg-') : 'bg-slate-600'} transition-all`} />
                        <span className={`text-[11px] font-semibold transition-all ${isActive ? opt.color : 'text-slate-500'}`}>{opt.label}</span>
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Arama Sonucu</p>
                <div className="grid grid-cols-3 gap-2">
                  {outcomeFilterOptions.map(opt => {
                    const OIcon = opt.icon;
                    const isActive = filterOutcome === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => { setFilterOutcome(prev => prev === opt.key ? null : opt.key); setSelectedLog(null); }}
                        className={`flex items-center gap-2 py-2 px-3 rounded-xl border transition-all duration-200 ${
                          isActive
                            ? 'bg-slate-200 dark:bg-white/8 border-white/20 shadow-sm'
                            : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/8 hover:bg-slate-200/50 dark:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/15'
                        }`}
                      >
                        <OIcon className={`w-3.5 h-3.5 flex-shrink-0 transition-all ${isActive ? opt.color : 'text-slate-600'}`} />
                        <span className={`text-[11px] font-medium truncate transition-all ${isActive ? opt.color : 'text-slate-500'}`}>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-white/5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-600">Aktif:</span>
                  {filterAgent && (
                    <span className="flex items-center gap-1 text-[10px] font-medium bg-cyan-500/12 text-cyan-300 border border-cyan-500/25 px-2 py-0.5 rounded-full">
                      {filterAgent}
                      <button onClick={() => { setFilterAgent(null); setSelectedLog(null); }} className="hover:text-cyan-100">
                        <XCircle className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                  {filterUrgency && (
                    <span className="flex items-center gap-1 text-[10px] font-medium bg-slate-200 dark:bg-white/8 text-slate-600 dark:text-slate-300 border border-white/15 px-2 py-0.5 rounded-full">
                      {urgencyFilterOptions.find(o => o.key === filterUrgency)?.label}
                      <button onClick={() => { setFilterUrgency(null); setSelectedLog(null); }} className="hover:text-slate-900 dark:text-white">
                        <XCircle className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                  {filterOutcome && (
                    <span className="flex items-center gap-1 text-[10px] font-medium bg-slate-200 dark:bg-white/8 text-slate-600 dark:text-slate-300 border border-white/15 px-2 py-0.5 rounded-full">
                      {outcomeFilterOptions.find(o => o.key === filterOutcome)?.label}
                      <button onClick={() => { setFilterOutcome(null); setSelectedLog(null); }} className="hover:text-slate-900 dark:text-white">
                        <XCircle className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                  {searchText.trim() && (
                    <span className="flex items-center gap-1 text-[10px] font-medium bg-slate-200 dark:bg-white/8 text-slate-600 dark:text-slate-300 border border-white/15 px-2 py-0.5 rounded-full">
                      "{searchText}"
                      <button onClick={() => setSearchText('')} className="hover:text-slate-900 dark:text-white">
                        <XCircle className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Son Aramalar</h4>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            </div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600 space-y-2">
              <Phone className="w-8 h-8 opacity-40" />
              <p className="text-sm">Henuz arama kaydedilmedi</p>
            </div>
          ) : filteredActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600 space-y-3">
              <Filter className="w-8 h-8 opacity-40" />
              <div className="text-center space-y-1">
                <p className="text-sm">Bu kriterlere uyan arama bulunamadi</p>
                <p className="text-[11px] text-slate-700">Farkli filtreler deneyin veya filtreleri temizleyin</p>
              </div>
              <button
                onClick={clearAllFilters}
                className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/25 hover:border-cyan-500/40 px-3 py-1.5 rounded-lg transition-all hover:bg-cyan-500/8"
              >
                Tum Filtreleri Temizle
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredActivity.map(log => {
                const oc = outcomeConfig[log.outcome] ?? outcomeConfig.no_answer;
                const OcIcon = oc.icon;
                const isSelected = selectedLog?.id === log.id;
                const urg = log.urgency ? urgencyConfig[log.urgency as keyof typeof urgencyConfig] : null;
                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(prev => prev?.id === log.id ? null : log)}
                    className={`flex items-center gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'border-cyan-500/35 bg-cyan-500/5 shadow-sm shadow-cyan-500/10'
                        : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:border-slate-300 dark:border-white/10'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      log.outcome === 'answered' ? 'bg-emerald-500/12' : log.outcome === 'no_answer' ? 'bg-amber-500/12' : 'bg-slate-100 dark:bg-white/5'
                    } ${oc.color}`}>
                      <OcIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">{log.agent_name}</span>
                        <span className="text-[10px] text-slate-600">aradı</span>
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{log.customer_name || 'Bilinmeyen'}</span>
                        {log.phone_number && (
                          <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/8 px-1.5 py-0.5 rounded border border-cyan-500/15">{log.phone_number}</span>
                        )}
                        {urg && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${urg.bg} ${urg.text} ${urg.border}`}>
                            {urg.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[11px] font-medium ${oc.color}`}>{oc.label}</span>
                        {log.note && (
                          <button
                            onClick={e => { e.stopPropagation(); setNoteModal({ note: log.note!, agentName: log.agent_name, outcome: log.outcome }); }}
                            className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 bg-white/4 hover:bg-slate-200 dark:bg-white/8 border border-slate-200 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/15 rounded px-1.5 py-0.5 transition-all"
                          >
                            <FileText className="w-2.5 h-2.5" />
                            Notu Goruntule
                          </button>
                        )}
                        {log.chat_id && (
                          <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                            <MessageSquare className="w-2.5 h-2.5" />
                            Chat
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-slate-600">{timeAgo(log.called_at)}</span>
                      {log.chat_id && (
                        <div className={`w-1.5 h-1.5 rounded-full transition-all ${isSelected ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedLog && (
          <div className="w-full lg:w-72 flex-shrink-0">
            <div className="bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/8 rounded-xl p-4 space-y-4 sticky top-8">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <PhoneCall className="w-3.5 h-3.5 text-cyan-400" />
                  Arama Detayi
                </h4>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/5 transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/6 rounded-lg px-3 py-2.5 space-y-1.5">
                  <div>
                    <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">Musteri</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{selectedLog.customer_name || 'Bilinmeyen'}</p>
                    {selectedLog.phone_number && (
                      <p className="text-xs text-cyan-300 font-mono mt-0.5">{selectedLog.phone_number}</p>
                    )}
                  </div>
                  {selectedLog.request_agent_name && (
                    <div className="border-t border-slate-200 dark:border-white/5 pt-1.5">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">Chat Temsilcisi</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{selectedLog.request_agent_name}</p>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/6 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-1.5">Arama Sonucu</p>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const oc = outcomeConfig[selectedLog.outcome] ?? outcomeConfig.no_answer;
                      const OcIcon = oc.icon;
                      return (
                        <>
                          <OcIcon className={`w-4 h-4 ${oc.color}`} />
                          <span className={`text-sm font-semibold ${oc.color}`}>{oc.label}</span>
                        </>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{formatTime(selectedLog.called_at)}</p>
                  {selectedLog.note && (
                    <button
                      onClick={() => setNoteModal({ note: selectedLog.note!, agentName: selectedLog.agent_name, outcome: selectedLog.outcome })}
                      className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Notu Goruntule
                    </button>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/6 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-1">Arayan Temsilci</p>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{selectedLog.agent_name}</p>
                </div>

                {selectedLog.urgency && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const urg = urgencyConfig[selectedLog.urgency as keyof typeof urgencyConfig];
                      if (!urg) return null;
                      return (
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${urg.bg} ${urg.text} ${urg.border}`}>
                          {urg.label} Oncelik
                        </span>
                      );
                    })()}
                    {(selectedLog.matched_categories ?? []).map(cat => (
                      <span key={cat} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/8">
                        {categoryLabels[cat] ?? cat}
                      </span>
                    ))}
                  </div>
                )}

                {selectedLog.sample_message && (
                  <div className="bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/6 rounded-lg px-3 py-2.5">
                    <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-1.5">Tetikleyen Mesaj</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 italic leading-relaxed line-clamp-3">"{selectedLog.sample_message}"</p>
                  </div>
                )}
              </div>

              {selectedLog.chat_id ? (
                <button
                  onClick={() => onOpenChat({
                    chat_id: selectedLog.chat_id!,
                    customer_name: selectedLog.customer_name || 'Bilinmeyen',
                    agent_name: selectedLog.request_agent_name || selectedLog.agent_name,
                  })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-lg transition-all duration-200 group"
                >
                  <MessageSquare className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                  Chati Goruntule
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </button>
              ) : (
                <div className="text-center py-2">
                  <p className="text-[11px] text-slate-600">Bu arama icin chat bilgisi bulunamadi</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {noteModal && (
        <NoteViewModal
          note={noteModal.note}
          agentName={noteModal.agentName}
          outcome={noteModal.outcome}
          onClose={() => setNoteModal(null)}
        />
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, highlight }: {
  icon: React.ElementType; label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">{label}</p>
        <p className={`text-xs font-medium truncate ${highlight ? 'text-cyan-300' : 'text-slate-700 dark:text-slate-200'}`}>{value}</p>
      </div>
    </div>
  );
}

function ChatConversationModal({ request, onClose }: { request: ChatInfo; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  useEffect(() => {
    async function load() {
      setLoadingMessages(true);
      const { data } = await supabase
        .from('chat_messages')
        .select('id, chat_id, author_type, text, created_at, is_system')
        .eq('chat_id', request.chat_id)
        .order('created_at', { ascending: true });
      setMessages((data ?? []) as ChatMessage[]);
      setLoadingMessages(false);
    }
    load();
  }, [request.chat_id]);

  const formatMsgTime = (iso: string) =>
    new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0d1117] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/8 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Chat Konusmasi</h2>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-slate-500 flex items-center gap-1"><User className="w-3 h-3" />{request.customer_name || 'Bilinmeyen'}</span>
              <span className="text-xs text-slate-500 flex items-center gap-1"><Bot className="w-3 h-3" />{request.agent_name || '-'}</span>
              <span className="text-[10px] font-mono text-slate-600 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded border border-slate-200 dark:border-white/6">{request.chat_id}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/8 transition-all flex-shrink-0 ml-2">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-600 space-y-2">
              <MessageSquare className="w-8 h-8 opacity-40" />
              <p className="text-sm">Bu chat icin mesaj bulunamadi</p>
            </div>
          ) : (
            messages.map(msg => {
              if (msg.is_system) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-[10px] text-slate-600 bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/5 px-3 py-1 rounded-full">{msg.text}</span>
                  </div>
                );
              }
              const isAgent = msg.author_type === 'agent';
              return (
                <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    <div className={`text-[10px] mb-1 flex items-center gap-1 ${isAgent ? 'justify-end text-slate-500' : 'text-slate-500'}`}>
                      {!isAgent && <User className="w-2.5 h-2.5" />}
                      <span>{isAgent ? request.agent_name || 'Temsilci' : request.customer_name || 'Musteri'}</span>
                      {isAgent && <Bot className="w-2.5 h-2.5" />}
                    </div>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words ${
                      isAgent ? 'bg-cyan-500/15 text-cyan-100 border border-cyan-500/20 rounded-tr-sm' : 'bg-slate-200 dark:bg-white/8 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/8 rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                    <div className={`text-[10px] text-slate-600 mt-1 ${isAgent ? 'text-right' : ''}`}>{formatMsgTime(msg.created_at)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/5 flex-shrink-0">
          <p className="text-[10px] text-slate-600 text-center">Toplam {messages.filter(m => !m.is_system).length} mesaj</p>
        </div>
      </div>
    </div>
  );
}

function SettingCard({ setting, keywordsRaw, onKeywordsChange, onSave, saving, saveError, saveSuccess, onToggleActive, onToggleTelegram }: {
  setting: CallbackSetting;
  keywordsRaw: string;
  onKeywordsChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saveError?: string;
  saveSuccess?: boolean;
  onToggleActive: (v: boolean) => void;
  onToggleTelegram: (v: boolean) => void;
}) {
  return (
    <div className={`bg-white dark:bg-[#0d1117] border rounded-xl p-5 mb-3 transition-all duration-200 ${setting.is_active ? 'border-slate-200 dark:border-white/8' : 'border-white/4 opacity-60'}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{setting.label}</h3>
          </div>
          <p className="text-xs text-slate-600 mt-0.5 font-mono">{setting.category}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <ToggleSwitch checked={setting.send_telegram} onChange={onToggleTelegram} label="Telegram" color="blue" />
          <ToggleSwitch checked={setting.is_active} onChange={onToggleActive} label="Aktif" color="emerald" />
        </div>
      </div>
      {setting.category !== 'phone_number' ? (
        <div className="space-y-2">
          <label className="text-xs text-slate-600 dark:text-slate-500 font-medium flex items-center gap-1.5">
            <Filter className="w-3 h-3" />
            Anahtar Kelimeler (virgul ile ayirin)
          </label>
          <textarea
            value={keywordsRaw}
            onChange={e => onKeywordsChange(e.target.value)}
            rows={3}
            disabled={!setting.is_active}
            className={`w-full px-3 py-2.5 bg-slate-100 dark:bg-white/5 border rounded-lg text-xs text-slate-600 dark:text-slate-300 placeholder-slate-600 focus:outline-none resize-none font-mono leading-relaxed disabled:opacity-40 transition-colors ${
              saveError ? 'border-rose-500/40 focus:border-rose-500/60' : 'border-slate-200 dark:border-white/8 focus:border-cyan-500/30'
            }`}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={saving || !setting.is_active}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 rounded-lg transition-all disabled:opacity-40"
            >
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              Kaydet
            </button>
            {saveSuccess && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle className="w-3 h-3" />
                Kaydedildi
              </span>
            )}
            {saveError && (
              <span className="flex items-center gap-1 text-[11px] text-rose-400">
                <XCircle className="w-3 h-3" />
                {saveError}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/5 rounded-lg px-3 py-2">
          Telefon numaralari otomatik olarak Turkiye formatinda regex ile tespit edilir. Anahtar kelime gerekmez.
        </p>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label, color }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; color: string;
}) {
  const colors: Record<string, string> = { emerald: 'bg-emerald-500', blue: 'bg-sky-500' };
  return (
    <label className="flex items-center gap-1.5 cursor-pointer group">
      <span className="text-[10px] text-slate-600 dark:text-slate-500 font-medium group-hover:text-slate-500 dark:text-slate-400 transition-colors">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-4 rounded-full transition-all duration-200 ${checked ? colors[color] ?? 'bg-emerald-500' : 'bg-slate-700'}`}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200 ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </label>
  );
}
