import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useBrand } from '../lib/brand';
import { Activity, Send, CheckCircle, XCircle, Clock, Zap, RefreshCw, ChevronDown, Calendar } from 'lucide-react';
import { BrandSyncStatusCards, type BrandSyncStatusData } from '../components/BrandSyncStatus';

interface PipelineResult {
  success: boolean;
  synced?: number;
  new_chats?: number;
  analyzed?: number;
  alerts_sent?: number;
  skipped?: number;
  total_chats?: number;
  total_analyzed?: number;
  timestamp?: string;
  error?: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function Monitoring() {
  const { activeBrand, brands } = useBrand();
  const [running, setRunning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<PipelineResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState(0);
  const [stats, setStats] = useState({ total: 0, analyzed: 0, unanalyzed: 0 });
  const [syncDropdownOpen, setSyncDropdownOpen] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [brandStatuses, setBrandStatuses] = useState<Record<string, BrandSyncStatusData>>({});
  const [brandStatusesLoading, setBrandStatusesLoading] = useState(false);

  const syncOptions = [
    { label: 'Bugun', days: 1, description: 'Son 24 saat' },
    { label: 'Bu Hafta', days: 7, description: 'Son 7 gun' },
    { label: 'Son 10 Gun', days: 10, description: 'Son 10 gun' },
    { label: 'Bu Ay', days: 30, description: 'Son 30 gun' },
    { label: 'Son 90 Gun', days: 90, description: 'Son 90 gun' },
  ];

  const addLog = useCallback((message: string, type: LogEntry['type']) => {
    setLogs(prev => [
      { time: new Date().toISOString(), message, type },
      ...prev.slice(0, 99),
    ]);
  }, []);

  const loadStats = useCallback(async () => {
    let totalQ = supabase.from('chats').select('*', { count: 'exact', head: true });
    let analyzedQ = supabase.from('chats').select('*', { count: 'exact', head: true }).eq('analyzed', true);
    let pendingQ = supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('sent_to_telegram', false);
    if (activeBrand?.brand_id) {
      totalQ = totalQ.eq('brand_id', activeBrand.brand_id);
      analyzedQ = analyzedQ.eq('brand_id', activeBrand.brand_id);
      pendingQ = pendingQ.eq('brand_id', activeBrand.brand_id);
    }
    const [
      { count: total },
      { count: analyzed },
      { count: pending },
    ] = await Promise.all([totalQ, analyzedQ, pendingQ]);

    setStats({
      total: total || 0,
      analyzed: analyzed || 0,
      unanalyzed: (total || 0) - (analyzed || 0),
    });
    setPendingAlerts(pending || 0);
  }, [activeBrand?.brand_id]);

  const loadBrandStatuses = useCallback(async () => {
    if (brands.length === 0) return;
    setBrandStatusesLoading(true);
    try {
      const { data: jobs } = await supabase
        .from('sync_jobs')
        .select('brand_id, status, error, result, completed_at, created_at')
        .in('status', ['completed', 'failed', 'processing'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (!jobs) return;

      const MARKA_BENJA_ID = '00000000-0000-0000-0000-000000000001';
      const seen = new Set<string>();
      const map: Record<string, BrandSyncStatusData> = {};

      for (const job of jobs) {
        const effectiveId = job.brand_id ?? MARKA_BENJA_ID;
        if (seen.has(effectiveId)) continue;
        seen.add(effectiveId);

        const result = job.result as { error?: string } | null;
        const errorMsg = job.error || result?.error || null;

        map[effectiveId] = {
          status:
            job.status === 'completed' ? 'healthy' :
            job.status === 'processing' ? 'processing' : 'error',
          lastSync: job.completed_at ?? job.created_at,
          error: errorMsg,
        };
      }

      setBrandStatuses(map);
    } finally {
      setBrandStatusesLoading(false);
    }
  }, [brands]);

  const analyzeChats = useCallback(async () => {
    if (stats.unanalyzed === 0) {
      addLog('Analiz edilecek chat yok', 'info');
      return;
    }

    setAnalyzing(true);
    addLog(`${stats.unanalyzed} bekleyen chat analiz ediliyor...`, 'info');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-chat`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );

      const data = await response.json();

      if (data.success) {
        addLog(
          `Analiz tamamlandi: ${data.analyzed} chat analiz edildi, ${data.alerts_created || 0} uyari olusturuldu`,
          'success'
        );
      } else {
        const errorMsg = data.error || 'Bilinmeyen analiz hatasi olustu';
        console.error('Analysis error details:', data);
        addLog(`Analiz hatasi: ${errorMsg}`, 'error');
      }

      await loadStats();
    } catch (error) {
      console.error('Analysis Error:', error);
      addLog(`Analiz baglanti hatasi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`, 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [addLog, loadStats, stats.unanalyzed]);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCancelledRef = useRef(false);

  // Cleanup poll timer on unmount
  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const pollJobStatus = useCallback(async (jobId: string, label: string) => {
    const maxAttempts = 300; // 300 * 2s = 10 minutes max polling
    let attempts = 0;
    pollCancelledRef.current = false;

    const poll = async () => {
      if (pollCancelledRef.current) return;
      try {
        const { data: job, error } = await supabase
          .from('sync_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (pollCancelledRef.current) return;

        if (error) {
          console.error('Error polling job status:', error);
          addLog(`Job status kontrolu hatasi: ${error.message}`, 'error');
          setRunning(false);
          return;
        }

        if (job.status === 'completed') {
          const result = job.result as PipelineResult;
          setLastResult(result);
          const skippedMsg = result.skipped ? `, ${result.skipped} atlandi (limit)` : '';
          addLog(
            `Senkronizasyon tamamlandi (${label}): ${result.synced} chat senkronize, ${result.new_chats} yeni, ${result.analyzed} analiz edildi, ${result.alerts_sent} uyari gonderildi${skippedMsg}`,
            'success'
          );
          await Promise.all([loadStats(), loadBrandStatuses()]);
          setRunning(false);
          return;
        }

        if (job.status === 'failed') {
          addLog(`Senkronizasyon hatasi: ${job.error || 'Bilinmeyen hata'}`, 'error');
          await loadBrandStatuses();
          setRunning(false);
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          addLog(`Senkronizasyon zaman asimina ugradi (${label})`, 'error');
          setRunning(false);
          return;
        }

        pollTimerRef.current = setTimeout(poll, 2000);
      } catch (error: any) {
        if (pollCancelledRef.current) return;
        console.error('Polling error:', error);
        addLog(`Polling hatasi: ${error.message}`, 'error');
        setRunning(false);
      }
    };

    poll();
  }, [addLog, loadStats, loadBrandStatuses]);

  const runPipeline = useCallback(async (days?: number, customRange?: { start: string; end: string }) => {
    setRunning(true);
    let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-livechat?background=true`;
    if (activeBrand?.brand_id) {
      url += `&brand_id=${activeBrand.brand_id}`;
    }
    let label = '';

    if (customRange) {
      const start = new Date(customRange.start).toLocaleDateString('tr-TR');
      const end = new Date(customRange.end).toLocaleDateString('tr-TR');
      label = `${start} - ${end}`;
      url += `&start_date=${encodeURIComponent(customRange.start)}&end_date=${encodeURIComponent(customRange.end)}`;
    } else {
      const daysParam = days || 7;
      label = syncOptions.find(o => o.days === daysParam)?.label || `${daysParam} gun`;
      // Send both days and explicit date range for maximum compatibility
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysParam);
      url += `&days=${daysParam}&start_date=${encodeURIComponent(startDate.toISOString())}&end_date=${encodeURIComponent(endDate.toISOString())}`;
    }

    addLog(`Senkronizasyon baslatildi (${label})...`, 'info');

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      });

      if (!response.ok) {
        let errorText = '';
        try {
          const errorData = await response.json();

          if (response.status === 409) {
            const runningDuration = errorData.running_duration_seconds || 0;
            const minutes = Math.floor(runningDuration / 60);
            const seconds = runningDuration % 60;
            errorText = `Başka bir senkronizasyon zaten çalışıyor (${minutes}dk ${seconds}sn). Lütfen tamamlanmasını bekleyin.`;
          } else {
            errorText = errorData.error || errorData.message || `HTTP ${response.status}`;
          }

          console.error('HTTP Error Response:', errorData);
        } catch {
          errorText = await response.text();
          console.error('HTTP Error Text:', errorText);
        }
        addLog(`Senkronizasyon baslatma hatasi: ${errorText}`, 'error');
        setRunning(false);
        return;
      }

      const data = await response.json();

      if (data.job_id) {
        addLog(`Senkronizasyon arka planda devam ediyor (${label})...`, 'info');
        pollJobStatus(data.job_id, label);
      } else {
        addLog('Beklenmeyen yanit alindi', 'error');
        setRunning(false);
      }
    } catch (error) {
      console.error('Sync Error:', error);
      addLog(`Baglanti hatasi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`, 'error');
      setRunning(false);
    }
  }, [addLog, pollJobStatus, syncOptions, activeBrand]);

