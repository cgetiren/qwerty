import { useState } from 'react';
import { TrendingUp, TrendingDown, Award, Medal, X, Star, MessageSquare, Target, Zap, ThumbsUp, AlertTriangle, ChevronRight, Clock, Minus } from 'lucide-react';

interface WeakCategory {
  name: string;
  score: number;
}

interface LeaderboardItem {
  name: string;
  score: number;
  change?: number;
  details?: string;
  chatCount?: number;
  avgSatisfaction?: number;
  trendDiff?: number;
  prevScore?: number;
  langScore?: number;
  qualityScore?: number;
  perfScore?: number;
  weakestCategory?: WeakCategory | null;
  criticalCount?: number;
  avgResponseTime?: number;
  isNewAgent?: boolean;
}

interface LeaderboardProps {
  data: LeaderboardItem[];
  title: string;
  type?: 'top' | 'bottom';
  teamTopScore?: number;
}

function formatSeconds(s: number): string {
  if (s <= 0) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}d ${rem}s` : `${m}d`;
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  if (!score || score <= 0) return null;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-xs font-semibold text-slate-900 dark:text-white">{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(score, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function generateInsights(item: LeaderboardItem, type: 'top' | 'bottom', rank: number, teamTopScore: number) {
  const { score, chatCount = 0, avgSatisfaction = 0, trendDiff = 0, criticalCount = 0, avgResponseTime = 0, weakestCategory, isNewAgent = false } = item;
  const gap = teamTopScore - score;

  const suggestions: string[] = [];
  const motivations: string[] = [];
  let whyHere = '';
  let motivationMessage = '';

  if (type === 'bottom') {
    if (isNewAgent) {
      whyHere = `${item.name} için henüz geçen aya ait veri bulunmuyor — son 30 günde sistemde aktif olan yeni bir personel. Bu liste trend bazlı sıralanamadığı için düşük mutlak skor nedeniyle buraya dahil edildi. Bir ay sonra tam trend karşılaştırması yapılabilecek.`;
    } else if (trendDiff < 0) {
      whyHere = `${item.name}, geçen aya kıyasla ${Math.abs(trendDiff)} puan düşüş yaşadı (${item.prevScore ?? '?'} → ${score}). Bu liste en büyük puan kayıplarına göre sıralanır — düşük mutlak skor değil, düşüş trendi belirleyicidir.`;
    } else {
      whyHere = `Bu liste, takım içinde görece en düşük ortalama performansa sahip personeli gösterir. ${item.name}'in puanı düşük değil — takımın genel seviyesi yüksek. ${gap > 0 ? `Lider performansçıdan yalnızca ${gap} puan geride.` : 'Aslında en yüksek skorla eşit seviyede!'}`;
    }

    if (isNewAgent) {
      motivationMessage = `İlk ay her zaman en zor olandır. ${score >= 70 ? `${score} puanla gerçekten iyi bir başlangıç yaptın — bu tempoyu koru.` : 'Şu an öğrenme sürecinin en yoğun dönemdesin. Zorlu chatler seni hızla geliştirecek.'} Bir ay sonra tam bir trend karşılaştırmasıyla nerede olduğunu net göreceksin.`;
    } else if (score >= 90) {
      motivationMessage = `Performansın gerçekten güçlü! ${trendDiff < 0 ? `Geçen aya göre ${Math.abs(trendDiff)} puanlık düşüş geçici olabilir — nedenini analiz edelim.` : 'Bu listede görünmen, takımın ne kadar yüksek bir çıtaya sahip olduğunu gösteriyor.'} Birkaç küçük adımla liderlik tablosuna geçebilirsin.`;
    } else if (score >= 70) {
      motivationMessage = `Sağlam bir performans sergiliyorsun. ${trendDiff < -3 ? 'Düşüş trendi dikkat gerektiriyor ama bu çevrilebilir bir süreç.' : 'Odaklanman gereken birkaç alan var ama potansiyelinin farkındayız.'} Tutarlı bir çalışmayla önümüzdeki ay büyük fark yaratabilirsin.`;
    } else {
      motivationMessage = `Her uzmanlık bir süreç gerektirir. Şu an gelişim eğrisinin tam ortasındasın — doğru odaklanmayla hızla yükseleceksin. Takım sana inanıyor.`;
    }

    if (weakestCategory) {
      suggestions.push(`En zayıf kategori: "${weakestCategory.name}" (${weakestCategory.score} puan). Bu alana odaklanmak genel puanını en hızlı artıracak yöntem.`);
    }

    if (criticalCount > 0) {
      const criticalRatio = chatCount > 0 ? Math.round((criticalCount / chatCount) * 100) : 0;
      suggestions.push(`Son 30 günde ${criticalCount} kritik chat (puan < 60) — toplamın %${criticalRatio}'i. Bu konuşmaların ortak paydalarını incele.`);
    }

    if (avgSatisfaction > 0 && avgSatisfaction < 3.5) {
      suggestions.push(`Müşteri memnuniyeti ${avgSatisfaction}/5 ile düşük. Daha empatik ve kişiselleştirilmiş yanıtlarla bu puanı hızla artırabilirsin.`);
    } else if (avgSatisfaction >= 4.5) {
      suggestions.push(`Müşteri memnuniyetin ${avgSatisfaction}/5 ile mükemmel — bu güçlü yanını AI analiz puanına da yansıtmaya çalış.`);
    }

    if (avgResponseTime > 120) {
      suggestions.push(`Ortalama ilk yanıt süresi ${formatSeconds(avgResponseTime)} — hızlanmak puan ve memnuniyeti doğrudan etkiler.`);
    }

    if (gap >= 5) {
      suggestions.push(`En iyi performansçıdan ${gap} puan geride. Bu farkı kapatmak için her chat'te çözüm kalitesine odaklan.`);
    } else if (gap > 0 && gap < 5) {
      suggestions.push(`Lider performansçıdan sadece ${gap} puan geridsin — bu fark son derece küçük, bir haftalık odaklanmayla kapatılabilir.`);
    }

    motivations.push('Her chat bir öğrenme fırsatı — zorlu konuşmalar seni güçlendirir.');
    motivations.push('Takım içi en iyi uygulamaları gözlemle ve kendi stiline adapte et.');
    if (chatCount > 100) motivations.push('Yüksek hacimde çalışmak ciddi bir deneyim birikimi sağlıyor — bu değerli.');
  } else {
    whyHere = `${item.name}, son 30 günde takımın en yüksek performans puanlarından birine ulaştı (${score} puan${trendDiff !== 0 ? `, geçen aya göre ${trendDiff > 0 ? '+' : ''}${trendDiff}` : ''}). ${rank <= 2 ? 'Liderlik tablosunun zirvesinde yer almak büyük bir başarı.' : 'Top 5\'te yer almak güçlü ve tutarlı bir performansın göstergesi.'}`;

    if (score >= 90) {
      motivationMessage = `Olağanüstü bir performans! ${score} puanla takımın zirvesinde parlıyorsun. Bu seviyeyi korumak, ulaşmak kadar değerli — tebrikler!`;
    } else if (score >= 70) {
      motivationMessage = `Güçlü ve tutarlı bir performans sergiliyorsun. Takımın gurur kaynağısın. Şimdi hedef: ${score >= 80 ? '90+' : '80+'} puana ulaşmak!`;
    } else {
      motivationMessage = `Top 5'e girdin — bu takdir edilesi bir başarı. Momentum'unu kaybetme ve bir sonraki seviyeye tırman!`;
    }

    if (trendDiff > 0) {
      suggestions.push(`Geçen aya kıyasla +${trendDiff} puan artış — bu yükseliş trendini koru.`);
    } else if (trendDiff < 0) {
      suggestions.push(`Yüksek puanda olsun da geçen aya göre ${Math.abs(trendDiff)} puanlık düşüş var. Nedenini anlamak bu seviyeyi korumanı sağlar.`);
    }

    if (avgSatisfaction >= 4.5) {
      suggestions.push(`${avgSatisfaction}/5 müşteri memnuniyetiyle harika bir müşteri deneyimi sunuyorsun — bu standartı koru.`);
    } else if (avgSatisfaction > 0 && avgSatisfaction < 4.0) {
      suggestions.push(`Performans puanın yüksek ama müşteri memnuniyeti ${avgSatisfaction}/5. Bu iki puanı birlikte yükseltmek seni gerçek bir lider yapar.`);
    }

    if (avgResponseTime > 0 && avgResponseTime <= 60) {
      suggestions.push(`${formatSeconds(avgResponseTime)} ortalama yanıt süresiyle hız konusunda öne çıkıyorsun.`);
    }

    if (chatCount > 150) {
      suggestions.push(`${chatCount} chati bu kaliteyle yönetmek etkileyici — yüksek hacim altında kaliteyi koruma becerisine sahipsin.`);
    }

    if (chatCount >= 30) {
      suggestions.push('Deneyimini takım arkadaşlarınla paylaş — en iyi uygulamalarını mentor olarak aktarabilirsin.');
    } else {
      suggestions.push(`Henüz ${chatCount} görüşme var — skor netleşmekte. ${30 - chatCount} görüşme daha tamamlanınca mentör olma değerlendirilebilir.`);
    }

    motivations.push('Liderlik tablosunda kalmak, sürekli gelişime bağlıdır — hiçbir zaman rahat etme.');
    if (rank === 0) motivations.push('Takımın en iyisisin — başkalarına ilham oluyorsun.');
  }

  return { whyHere, motivationMessage, suggestions, motivations };
}

