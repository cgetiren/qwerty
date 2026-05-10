import { useEffect, useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import {
  X, Download, Printer, TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle, Star, Users, BarChart2, Target, Calendar, Clock,
  Award, MessageSquare, Repeat, Shield, Bell, Gift, Activity,
  Zap, ThumbsUp, ThumbsDown
} from 'lucide-react';
import BarChart from './BarChart';
import DonutChart from './DonutChart';
import TrendChart from './TrendChart';

interface ChatEvidence {
  chatId: string;
  customerName: string;
  date: string;
  score: number;
  aiSummary: string;
  recommendation: string;
}

interface EvidencedIssue {
  text: string;
  type: 'critical' | 'improvement';
  count: number;
  evidences: ChatEvidence[];
  correctApproach: string;
}

interface ScoreBreakdown {
  kritik: number;
  dikkat: number;
  olumsuz: number;
  orta: number;
  iyi: number;
  mukemmel: number;
}

interface AgentCoachingData {
  agentName: string;
  avgScore: number;
  totalChats: number;
  negativeSentimentCount: number;
  requiresAttentionCount: number;
  scoreBreakdown: ScoreBreakdown;
  evidencedIssues: EvidencedIssue[];
  coachingScript: string;
  lastActivityDate: string;
  trend: 'up' | 'down' | 'stable';
  urgency: 'high' | 'medium' | 'low' | 'excellent' | 'insufficient_activity';
  lowestScoringChats: ChatEvidence[];
  actionItems: string[];
}

interface CoachingFeedbackRecord {
  agent_name: string;
  sent_at: string;
  coaching_suggestion: string;
}

interface DailyStatRow {
  date: string;
  average_score: number;
  total_chats: number;
  total_issues: number;
}

interface AlertRow {
  alert_type: string;
  severity: string;
  created_at: string;
}

interface BonusRecord {
  personnel_name: string;
  total_bonus_amount: number;
  period_start: string;
  period_end: string;
  metrics_snapshot: Record<string, unknown>;
}

interface CoachingReportProps {
  coachingData: AgentCoachingData[];
  coachingHistory: Map<string, string>;
  dateRange: '1' | '7' | '30';
  onClose: () => void;
}

const SCORE_COLOR = (s: number) => {
  if (s >= 90) return '#10b981';
  if (s >= 70) return '#06b6d4';
  if (s >= 60) return '#3b82f6';
  if (s >= 40) return '#f59e0b';
  if (s >= 30) return '#f97316';
  return '#f43f5e';
};

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/_/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface ParsedCoaching {
  anaSorun: string;
  bullets: string[];
  ornekCevap: string;
  fallback: string;
}

function parseCoachingSuggestion(suggestion: string): ParsedCoaching {
  if (!suggestion) return { anaSorun: '', bullets: [], ornekCevap: '', fallback: '' };

  let text = suggestion;

  const ornekMatch = text.match(/(?:\d+\.\s*)?(?:\*\*)?Örnek Cevap(?:\*\*)?\s*:?\s*"?([\s\S]*?)(?:Bu şekilde[\s\S]*)?$/i);
  const ornekCevap = ornekMatch ? cleanText(ornekMatch[1]).replace(/["""]+$/, '').trim() : '';
  if (ornekMatch) text = text.slice(0, ornekMatch.index || text.length);

  const anaSorunMatch = text.match(/(?:\d+\.\s*)?(?:\*\*)?Ana Sorun(?:\*\*)?\s*:?\s*([\s\S]*?)(?=(?:\d+\.\s*)?(?:\*\*)?Yapılması|$)/i);
  const anaSorun = anaSorunMatch ? cleanText(anaSorunMatch[1]).replace(/\s+/g, ' ').trim() : '';

  const yapMatch = text.match(/(?:\d+\.\s*)?(?:\*\*)?Yapılması Gerekenler?(?:\*\*)?\s*:?\s*([\s\S]*?)$/i);
  let bullets: string[] = [];
  if (yapMatch) {
    const bulletText = yapMatch[1];
    bullets = bulletText
      .split(/\n|-(?=\s)/)
      .map(s => cleanText(s).trim())
      .filter(s => s.length > 5);
  }

  if (!anaSorun && bullets.length === 0 && !ornekCevap) {
    const parts = text
      .replace(/\*\*/g, '')
      .split(/\.\s+(?=[A-ZÇĞİÖŞÜa-zçğışöüA-Z])/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
      .slice(0, 4);
    return { anaSorun: '', bullets: [], ornekCevap: '', fallback: parts.join('. ') };
  }

  return { anaSorun, bullets, ornekCevap, fallback: '' };
}

export default function CoachingReport({ coachingData, coachingHistory, dateRange, onClose }: CoachingReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [feedbackRecords, setFeedbackRecords] = useState<CoachingFeedbackRecord[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyStatRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [bonusRecords, setBonusRecords] = useState<BonusRecord[]>([]);
  const [exporting, setExporting] = useState(false);

  const reportDate = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  useEffect(() => {
    loadExtraData();
  }, []);

  const loadExtraData = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const [feedbackRes, statsRes, alertsRes, bonusRes] = await Promise.all([
      supabase
        .from('coaching_feedbacks')
        .select('agent_name, sent_at, coaching_suggestion')
        .gte('sent_at', thirtyDaysAgo.toISOString())
        .order('sent_at', { ascending: false })
        .limit(50),
      supabase
        .from('personnel_daily_stats')
        .select('date, average_score, total_chats, total_issues')
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true }),
      supabase
        .from('alerts')
        .select('alert_type, severity, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('bonus_records')
        .select('personnel_name, total_bonus_amount, period_start, period_end, metrics_snapshot')
        .order('saved_at', { ascending: false })
        .limit(30),
    ]);

    if (feedbackRes.data) setFeedbackRecords(feedbackRes.data);

    if (alertsRes.data) setAlerts(alertsRes.data);
    if (bonusRes.data) setBonusRecords(bonusRes.data);

    if (statsRes.data && statsRes.data.length > 0) {
      const byDate = new Map<string, { totalScore: number; count: number; chats: number; issues: number }>();
      for (const row of statsRes.data) {
        const existing = byDate.get(row.date) || { totalScore: 0, count: 0, chats: 0, issues: 0 };
        existing.totalScore += Number(row.average_score);
        existing.count += 1;
        existing.chats += row.total_chats;
        existing.issues += row.total_issues || 0;
        byDate.set(row.date, existing);
      }
      const trend: DailyStatRow[] = [...byDate.entries()].map(([date, val]) => ({
        date,
        average_score: Math.round(val.totalScore / val.count),
        total_chats: val.chats,
        total_issues: val.issues,
      }));
      setDailyTrend(trend);
    }
  };

  const handlePrint = () => window.print();

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#0f172a',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pageHeight = pdf.internal.pageSize.getHeight();
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      while (position + pageHeight < pdfHeight) {
        position += pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, pdfWidth, pdfHeight);
      }
      pdf.save(`koçluk-raporu-${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const totalChats = coachingData.reduce((s, a) => s + a.totalChats, 0);
  const avgScore = coachingData.length > 0
    ? Math.round(coachingData.reduce((s, a) => s + a.avgScore, 0) / coachingData.length)
    : 0;
  const todayStr = new Date().toDateString();
  const coachedToday = [...coachingHistory.values()].filter(d => new Date(d).toDateString() === todayStr).length;
  const urgentCount = coachingData.filter(a => a.urgency === 'high').length;
  const excellentCount = coachingData.filter(a => a.urgency === 'excellent').length;
  const improvingCount = coachingData.filter(a => a.trend === 'up').length;
  const decliningCount = coachingData.filter(a => a.trend === 'down').length;
  const totalNegative = coachingData.reduce((s, a) => s + a.negativeSentimentCount, 0);
  const totalIssues = coachingData.reduce((s, a) => s + a.evidencedIssues.length, 0);

  const scoreBreakdownTotal = coachingData.reduce(
    (acc, a) => {
      (Object.keys(a.scoreBreakdown) as (keyof ScoreBreakdown)[]).forEach(k => {
        acc[k] = (acc[k] || 0) + a.scoreBreakdown[k];
      });
      return acc;
    },
    {} as Record<keyof ScoreBreakdown, number>
  );

  const issueCounts = new Map<string, number>();
  coachingData.forEach(a => {
    a.evidencedIssues.forEach(issue => {
      issueCounts.set(issue.text, (issueCounts.get(issue.text) || 0) + issue.count);
    });
  });
  const topIssues = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const agentScoreBarData = [...coachingData]
    .sort((a, b) => b.avgScore - a.avgScore)
    .map(a => ({ label: a.agentName, value: a.avgScore, color: SCORE_COLOR(a.avgScore) }));

  const donutData = [
    { label: 'Mükemmel (90+)', value: scoreBreakdownTotal.mukemmel || 0, color: '#10b981' },
    { label: 'İyi (70-89)', value: scoreBreakdownTotal.iyi || 0, color: '#06b6d4' },
    { label: 'Orta (60-69)', value: scoreBreakdownTotal.orta || 0, color: '#3b82f6' },
    { label: 'Olumsuz (40-59)', value: scoreBreakdownTotal.olumsuz || 0, color: '#f59e0b' },
    { label: 'Dikkat (30-39)', value: scoreBreakdownTotal.dikkat || 0, color: '#f97316' },
    { label: 'Kritik (0-29)', value: scoreBreakdownTotal.kritik || 0, color: '#f43f5e' },
  ].filter(d => d.value > 0);

  const trendChartData = dailyTrend.slice(-14).map(row => ({
    label: new Date(row.date).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' }),
    value: row.average_score,
  }));

  const attentionAgents = coachingData.filter(a => a.urgency === 'high');
  const coachingRepeatAgents = coachingData.filter(a => {
    const lastDate = coachingHistory.get(a.agentName);
    return lastDate && new Date(lastDate).toDateString() !== todayStr && a.evidencedIssues.length > 0;
  });

  const alertsBySeverity = alerts.reduce((acc, a) => {
    acc[a.severity] = (acc[a.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const alertsByType = alerts.reduce((acc, a) => {
    acc[a.alert_type] = (acc[a.alert_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topAlertTypes = Object.entries(alertsByType).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const totalTrendChats = dailyTrend.reduce((s, r) => s + r.total_chats, 0);
  const totalTrendIssues = dailyTrend.reduce((s, r) => s + (r.total_issues || 0), 0);
  const issueRate = totalTrendChats > 0 ? Math.round((totalTrendIssues / totalTrendChats) * 100) : 0;

  const latestBonusByAgent = new Map<string, BonusRecord>();
  bonusRecords.forEach(r => {
    if (!latestBonusByAgent.has(r.personnel_name)) {
      latestBonusByAgent.set(r.personnel_name, r);
    }
  });
  const bonusAgents = [...latestBonusByAgent.values()].sort((a, b) => b.total_bonus_amount - a.total_bonus_amount);
  const totalBonus = bonusAgents.reduce((s, r) => s + Number(r.total_bonus_amount), 0);

  const healthScore = Math.round(
    (avgScore * 0.4) +
    ((100 - issueRate) * 0.2) +
    (((coachingData.length - urgentCount) / Math.max(coachingData.length, 1)) * 100 * 0.2) +
    ((improvingCount / Math.max(coachingData.length, 1)) * 100 * 0.2)
  );

  const dateRangeLabel = dateRange === '1' ? 'Bugün' : `Son ${dateRange} Gün`;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-y-auto print:static print:bg-white">
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 px-6 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Yönetici Koçluk Raporu</span>
          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{dateRangeLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white hover:border-slate-500 text-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            Yazdır
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 text-sm transition-all disabled:opacity-50"
          >
            {exporting ? (
              <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            PDF İndir
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={reportRef} className="max-w-5xl mx-auto px-6 py-8 space-y-8 print:px-8 print:py-6">

        {/* Header */}
        <div className="text-center border-b border-slate-700/50 pb-6 print:border-slate-300">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-6 h-6 text-cyan-400 print:text-slate-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white print:text-slate-900">Yönetici Koçluk Raporu</h1>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm text-slate-500 dark:text-slate-400 print:text-slate-500 mt-2 flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{reportDate}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{dateRangeLabel} Verisi</span>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{coachingData.length} Personel</span>
            <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />{totalChats} Görüşme</span>
          </div>
        </div>

        {/* Sistem Sağlık Skoru */}
        <section>
          <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
            <Activity className="w-4 h-4 text-cyan-400" />
            Sistem Sağlık Skoru
          </h2>
          <div className="bg-slate-100/80 dark:bg-slate-800/40 rounded-xl border border-slate-700/40 p-5">
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#1e293b" strokeWidth="10" />
                  <circle
                    cx="48" cy="48" r="40" fill="none"
                    stroke={SCORE_COLOR(healthScore)}
                    strokeWidth="10"
                    strokeDasharray={`${(healthScore / 100) * 251.2} 251.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white" style={{ color: SCORE_COLOR(healthScore) }}>{healthScore}</span>
                  <span className="text-[10px] text-slate-500">/100</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-white">Sistem Sağlık Skoru</strong>, ekip ortalaması, sorun oranı, kritik personel yüzdesi ve iyileşme trendlerini birleştirerek hesaplanmış bileşik bir performans göstergesidir.
                  {healthScore >= 80
                    ? ' Ekip genel olarak sağlıklı bir seyir izlemektedir.'
                    : healthScore >= 65
                    ? ' Ekipin iyileşmeye ihtiyacı olan kritik noktaları bulunmaktadır.'
                    : ' Acil müdahale gerektiren sistemik sorunlar mevcut.'}
                </p>
                <div className="grid grid-cols-4 gap-3 mt-3">
                  {[
                    { label: 'Ort. Puan Katkısı', value: `%40`, sub: `${avgScore} puan`, color: 'text-cyan-400' },
                    { label: 'Sorun Oranı', value: `%${issueRate}`, sub: `${totalTrendIssues} sorun`, color: issueRate > 20 ? 'text-rose-400' : 'text-emerald-400' },
                    { label: 'Kritik Personel', value: `${urgentCount}/${coachingData.length}`, sub: 'acil görüşme', color: urgentCount > 0 ? 'text-rose-400' : 'text-emerald-400' },
                    { label: 'İyileşme Trendi', value: `${improvingCount}`, sub: 'personel artışta', color: 'text-emerald-400' },
                  ].map((item, i) => (
                    <div key={i} className="bg-slate-700/30 rounded-lg p-2.5 border border-slate-600/30 text-center">
                      <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                      <div className="text-xs text-slate-500 mt-0.5 leading-tight">{item.label}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5">{item.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Yönetici Özeti */}
        <section>
          <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
            <BarChart2 className="w-4 h-4 text-cyan-400" />
            Yönetici Özeti
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Users, label: 'Toplam Personel', value: coachingData.length, sub: `${totalChats} görüşme`, color: 'text-slate-600 dark:text-slate-300', border: 'border-slate-600/40' },
              { icon: Target, label: 'Ekip Ort. Puanı', value: avgScore, sub: avgScore >= 70 ? 'Hedef üzeri' : 'Hedef altı', color: avgScore >= 70 ? 'text-emerald-400' : 'text-amber-400', border: avgScore >= 70 ? 'border-emerald-500/30' : 'border-amber-500/30' },
              { icon: AlertTriangle, label: 'Acil Görüşme', value: urgentCount, sub: 'personel (ort.<60)', color: urgentCount > 0 ? 'text-rose-400' : 'text-slate-500 dark:text-slate-400', border: urgentCount > 0 ? 'border-rose-500/30' : 'border-slate-600/40' },
              { icon: CheckCircle, label: 'Bugün Görüşüldü', value: coachedToday, sub: `toplam ${coachingData.length} kişiden`, color: 'text-cyan-400', border: 'border-cyan-500/30' },
            ].map((item, i) => (
              <div key={i} className={`bg-slate-100 dark:bg-slate-800/50 print:bg-slate-50 rounded-xl p-4 border ${item.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">{item.label}</span>
                </div>
                <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
                <div className="text-xs text-slate-500 mt-1">{item.sub}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {[
              { icon: TrendingUp, label: 'İyileşen', value: improvingCount, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { icon: TrendingDown, label: 'Gerileyen', value: decliningCount, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
              { icon: Star, label: 'Mükemmel', value: excellentCount, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              { icon: ThumbsDown, label: 'Negatif Etkileşim', value: totalNegative, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
            ].map((item, i) => (
              <div key={i} className={`rounded-xl p-3 border ${item.bg} flex items-center gap-3`}>
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <div>
                  <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">{item.label}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Grafikler */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-100/80 dark:bg-slate-800/40 print:bg-white print:shadow-sm rounded-xl p-5 border border-slate-700/40 print:border-slate-200">
            <BarChart
              data={agentScoreBarData}
              title="Personel Skor Sıralaması"
              height={Math.max(200, coachingData.length * 42)}
            />
          </div>
          <div className="bg-slate-100/80 dark:bg-slate-800/40 print:bg-white print:shadow-sm rounded-xl p-5 border border-slate-700/40 print:border-slate-200">
            <DonutChart
              data={donutData}
              title="Görüşme Puan Dağılımı"
              centerText={String(totalChats)}
            />
          </div>
        </div>

        {trendChartData.length > 2 && (
          <div className="bg-slate-100/80 dark:bg-slate-800/40 print:bg-white print:shadow-sm rounded-xl p-5 border border-slate-700/40 print:border-slate-200">
            <TrendChart
              data={trendChartData}
              title="Ekip Ortalama Skor Trendi (Son 30 Gün)"
              color="#06b6d4"
              height={180}
            />
          </div>
        )}

        {/* Personel Detay Tablosu */}
        <section>
          <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
            <Users className="w-4 h-4 text-cyan-400" />
            Personel Detay Tablosu
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-700/40 print:border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80 print:bg-slate-100 text-slate-500 dark:text-slate-400 print:text-slate-600">
                  <th className="text-left px-4 py-3 font-medium">Personel</th>
                  <th className="text-center px-3 py-3 font-medium">Ort. Puan</th>
                  <th className="text-center px-3 py-3 font-medium">Görüşme</th>
                  <th className="text-center px-3 py-3 font-medium">Negatif</th>
                  <th className="text-center px-3 py-3 font-medium">Sorun</th>
                  <th className="text-center px-3 py-3 font-medium">Trend</th>
                  <th className="text-center px-3 py-3 font-medium">Öncelik</th>
                  <th className="text-center px-3 py-3 font-medium">Koçluk</th>
                </tr>
              </thead>
              <tbody>
                {coachingData.map((agent, i) => {
                  const lastDate = coachingHistory.get(agent.agentName);
                  const coached = lastDate ? new Date(lastDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '—';
                  const urgencyMap: Record<string, string> = { high: 'Acil', medium: 'Orta', low: 'İyi', excellent: 'Mükemmel' };
                  const urgencyColorClass: Record<string, string> = {
                    high: 'text-rose-400 bg-rose-500/10',
                    medium: 'text-amber-400 bg-amber-500/10',
                    low: 'text-cyan-400 bg-cyan-500/10',
                    excellent: 'text-emerald-400 bg-emerald-500/10',
                  };
                  return (
                    <tr key={agent.agentName} className={`border-t border-slate-700/30 print:border-slate-100 ${i % 2 === 0 ? 'bg-slate-800/20 print:bg-white' : 'bg-slate-100/80 dark:bg-slate-800/40 print:bg-slate-50'}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white print:text-slate-900">{agent.agentName}</td>
                      <td className="px-3 py-2.5 text-center font-bold" style={{ color: SCORE_COLOR(agent.avgScore) }}>{agent.avgScore}</td>
                      <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-300 print:text-slate-600">{agent.totalChats}</td>
                      <td className="px-3 py-2.5 text-center text-rose-400">{agent.negativeSentimentCount}</td>
                      <td className="px-3 py-2.5 text-center text-amber-400">{agent.evidencedIssues.length}</td>
                      <td className="px-3 py-2.5 text-center">
                        {agent.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto" />}
                        {agent.trend === 'down' && <TrendingDown className="w-4 h-4 text-rose-400 mx-auto" />}
                        {agent.trend === 'stable' && <Minus className="w-4 h-4 text-slate-500 dark:text-slate-400 mx-auto" />}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgencyColorClass[agent.urgency]}`}>
                          {urgencyMap[agent.urgency]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-slate-500 dark:text-slate-400">{coached}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Alert Analizi */}
        {alerts.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
              <Bell className="w-4 h-4 text-amber-400" />
              Uyarı & Alert Analizi (Son 30 Gün)
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Toplam Alert', value: alerts.length, color: 'text-slate-600 dark:text-slate-300', border: 'border-slate-600/40', icon: Bell },
                { label: 'Kritik Seviye', value: alertsBySeverity['high'] || alertsBySeverity['critical'] || 0, color: 'text-rose-400', border: 'border-rose-500/30', icon: AlertTriangle },
                { label: 'Telegram Gönderilen', value: alerts.length, color: 'text-cyan-400', border: 'border-cyan-500/30', icon: Zap },
              ].map((item, i) => (
                <div key={i} className={`bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 border ${item.border}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>
            {topAlertTypes.length > 0 && (
              <div className="bg-slate-100/60 dark:bg-slate-800/30 rounded-xl border border-slate-700/40 overflow-hidden">
                <div className="bg-slate-700/40 px-4 py-2.5 border-b border-slate-600/30">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Alert Türleri</span>
                </div>
                <div className="p-4 space-y-2">
                  {topAlertTypes.map(([type, count], i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-slate-600 dark:text-slate-300">{type.replace(/_/g, ' ')}</span>
                          <span className="text-xs font-bold text-amber-400">{count}</span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500/50 rounded-full" style={{ width: `${Math.min((count / alerts.length) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Bonus Durumu */}
        {bonusAgents.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
              <Gift className="w-4 h-4 text-emerald-400" />
              Bonus Performans Özeti
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-emerald-950/20 rounded-xl p-4 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Toplam Tahakkuk Eden Bonus</span>
                </div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">₺{totalBonus.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</div>
                <div className="text-xs text-slate-500 mt-1">{bonusAgents.length} personel</div>
              </div>
              <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-600/40">
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsUp className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">Kişi Başı Ortalama Bonus</span>
                </div>
                <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">₺{Math.round(totalBonus / bonusAgents.length).toLocaleString('tr-TR')}</div>
                <div className="text-xs text-slate-500 mt-1">son hesaplama dönemi</div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-700/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-500 dark:text-slate-400">
                    <th className="text-left px-4 py-3 font-medium">Personel</th>
                    <th className="text-right px-4 py-3 font-medium">Bonus</th>
                    <th className="text-center px-3 py-3 font-medium">Dönem</th>
                    <th className="text-center px-3 py-3 font-medium">Performans Skoru</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusAgents.slice(0, 8).map((b, i) => {
                    const agentData = coachingData.find(a => a.agentName === b.personnel_name);
                    const snapshot = b.metrics_snapshot as Record<string, unknown>;
                    const scoreFromSnapshot = snapshot?.average_score ? Number(snapshot.average_score) : agentData?.avgScore;
                    return (
                      <tr key={i} className={`border-t border-slate-700/30 ${i % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-100/80 dark:bg-slate-800/40'}`}>
                        <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{b.personnel_name}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-400">₺{Number(b.total_bonus_amount).toLocaleString('tr-TR')}</td>
                        <td className="px-3 py-2.5 text-center text-xs text-slate-500 dark:text-slate-400">
                          {new Date(b.period_start).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                          {' – '}
                          {new Date(b.period_end).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {scoreFromSnapshot ? (
                            <span className="font-bold text-sm" style={{ color: SCORE_COLOR(scoreFromSnapshot) }}>{Math.round(scoreFromSnapshot)}</span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Acil Görüşme Gereken Personel */}
        {attentionAgents.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Acil Görüşme Gereken Personel ({attentionAgents.length} kişi)
            </h2>
            <div className="space-y-3">
              {attentionAgents.map(agent => (
                <div key={agent.agentName} className="bg-rose-950/20 print:bg-red-50 rounded-xl p-4 border border-rose-500/20 print:border-red-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white print:text-slate-900">{agent.agentName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Ort. Puan: <span className="text-rose-400 font-bold">{agent.avgScore}</span>
                        {' · '}{agent.totalChats} görüşme
                        {' · '}{agent.negativeSentimentCount} negatif
                      </div>
                    </div>
                    <div className="text-xs text-rose-400 font-medium flex-shrink-0">{agent.evidencedIssues.length} sorun tespit edildi</div>
                  </div>
                  {agent.evidencedIssues.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {agent.evidencedIssues.slice(0, 4).map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${issue.type === 'critical' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                          <span className="text-slate-600 dark:text-slate-300 print:text-slate-600">{issue.text}</span>
                          <span className="text-slate-500 flex-shrink-0">{issue.count}x</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tekrarlayan Sorunlar */}
        {coachingRepeatAgents.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
              <Repeat className="w-4 h-4 text-amber-400" />
              Tekrarlayan Sorun — Koçluk Sonrası Devam Eden Vakalar ({coachingRepeatAgents.length} kişi)
            </h2>
            <div className="overflow-x-auto rounded-xl border border-amber-500/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-950/20 text-amber-400">
                    <th className="text-left px-4 py-3 font-medium">Personel</th>
                    <th className="text-center px-3 py-3 font-medium">Son Koçluk</th>
                    <th className="text-center px-3 py-3 font-medium">Güncel Puan</th>
                    <th className="text-left px-4 py-3 font-medium">Devam Eden Sorunlar</th>
                  </tr>
                </thead>
                <tbody>
                  {coachingRepeatAgents.map((agent, i) => {
                    const lastDate = coachingHistory.get(agent.agentName)!;
                    const diff = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={agent.agentName} className={`border-t border-amber-500/10 ${i % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-100/80 dark:bg-slate-800/40'}`}>
                        <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{agent.agentName}</td>
                        <td className="px-3 py-2.5 text-center text-amber-400">{diff === 0 ? 'Bugün' : diff === 1 ? 'Dün' : `${diff} gün önce`}</td>
                        <td className="px-3 py-2.5 text-center font-bold" style={{ color: SCORE_COLOR(agent.avgScore) }}>{agent.avgScore}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                          {agent.evidencedIssues.slice(0, 2).map(i => i.text).join('; ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* En Sık Görülen Sorunlar */}
        {topIssues.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              En Sık Görülen Sorunlar
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-700/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-500 dark:text-slate-400">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Sorun</th>
                    <th className="text-center px-3 py-3 font-medium">Frekans</th>
                    <th className="text-center px-3 py-3 font-medium">Oran</th>
                    <th className="text-left px-4 py-3 font-medium">Etkilenen Personel</th>
                  </tr>
                </thead>
                <tbody>
                  {topIssues.map(([issue, count], i) => {
                    const affected = coachingData.filter(a => a.evidencedIssues.some(ei => ei.text === issue)).map(a => a.agentName);
                    const pct = totalChats > 0 ? Math.round((count / totalChats) * 100) : 0;
                    return (
                      <tr key={i} className={`border-t border-slate-700/30 ${i % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-100/80 dark:bg-slate-800/40'}`}>
                        <td className="px-4 py-2.5 text-slate-500 font-mono">{i + 1}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{issue}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-sm font-bold text-amber-400">{count}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-slate-500">%{pct}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{affected.join(', ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Son Koçluk Aktiviteleri */}
        {feedbackRecords.length > 0 && (() => {
          const grouped = feedbackRecords.reduce<Record<string, CoachingFeedbackRecord[]>>((acc, fb) => {
            if (!acc[fb.agent_name]) acc[fb.agent_name] = [];
            acc[fb.agent_name].push(fb);
            return acc;
          }, {});
          const agents = Object.entries(grouped);
          return (
            <section>
              <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
                <Award className="w-4 h-4 text-cyan-400" />
                Son Koçluk Aktiviteleri
              </h2>
              <div className="space-y-5">
                {agents.map(([agentName, records]) => (
                  <div key={agentName} className="rounded-xl border border-slate-700/40 overflow-hidden bg-slate-800/20 print:bg-white print:border-slate-200">
                    <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-700/30 border-b border-slate-700/40">
                      <div className="w-9 h-9 rounded-full bg-slate-600/60 border border-slate-500/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          {agentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{agentName}</span>
                      </div>
                      <span className="text-xs text-slate-500 bg-slate-600/40 px-2.5 py-1 rounded-full">
                        {records.length} koçluk seansı
                      </span>
                    </div>

                    <div className="divide-y divide-slate-700/30">
                      {records.map((fb, si) => {
                        const parsed = parseCoachingSuggestion(fb.coaching_suggestion);
                        const hasContent = parsed.anaSorun || parsed.bullets.length > 0 || parsed.ornekCevap || parsed.fallback;
                        return (
                          <div key={si} className="px-5 py-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-slate-600/50 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{si + 1}</span>
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(fb.sent_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {hasContent ? (
                              <div className="pl-7 space-y-4">
                                {parsed.anaSorun && (
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                                      <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wide">Tespit Edilen Sorun</span>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed print:text-slate-800">{parsed.anaSorun}</p>
                                  </div>
                                )}

                                {parsed.bullets.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                      <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide">Yapılması Gerekenler</span>
                                    </div>
                                    <ul className="space-y-1.5">
                                      {parsed.bullets.map((bullet, bi) => (
                                        <li key={bi} className="flex items-start gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 flex-shrink-0 mt-2" />
                                          <span className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed print:text-slate-700">{bullet}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {parsed.ornekCevap && (
                                  <div>
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                      <MessageSquare className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                                      <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wide">Örnek Yaklaşım</span>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed italic border-l-2 border-cyan-500/30 pl-3 print:text-slate-700">
                                      {parsed.ornekCevap}
                                    </p>
                                  </div>
                                )}

                                {parsed.fallback && (
                                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed print:text-slate-700">{parsed.fallback}</p>
                                )}
                              </div>
                            ) : (
                              <p className="pl-7 text-sm text-slate-500 italic">Genel performans değerlendirmesi yapıldı.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Stratejik Değerlendirme */}
        <section>
          <h2 className="text-base font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2 print:text-slate-700">
            <Star className="w-4 h-4 text-emerald-400" />
            Yönetici Değerlendirmesi & Stratejik Öneriler
          </h2>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-600/40 overflow-hidden">
              <div className="bg-slate-700/40 px-5 py-3 flex items-center gap-2 border-b border-slate-600/30">
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">1. Dönem Performans Durumu</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-slate-800/30 px-5 py-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong className="text-slate-900 dark:text-white">{dateRangeLabel}</strong> döneminde{' '}
                  <strong className="text-slate-900 dark:text-white">{coachingData.length} personelin</strong> toplam{' '}
                  <strong className="text-slate-900 dark:text-white">{totalChats} müşteri görüşmesi</strong> yapay zeka ile analiz edilmiş; ekip geneli ortalama puan{' '}
                  <strong style={{ color: SCORE_COLOR(avgScore) }}>{avgScore}/100</strong> olarak hesaplanmıştır.{' '}
                  <strong className="text-rose-400">{totalNegative} negatif etkileşim</strong> ve{' '}
                  <strong className="text-amber-400">{totalIssues} tespit edilen sorun</strong> kayıt altına alınmıştır.
                  {avgScore >= 85
                    ? ' Ekip yüksek performans kültürünü başarıyla benimsemiş; mevcut motivasyonun korunması öncelikli hedef olmalıdır.'
                    : avgScore >= 70
                    ? ' Sonuçlar kabul edilebilir sınırlarda; 80+ bandına taşımak için yapılandırılmış iyileştirme adımları gereklidir.'
                    : ' Sonuçlar hedefin belirgin biçimde altında; acil ve sistematik müdahale planı devreye alınmalıdır.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { label: 'Acil', val: urgentCount, color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
                    { label: 'Orta Öncelik', val: coachingData.filter(a => a.urgency === 'medium').length, color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
                    { label: 'İyi', val: coachingData.filter(a => a.urgency === 'low').length, color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
                    { label: 'Mükemmel', val: excellentCount, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                  ].map((b, i) => (
                    <span key={i} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${b.color}`}>
                      {b.val} personel — {b.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {urgentCount > 0 && (
              <div className="rounded-xl border border-rose-500/25 overflow-hidden">
                <div className="bg-rose-950/30 px-5 py-3 flex items-center gap-2 border-b border-rose-500/20">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-bold text-rose-300">2. Risk & Kritik Personel Profili</span>
                </div>
                <div className="bg-rose-950/10 px-5 py-4 space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    <strong className="text-rose-400">{urgentCount} personel</strong> 60 puan altında seyretmektedir. Bu durum müşteri memnuniyetsizliği riskini artırmakta; uzun vadede marka itibarına zarar verebilir.
                    {coachingRepeatAgents.length > 0 && (
                      <> <strong className="text-amber-400">{coachingRepeatAgents.length} personelde</strong> ise önceki koçluğa rağmen sorunlar devam ediyor; bu mevcut yöntemin bu personeller için yeterlisiz olduğuna işaret etmektedir.</>
                    )}
                    {alerts.length > 0 && (
                      <> Son 30 günde <strong className="text-amber-400">{alerts.length} sistem uyarısı</strong> tetiklenmiştir; bu uyarıların koçluk kararlarıyla paralel takip edilmesi önerilir.</>
                    )}
                  </p>
                  {attentionAgents.slice(0, 3).map(agent => (
                    <div key={agent.agentName} className="bg-slate-100/80 dark:bg-slate-800/40 rounded-lg px-4 py-3 border border-slate-700/30">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{agent.agentName}</span>
                        <span className="text-xs font-bold text-rose-400">{agent.avgScore} puan · {agent.totalChats} görüşme</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {agent.negativeSentimentCount > 0 && <><strong className="text-rose-400">{agent.negativeSentimentCount}</strong> negatif etkileşim. </>}
                        {agent.evidencedIssues.length > 0 && <>Başlıca sorunlar: <em>{agent.evidencedIssues.slice(0, 2).map(i => i.text).join(', ')}</em>.</>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topIssues.length > 0 && (
              <div className="rounded-xl border border-amber-500/25 overflow-hidden">
                <div className="bg-amber-950/20 px-5 py-3 flex items-center gap-2 border-b border-amber-500/20">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-amber-300">3. Sistemik Sorunlar & Kök Neden Analizi</span>
                </div>
                <div className="bg-amber-950/5 px-5 py-4">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                    Birden fazla personelde tekrar eden örüntüler tespit edilmiştir. Bu bulgular münferit hatalar değil, <strong className="text-amber-400">ekip genelinde yapısal bir eğitim ihtiyacını</strong> işaret eden sistemik bulgulardır.
                  </p>
                  <div className="space-y-2">
                    {topIssues.slice(0, 5).map(([issue, count], i) => {
                      const affected = coachingData.filter(a => a.evidencedIssues.some(ei => ei.text === issue));
                      const pct = totalChats > 0 ? Math.round((count / totalChats) * 100) : 0;
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                          <div className="flex-1">
                            <div className="text-sm text-slate-700 dark:text-slate-200 font-medium">{issue}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {count} görünüm · görüşmelerin %{pct}'inde · {affected.length > 1 ? `${affected.length} farklı personelde` : `${affected[0]?.agentName || ''}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {topIssues.length > 1 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed border-t border-slate-700/30 pt-3">
                      Bu bulgular, bireysel koçluğa ek olarak tüm ekibi kapsayan bir <strong className="text-slate-900 dark:text-white">kalite odaklı grup eğitimi</strong> yapılmasının gerekli olduğunu ortaya koymaktadır. Pratik senaryo çalışmalarıyla desteklenmesi önerilmektedir.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-600/40 overflow-hidden">
              <div className="bg-slate-700/40 px-5 py-3 flex items-center gap-2 border-b border-slate-600/30">
                <CheckCircle className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">4. Koçluk Süreci Değerlendirmesi</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-slate-800/30 px-5 py-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {feedbackRecords.length > 0
                    ? <>Son 30 gün içinde <strong className="text-slate-900 dark:text-white">{feedbackRecords.length} koçluk görüşmesi</strong> kayıt altına alınmış; <strong className="text-cyan-400">{new Set(feedbackRecords.map(f => f.agent_name)).size} farklı personele</strong> geri bildirim verilmiştir.</>
                    : <>Bu dönemde henüz kayıtlı koçluk aktivitesi bulunmamaktadır.</>
                  }
                  {' '}{improvingCount > 0 && <><strong className="text-emerald-400">{improvingCount} personel</strong> puan artışı kaydetmiş; koçluk yönteminin somut etki yarattığını göstermektedir. </>}
                  {decliningCount > 0 && <><strong className="text-rose-400">{decliningCount} personelin</strong> puanında gerileme gözlemlenmektedir; koçluk sıklığı gözden geçirilmelidir. </>}
                  {coachingRepeatAgents.length > 0 && (
                    <> Tekrarlayan sorunları olan <strong className="text-amber-400">{coachingRepeatAgents.length} personel</strong> için role-play, çağrı dinleme ya da birebir mentorluk gibi alternatif yaklaşımlar değerlendirilmelidir.</>
                  )}
                </p>
              </div>
            </div>

            {excellentCount > 0 && (
              <div className="rounded-xl border border-emerald-500/25 overflow-hidden">
                <div className="bg-emerald-950/20 px-5 py-3 flex items-center gap-2 border-b border-emerald-500/20">
                  <Star className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">5. Güçlü Yönler & Takdir Edilecek Başarılar</span>
                </div>
                <div className="bg-emerald-950/5 px-5 py-4">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    <strong className="text-emerald-400">{coachingData.filter(a => a.urgency === 'excellent').map(a => a.agentName).join(', ')}</strong>{' '}
                    mükemmel performans sergilemiş; ortalama puanları{' '}
                    <strong className="text-emerald-400">{Math.round(coachingData.filter(a => a.urgency === 'excellent').reduce((s, a) => s + a.avgScore, 0) / excellentCount)}/100</strong>'dir.
                    Bu personeller <strong className="text-slate-900 dark:text-white">ekip içi mentor</strong> olarak görevlendirilerek bilgi transferi sağlanabilir.
                    {bonusAgents.length > 0 && (
                      <> Toplam <strong className="text-emerald-400">₺{totalBonus.toLocaleString('tr-TR')}</strong> bonus tahakkuk etmesi, performans ödüllendirme sisteminin çalıştığını göstermektedir.</>
                    )}
                    {' '}<span className="text-xs text-slate-500">(Mentör önerileri en az 30 analiz edilmiş görüşmesi olan personele aittir.)</span>
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-cyan-500/25 overflow-hidden">
              <div className="bg-cyan-950/20 px-5 py-3 flex items-center gap-2 border-b border-cyan-500/20">
                <Target className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-cyan-300">6. Öncelikli Aksiyon Planı</span>
              </div>
              <div className="bg-slate-800/20 px-5 py-4 space-y-3">
                {[
                  urgentCount > 0 && {
                    n: 1, color: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
                    title: 'Acil Bireysel Görüşmeler',
                    text: `${attentionAgents.map(a => a.agentName).join(', ')} ile bu hafta içinde birebir görüşme planlanmalı; tespit edilen sorunlar somut chat örnekleriyle gösterilmeli ve 2 haftalık iyileşme hedefi belirlenerek takip tarihi netleştirilmelidir.`,
                  },
                  topIssues.length > 1 && {
                    n: 2, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
                    title: 'Ekip Geneli Kalite Eğitimi',
                    text: `"${topIssues[0][0]}" ve "${topIssues[1]?.[0] || topIssues[0][0]}" sorunları birden fazla personeli etkilemekte. Bu konulara odaklanan pratik senaryo çalışmalarını içeren bir grup eğitimi, aylık kalite puanını 5-10 puan artırabilir.`,
                  },
                  alerts.length > 0 && {
                    n: 3, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
                    title: 'Alert Takibi & Erken Müdahale',
                    text: `Son 30 günde ${alerts.length} sistem uyarısı tetiklenmiştir. Yüksek frekanslı alert türleri (${topAlertTypes.slice(0, 2).map(([t]) => t.replace(/_/g, ' ')).join(', ')}) için proaktif koçluk müdahalesi planlanmalıdır.`,
                  },
                  excellentCount > 0 && {
                    n: 4, color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
                    title: 'Mentorluk Programı Başlatın',
                    text: `${coachingData.filter(a => a.urgency === 'excellent').map(a => a.agentName).join(', ')} (en az 30 görüşmesiyle doğrulanmış yüksek performans) düşük puanlı personellerle eşleştirilerek haftalık peer-coaching seansları düzenlenebilir. Bu model hem üst performansı ödüllendirip hem de bilgi transferini organik biçimde sağlar.`,
                  },
                  coachingRepeatAgents.length > 0 && {
                    n: 5, color: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
                    title: 'Tekrarlayan Vakalar için Yöntem Değişikliği',
                    text: `${coachingRepeatAgents.map(a => a.agentName).join(', ')} standart koçluk yaklaşımına yanıt vermemektedir. Yazılı gelişim planı hazırlanmalı, haftalık kontrol görüşmeleri takvime alınmalı ve 30 günlük ölçülebilir hedef belirlenmeli.`,
                  },
                  {
                    n: 6, color: 'text-slate-600 dark:text-slate-300 bg-slate-600/20 border-slate-600/30',
                    title: 'Haftalık Koçluk Ritmi Oluşturun',
                    text: `Her hafta belirli bir günde AI analiz sonuçları incelenmeli, öncelikli personeller belirlenmeli ve geri bildirimler kayıt altına alınmalıdır. Bu sistem 4-6 hafta içinde ölçülebilir ekip performansı artışı sağlayacaktır.`,
                  },
                ].filter(Boolean).map((item: any) => (
                  <div key={item.n} className="flex items-start gap-3">
                    <span className={`w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${item.color}`}>{item.n}</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">{item.title}</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-600/40 overflow-hidden">
              <div className="bg-slate-700/40 px-5 py-3 flex items-center gap-2 border-b border-slate-600/30">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">7. 30 Günlük Hedef Projeksiyonu</span>
              </div>
              <div className="bg-slate-100/60 dark:bg-slate-800/30 px-5 py-4">
                <div className="flex items-center gap-6 mb-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold" style={{ color: SCORE_COLOR(avgScore) }}>{avgScore}</div>
                    <div className="text-xs text-slate-500">Mevcut Ort.</div>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(avgScore, 100)}%`, backgroundColor: SCORE_COLOR(avgScore) }} />
                    </div>
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" style={{ left: `${Math.min(avgScore + 10, 100)}%`, transform: 'translate(-50%, -50%)' }} />
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{Math.min(avgScore + 10, 100)}</div>
                    <div className="text-xs text-slate-500">30G Hedef</div>
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Aksiyon planının düzenli uygulanması durumunda ekip ortalamasının{' '}
                  <strong className="text-emerald-400">{Math.min(avgScore + 8, 100)}-{Math.min(avgScore + 12, 100)} bandına</strong> taşınması beklenmektedir.
                  {urgentCount > 0 && <> <strong className="text-slate-900 dark:text-white">{urgentCount} kritik personelin</strong> öncelikli koçlukla stabil seviyeye getirilmesi,</>}
                  {topIssues.length > 1 && <> grup eğitimiyle sistemik sorunların azaltılması</>}
                  {excellentCount > 0 && <> ve mentorluk programıyla bilgi transferinin hızlandırılması</>}
                  {' '}bu hedefe ulaşmada belirleyici faktörler olacaktır.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-xs text-slate-600 border-t border-slate-700/30 pt-4">
          Bu rapor {reportDate} tarihinde otomatik olarak oluşturulmuştur.
          Veriler {dateRangeLabel.toLowerCase()} dönemine ait chat analiz, alert ve bonus kayıtlarından derlenmiştir.
        </div>
      </div>
    </div>
  );
}