  useEffect(() => {
    loadStats();
    loadBrandStatuses();
    addLog('Sistem baslatildi -- Akilli senkronizasyon aktif (son cekilen chat sonrasi otomatik)', 'info');

    const statsInterval = setInterval(loadStats, 15000);
    const brandStatusInterval = setInterval(loadBrandStatuses, 30000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(brandStatusInterval);
    };
  }, [addLog, loadStats, loadBrandStatuses]);

  const sendPendingAlerts = async () => {
    addLog('Bekleyen Telegram uyarilari gonderiliyor...', 'info');
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-telegram-alerts`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        addLog(`${data.sent} Telegram uyarisi gonderildi`, 'success');
      } else {
        const errorMsg = data.error || 'Bilinmeyen Telegram hatasi olustu';
        console.error('Telegram error details:', data);
        addLog(`Telegram hatasi: ${errorMsg}`, 'error');
      }
      await loadStats();
    } catch (error) {
      addLog(`Telegram baglanti hatasi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`, 'error');
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
      case 'error': return 'text-red-300 bg-red-500/10 border-red-500/20';
      default: return 'text-blue-300 bg-blue-500/10 border-blue-500/20';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Canli Izleme</h1>
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 mt-1">Sistem durumu ve otomatik islem yonetimi</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-xs sm:text-sm">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Senk. (2dk - Sunucu)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 text-xs sm:text-sm">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-medium">Analiz (5dk - Sunucu)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="p-1.5 sm:p-2 bg-blue-500/15 rounded-lg">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            </div>
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Toplam Chat</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="p-1.5 sm:p-2 bg-emerald-500/15 rounded-lg">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            </div>
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Analiz Edilen</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.analyzed}</div>
        </div>
        <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="p-1.5 sm:p-2 bg-orange-500/15 rounded-lg">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
            </div>
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Bekleyen</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.unanalyzed}</div>
        </div>
        <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="p-1.5 sm:p-2 bg-red-500/15 rounded-lg">
              <Send className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            </div>
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Uyari</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">{pendingAlerts}</div>
        </div>
      </div>

      <BrandSyncStatusCards
        brands={brands}
        statuses={brandStatuses}
        loading={brandStatusesLoading}
      />

      <div className="glass-effect rounded-xl border border-blue-500/20 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-500/15 rounded-xl">
            <Zap className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Otomatik Sistem Yönetimi</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Sistem tamamen otomatik çalışmaktadır. Senkronizasyon ve analiz işlemleri sunucu tarafında otomatik olarak gerçekleştirilir.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span><strong>Senkronizasyon:</strong> Her 2 dakikada bir (son senkronizasyondan sonrası)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span><strong>Analiz:</strong> Her 5 dakikada bir otomatik</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">
              Manuel butonlar acil durumlar veya özel tarih aralıkları için kullanılabilir.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="relative">
          <div className="flex rounded-xl overflow-hidden">
            <button
              onClick={() => runPipeline(7)}
              disabled={running}
              className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white p-4 sm:p-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 sm:gap-4"
            >
              {running ? (
                <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin flex-shrink-0" />
              ) : (
                <Zap className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
              )}
              <div className="text-left">
                <div className="font-bold text-sm sm:text-lg">
                  {running ? 'Calistiriliyor...' : 'Manuel Senkronizasyon'}
                </div>
                <div className="text-xs sm:text-sm opacity-80">Tarih araligi sec</div>
              </div>
            </button>
            <button
              onClick={() => setSyncDropdownOpen(!syncDropdownOpen)}
              disabled={running}
              className="bg-blue-700 hover:bg-blue-800 text-white px-3 sm:px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center border-l border-blue-500/30"
            >
              <ChevronDown className={`w-5 h-5 transition-transform ${syncDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {syncDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSyncDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a2236] rounded-xl shadow-xl border border-slate-300 dark:border-white/10 overflow-hidden z-40">
                {syncOptions.map((option) => (
                  <button
                    key={option.days}
                    onClick={() => {
                      setSyncDropdownOpen(false);
                      runPipeline(option.days);
                    }}
                    disabled={running}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 dark:bg-white/5 transition-colors text-left disabled:opacity-50"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">{option.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{option.description}</div>
                    </div>
                    <span className="text-xs text-blue-400 font-medium bg-blue-500/15 border border-blue-500/20 px-2 py-1 rounded">{option.days} gun</span>
                  </button>
                ))}
                <div className="border-t border-slate-300 dark:border-white/10" />
                <button
                  onClick={() => {
                    setSyncDropdownOpen(false);
                    setShowCustomDatePicker(true);
                  }}
                  disabled={running}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 dark:bg-white/5 transition-colors text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">Özel Tarih Aralığı</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Başlangıç ve bitiş tarihi seç</div>
                    </div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={analyzeChats}
          disabled={analyzing || stats.unanalyzed === 0}
          className="bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white rounded-xl p-4 sm:p-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 sm:gap-4"
        >
          {analyzing ? (
            <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin flex-shrink-0" />
          ) : (
            <Activity className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
          )}
          <div className="text-left">
            <div className="font-bold text-sm sm:text-lg">
              {analyzing ? 'Analiz Ediliyor...' : 'Manuel Analiz'}
            </div>
            <div className="text-xs sm:text-sm opacity-80">{stats.unanalyzed} chat bekliyor</div>
          </div>
        </button>

        <button
          onClick={sendPendingAlerts}
          disabled={pendingAlerts === 0}
          className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl p-4 sm:p-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 sm:gap-4"
        >
          <Send className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
          <div className="text-left">
            <div className="font-bold text-sm sm:text-lg">Telegram Uyarilari</div>
            <div className="text-xs sm:text-sm opacity-80">{pendingAlerts} uyari bekliyor</div>
          </div>
        </button>
      </div>

      {lastResult && (
        <div className={`glass-effect rounded-xl border p-4 sm:p-6 ${lastResult.success ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
          <h3 className="font-bold text-base sm:text-lg mb-3 text-slate-900 dark:text-white">Son Pipeline Sonucu</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Senkronize</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{lastResult.synced || 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Yeni Chat</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{lastResult.new_chats || 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Analiz Edilen</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{lastResult.analyzed || 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Uyari Gonderilen</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{lastResult.alerts_sent || 0}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Zaman (İstanbul)</div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">
                {lastResult.timestamp ? new Date(lastResult.timestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '-'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Sistem Loglari</h2>
          <button
            onClick={() => setLogs([])}
            className="text-sm text-slate-100 hover:text-slate-700 dark:text-slate-200"
          >
            Temizle
          </button>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-slate-100">Henuz log yok</div>
          ) : (
            logs.map((log) => (
              <div
                key={log.time}
                className={`flex items-start gap-3 p-3 rounded-lg border ${getLogColor(log.type)}`}
              >
                {log.type === 'success' && <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {log.type === 'error' && <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {log.type === 'info' && <Activity className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{log.message}</div>
                  <div className="text-xs opacity-60 mt-0.5">
                    {new Date(log.time).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCustomDatePicker && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCustomDatePicker(false)}>
            <div className="bg-white dark:bg-[#0f1623] border border-slate-300 dark:border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/15 rounded-lg">
                  <Calendar className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Özel Tarih Aralığı</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Senkronizasyon için tarih seçin</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                    Başlangıç Tarihi
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                    Bitiş Tarihi
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    min={customStartDate}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCustomDatePicker(false)}
                  className="flex-1 px-4 py-3 bg-slate-200 dark:bg-white/10 border border-slate-300 dark:border-white/10 rounded-lg text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={() => {
                    if (customStartDate && customEndDate) {
                      // Send as explicit date strings with time to avoid timezone issues
                      // Edge function should interpret these as UTC
                      setShowCustomDatePicker(false);
                      runPipeline(undefined, {
                        start: `${customStartDate}T00:00:00Z`,
                        end: `${customEndDate}T23:59:59Z`
                      });
                    }
                  }}
                  disabled={!customStartDate || !customEndDate}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Senkronize Et
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