export default function Leaderboard({ data, title, type = 'top', teamTopScore = 0 }: LeaderboardProps) {
  const [selectedItem, setSelectedItem] = useState<{ item: LeaderboardItem; rank: number } | null>(null);

  if (data.length === 0) {
    return (
      <div className="w-full">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
        <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-700/40 rounded-lg border-2 border-dashed border-cyan-400/50">
          <div className="w-16 h-16 bg-slate-600/60 rounded-full flex items-center justify-center mb-4">
            {type === 'top' ? <Award className="w-8 h-8 text-cyan-300" /> : <TrendingDown className="w-8 h-8 text-rose-300" />}
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Henüz Performans Verisi Yok</h3>
          <p className="text-sm text-slate-700 dark:text-slate-200 text-center max-w-md">
            {type === 'top'
              ? 'Personel performans skorları hesaplandığında en iyi performanslar burada görünecek.'
              : 'Personel performans skorları hesaplandığında gelişim gereken personel burada görünecek.'}
          </p>
        </div>
      </div>
    );
  }

  const getMedalIcon = (index: number) => {
    if (type === 'bottom') return null;
    if (index === 0) return <Award className="w-5 h-5 text-amber-400" />;
    if (index === 1) return <Medal className="w-5 h-5 text-slate-600 dark:text-slate-300" />;
    if (index === 2) return <Medal className="w-5 h-5 text-orange-400" />;
    return null;
  };

  const getRankColor = (index: number) => {
    if (type === 'bottom') {
      if (index === 0) return 'bg-gradient-to-r from-rose-500/30 to-red-500/30 border-rose-400/50 shadow-lg shadow-rose-500/30';
      return 'bg-gradient-to-r from-orange-500/25 to-amber-500/25 border-orange-400/50 shadow-lg shadow-orange-500/20';
    }
    if (index === 0) return 'bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border-amber-400/60 shadow-lg shadow-amber-500/40';
    if (index === 1) return 'bg-gradient-to-r from-slate-600/40 to-slate-500/40 border-slate-400/50 shadow-lg shadow-slate-500/30';
    if (index === 2) return 'bg-gradient-to-r from-orange-500/30 to-amber-600/30 border-orange-400/50 shadow-lg shadow-orange-500/30';
    return 'bg-gradient-to-r from-cyan-500/25 to-blue-500/25 border-cyan-400/50 shadow-lg shadow-cyan-500/20';
  };

  const getAvatarColor = (index: number, t: 'top' | 'bottom') => {
    if (t === 'bottom') {
      if (index === 0) return 'bg-rose-500/40 border-rose-400/60 text-rose-200';
      return 'bg-orange-500/40 border-orange-400/60 text-orange-200';
    }
    if (index === 0) return 'bg-amber-500/40 border-amber-400/60 text-amber-200';
    if (index === 1) return 'bg-slate-500/40 border-slate-400/60 text-slate-700 dark:text-slate-200';
    if (index === 2) return 'bg-orange-500/40 border-orange-400/60 text-orange-200';
    return 'bg-cyan-500/40 border-cyan-400/60 text-cyan-200';
  };

  const TrendBadge = ({ diff, isNew }: { diff?: number; isNew?: boolean }) => {
    if (isNew) return (
      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">Yeni</span>
    );
    if (diff === undefined || diff === 0) return <Minus className="w-3 h-3 text-slate-500" />;
    if (diff > 0) return (
      <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-400">
        <TrendingUp className="w-3 h-3" />+{diff}
      </span>
    );
    return (
      <span className="flex items-center gap-0.5 text-xs font-semibold text-rose-400">
        <TrendingDown className="w-3 h-3" />{diff}
      </span>
    );
  };

  const insights = selectedItem
    ? generateInsights(selectedItem.item, type, selectedItem.rank, teamTopScore)
    : null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <ChevronRight className="w-3 h-3" />
          Detay için tıkla
        </span>
      </div>

      <div className="space-y-2">
        {data.map((item, index) => (
          <button
            key={index}
            onClick={() => setSelectedItem({ item, rank: index })}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all hover:shadow-2xl hover:scale-[1.02] backdrop-blur-sm cursor-pointer text-left text-slate-900 dark:text-white ${getRankColor(index)}`}
          >
            <div className="flex items-center justify-center w-8 h-8 font-bold text-lg flex-shrink-0">
              {getMedalIcon(index) || `#${index + 1}`}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{item.name}</span>
                {type === 'bottom' && item.weakestCategory && (() => {
                  const s = item.weakestCategory.score;
                  if (s < 70) {
                    return (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/30 flex-shrink-0">
                        Zayıf: {item.weakestCategory.name} {s}
                      </span>
                    );
                  } else if (s <= 85) {
                    return (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
                        Geliştirilebilir: {item.weakestCategory.name} {s}
                      </span>
                    );
                  } else {
                    return (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-500 dark:text-slate-400 border border-slate-500/30 flex-shrink-0">
                        En düşük alan: {item.weakestCategory.name} {s}
                      </span>
                    );
                  }
                })()}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {item.chatCount !== undefined && (
                  <span className="text-xs opacity-70 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />{item.chatCount}
                  </span>
                )}
                {item.avgSatisfaction !== undefined && item.avgSatisfaction > 0 && (
                  <span className="text-xs opacity-70 flex items-center gap-1">
                    <Star className="w-3 h-3" />{item.avgSatisfaction}
                  </span>
                )}
                {item.avgResponseTime !== undefined && item.avgResponseTime > 0 && (
                  <span className="text-xs opacity-60 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatSeconds(item.avgResponseTime)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="font-bold text-lg">{item.score}</span>
              <TrendBadge diff={item.trendDiff} isNew={item.isNewAgent} />
            </div>
          </button>
        ))}
      </div>

      {selectedItem && insights && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className={`px-6 py-5 flex items-center justify-between border-b ${type === 'top' ? 'border-amber-500/20' : 'border-rose-500/20'}`}
              style={{ background: type === 'top' ? 'linear-gradient(135deg,rgba(245,158,11,0.12),rgba(234,179,8,0.08))' : 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(249,115,22,0.08))' }}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border-2 ${getAvatarColor(selectedItem.rank, type)}`}>
                  {(selectedItem.item.name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedItem.item.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${type === 'top' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'}`}>
                      {type === 'top' ? `#${selectedItem.rank + 1} En İyi` : `#${selectedItem.rank + 1} Gelişim`}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Son 30 gün</span>
                    {selectedItem.item.isNewAgent ? (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">Yeni Personel</span>
                    ) : selectedItem.item.trendDiff !== undefined && selectedItem.item.trendDiff !== 0 && selectedItem.item.prevScore !== undefined && selectedItem.item.prevScore > 0 && (
                      <span className={`text-xs font-semibold flex items-center gap-1 ${selectedItem.item.trendDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {selectedItem.item.trendDiff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {selectedItem.item.prevScore} → {selectedItem.item.score}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 grid grid-cols-4 gap-2 border-b border-slate-200 dark:border-white/5">
              {[
                { label: 'Puan', value: selectedItem.item.score, icon: <Target className="w-3 h-3" /> },
                { label: 'Chat', value: selectedItem.item.chatCount ?? '—', icon: <MessageSquare className="w-3 h-3" /> },
                { label: 'Memnuniyet', value: selectedItem.item.avgSatisfaction ? `${selectedItem.item.avgSatisfaction}` : '—', icon: <Star className="w-3 h-3" /> },
                { label: 'Yanıt', value: selectedItem.item.avgResponseTime ? formatSeconds(selectedItem.item.avgResponseTime) : '—', icon: <Clock className="w-3 h-3" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="text-center p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-center gap-1">{icon}{label}</div>
                </div>
              ))}
            </div>

            {(selectedItem.item.langScore || selectedItem.item.qualityScore || selectedItem.item.perfScore) ? (
              <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 space-y-2.5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Kategori Kırılımı</div>
                <ScoreBar label="Dil ve Üslup" score={selectedItem.item.langScore ?? 0} color="linear-gradient(90deg,#06b6d4,#0ea5e9)" />
                <ScoreBar label="Kalite" score={selectedItem.item.qualityScore ?? 0} color="linear-gradient(90deg,#10b981,#34d399)" />
                <ScoreBar label="Performans" score={selectedItem.item.perfScore ?? 0} color="linear-gradient(90deg,#f59e0b,#fbbf24)" />
                {selectedItem.item.criticalCount !== undefined && selectedItem.item.criticalCount > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {selectedItem.item.criticalCount} kritik chat (puan &lt; 60) — toplam {selectedItem.item.chatCount ? Math.round((selectedItem.item.criticalCount / selectedItem.item.chatCount) * 100) : 0}%
                  </div>
                )}
              </div>
            ) : null}

            <div className="px-6 py-4 space-y-4 max-h-[40vh] overflow-y-auto">
              <div className="rounded-xl p-4" style={{ background: type === 'bottom' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${type === 'bottom' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
                <div className="flex items-center gap-2 mb-2">
                  {type === 'bottom' ? <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" /> : <Award className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Neden bu listede?</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{insights.whyHere}</p>
              </div>

              <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Motivasyon</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{insights.motivationMessage}</p>
              </div>

              {insights.suggestions.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <ThumbsUp className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      {type === 'bottom' ? 'Gelişim Önerileri' : 'Güçlü Yönler & Öneriler'}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {insights.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: type === 'bottom' ? '#60a5fa' : '#34d399' }} />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.motivations.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.15)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-teal-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Hatırlatmalar</span>
                  </div>
                  <ul className="space-y-2">
                    {insights.motivations.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
