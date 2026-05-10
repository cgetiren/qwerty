import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useBrand } from '../lib/brand';
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  RefreshCw, Send, Clock, TrendingDown, TrendingUp, Minus, Copy, Check,
  BookOpen, Target, Repeat, Star, FileText, Hash,
  ArrowRight, ListChecks, BarChart2, Lightbulb, FileBarChart
} from 'lucide-react';
import CoachingReport from '../components/CoachingReport';

type DateRange = '1' | '7' | '30';

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
  teamAvgChats: number;
}

interface SentFeedback {
  agent_name: string;
  sent_at: string;
  coaching_suggestion: string;
}

const URGENCY_LABELS: Record<string, string> = {
  high: 'Acil',
  medium: 'Orta',
  low: 'İyi',
  excellent: 'Mükemmel',
  insufficient_activity: 'Değerlendirme Aşamasında',
};

const URGENCY_COLORS: Record<string, string> = {
  high: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  excellent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  insufficient_activity: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
};

function getScoreCategory(score: number): keyof ScoreBreakdown {
  if (score < 30) return 'kritik';
  if (score < 40) return 'dikkat';
  if (score < 60) return 'olumsuz';
  if (score < 70) return 'orta';
  if (score < 90) return 'iyi';
  return 'mukemmel';
}

const SCORE_CATEGORY_LABELS: Record<keyof ScoreBreakdown, string> = {
  kritik: 'Kritik',
  dikkat: 'Dikkat',
  olumsuz: 'Olumsuz',
  orta: 'Orta',
  iyi: 'İyi',
  mukemmel: 'Mükemmel',
};

const SCORE_CATEGORY_COLORS: Record<keyof ScoreBreakdown, string> = {
  kritik: 'text-rose-400',
  dikkat: 'text-orange-400',
  olumsuz: 'text-amber-400',
  orta: 'text-blue-400',
  iyi: 'text-cyan-400',
  mukemmel: 'text-emerald-400',
};

const SCORE_COLOR = (score: number) => {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-cyan-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-amber-400';
  if (score >= 30) return 'text-orange-400';
  return 'text-rose-400';
};

const SCORE_BG = (score: number) => {
  if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  if (score >= 70) return 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400';
  if (score >= 60) return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
  if (score >= 40) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  if (score >= 30) return 'bg-orange-500/10 border-orange-500/20 text-orange-400';
  return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortChatId(id: string) {
  return id.length > 12 ? id.slice(0, 8) + '...' : id;
}

function normalizeText(text: string): string {
  return text
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c');
}

const CATEGORY_LABELS: Record<string, string> = {
  'cat:dogrudan_cevap': 'Müşteri sorusuna doğrudan cevap verme',
  'cat:empati': 'Müşteriye empati kurma',
  'cat:yanit_suresi': 'Yanıt süresi / gecikme',
  'cat:hatali_bilgi': 'Hatalı veya eksik bilgi verme',
  'cat:kapatma': 'Chat kapatma ve çözüm doğrulama',
  'cat:kisisellestirilme': 'Kişiselleştirilmiş yanıt oluşturma',
  'cat:yanit_uzunlugu': 'Yanıt uzunluğu ve özlük',
  'cat:profesyonel_dil': 'Profesyonel dil kullanımı',
};

function categorizeIssue(text: string): string {
  const n = normalizeText(text.toLowerCase());
  if (
    (n.includes('dogru') || n.includes('direkt') || n.includes('dogrudan')) &&
    (n.includes('cevap') || n.includes('yanit') || n.includes('soru') || n.includes('istek'))
  ) return 'cat:dogrudan_cevap';
  if (n.includes('empa') || n.includes('anlayis') || n.includes('ilgisiz') || n.includes('soguk') || n.includes('duyarli')) return 'cat:empati';
  if (n.includes('gecikme') || n.includes('yavas') || n.includes('yanit sure') || n.includes('bekleme') || n.includes('hizli')) return 'cat:yanit_suresi';
  if (
    (n.includes('yanlis') || n.includes('hatali') || n.includes('eksik')) &&
    (n.includes('bilgi') || n.includes('bilgi') || n.includes('yanit'))
  ) return 'cat:hatali_bilgi';
  if (n.includes('kapatma') || n.includes('sonlandirma') || (n.includes('cozum') && n.includes('dogrula'))) return 'cat:kapatma';
  if (n.includes('sablon') || n.includes('kopya') || n.includes('kisisel') || n.includes('standart metin')) return 'cat:kisisellestirilme';
  if (n.includes('uzun') || n.includes('gereksiz') || n.includes('kisalt') || n.includes('ozluk') || n.includes('savurgan')) return 'cat:yanit_uzunlugu';
  if (n.includes('kibarca') || n.includes('profesyonel') || n.includes('resmi') || n.includes('nazik') || (n.includes('dil') && n.includes('kullan'))) return 'cat:profesyonel_dil';
  return n.slice(0, 50).trim();
}

function deriveCorrectApproach(issueText: string): string {
  const lower = normalizeText(issueText.toLowerCase());
  if (lower.includes('dogrudan') || lower.includes('direkt cevap')) {
    return 'Musterinin sorusunu ilk cumlede dogrudan yanıtla. "Evet, X urunune X tarihine kadar garanti gecerlidir" gibi. Arka plan aciklamasini cevaptan sonra ver, once degil.';
  }
  if (lower.includes('gecikme') || lower.includes('yavas') || lower.includes('yanit sure') || lower.includes('suresi')) {
    return 'Musteri mesajlarina en gec 60 saniye icinde ilk yaniti ver. Uzun islemler icin "Simdi kontrol ediyorum, bir dakika" gibi ara yanit gonder.';
  }
  if (lower.includes('empa') || lower.includes('ilgisiz') || lower.includes('sogukkanli')) {
    return 'Musterinin durumunu oncelikle kabul et. "Anliyorum, bu durum gercekten sinir bozucu olabilir" gibi ifadeler kullan. Cozum sunmadan once duyuldigini hissettir.';
  }
  if (lower.includes('bilgi') || lower.includes('yanlis') || lower.includes('hatali') || lower.includes('eksik')) {
    return 'Emin olmadigin konularda kesin yanit verme. "Hemen kontrol edeyim" de ve dogrulayarak geri don. Yanlis bilgi vermek musterinin guvensizligine yol acar.';
  }
  if (lower.includes('kapatma') || lower.includes('sonlandirma') || lower.includes('cozum dogrula')) {
    return 'Chati kapatmadan once musteriye "Baska bir konuda yardimci olabilecegim bir sey var mi?" diye sor. Cozumun tam oldugunu dogrula.';
  }
  if (lower.includes('kisisel') || lower.includes('kopya') || lower.includes('sablon') || lower.includes('standart')) {
    return 'Hazir metin kullanirken musterinin adini ve ozel durumunu mutlaka ekle. "Sayin [Musteri Adi], sizin durumunuzda..." gibi kisisellestirilmis bir yaklasim benimse.';
  }
  if (lower.includes('uzun') || lower.includes('gereksiz') || lower.includes('savurgan') || lower.includes('ozluk')) {
    return 'Yanitleri kisa ve oz tut. Musterinin sorusunu dogrudan cevapla, gereksiz aciklama ve tekrarlardan kacin.';
  }
  if (lower.includes('kibarca') || lower.includes('profesyonel') || lower.includes('dil')) {
    return 'Her zaman resmi ve nazik bir dil kullan. "Tabiki", "Elbet" gibi samimi ifadeler yaninda "Sayin Musterimiz" gibi resmi hitaplari dengeli kullan.';
  }
  return 'Bu konuda standart prosedure uymaya ozen goster. Benzer durumlarda nasil davranman gerektigini amirinden teyit al ve gelecek chatlere not olarak ekle.';
}

function buildActionItems(issues: EvidencedIssue[], avgScore: number): string[] {
  const items: string[] = [];

  if (avgScore >= 90) {
    items.push('Bu dönemdeki başarılı pratikleri kısa bir notla belgeleyerek paylaş');
    items.push('Ekip içinde bir yeni başlayan personele mentörlük yapmayı değerlendir');
    if (issues.length > 0) {
      items.push(`${issues[0].text.slice(0, 55)}${issues[0].text.length > 55 ? '...' : ''} konusundaki küçük notu göz önünde bulundur`);
    }
    items.push('Mevcut yüksek kalite standartlarını gelecek dönemde de koru');
    return items;
  }

  const criticals = issues.filter(i => i.type === 'critical').slice(0, 2);
  const improvements = issues.filter(i => i.type === 'improvement').slice(0, 2);

  criticals.forEach(issue => {
    const n = normalizeText(issue.text.toLowerCase());
    if (n.includes('dogrudan') || n.includes('direkt cevap')) {
      items.push('Yanita oncelikle net bir cevap ile basla, aciklamayi ardindan ver — musterinin sorusunu atlatma');
    } else if (n.includes('gecikme') || n.includes('yavas') || n.includes('yanit sure') || n.includes('suresi')) {
      items.push('Yanit surelerini gunluk takip et — hedef: 60 saniye icinde ilk yanit');
    } else if (n.includes('empa') || n.includes('ilgisiz') || n.includes('soguk')) {
      items.push('Her chatin basindan musterinin durumunu kabul eden bir cumle yaz; empati kurmadan cozume gecme');
    } else if (n.includes('bilgi') || n.includes('yanlis') || n.includes('hatali') || n.includes('eksik')) {
      items.push('Emin olunmayan sorularda once dogrula, sonra yanit ver — tahminle devam etme');
    } else if (n.includes('kapatma') || n.includes('sonlandirma') || n.includes('cozum dogrula')) {
      items.push('Chati kapatmadan once "Baska bir konuda yardimci olabilir miyim?" kontrolunu rutin hale getir');
    } else if (n.includes('kisisel') || n.includes('kopya') || n.includes('sablon') || n.includes('standart')) {
      items.push('Hazir metinlere musteri adi ve ozel durum ekleyerek kisisellestirilmis yanitlar olustur');
    } else {
      items.push(`"${issue.text.slice(0, 55)}${issue.text.length > 55 ? '...' : ''}" hatasini tekrarlamamak icin somut onlem belirle, 3 gun sonra kontrol et`);
    }
  });

  improvements.forEach(issue => {
    const n = normalizeText(issue.text.toLowerCase());
    if (n.includes('dogrudan') || n.includes('direkt cevap')) {
      items.push('Cevaplarinda sorunun ozunu ilk cumlede ver; aciklamayi ancak ardindan ekle');
    } else if (n.includes('uzun') || n.includes('gereksiz') || n.includes('savurgan') || n.includes('ozluk')) {
      items.push('Yanit uzunlugunu izle — musterinin sorusunu 2-3 cumlede dogrudan cevapla');
    } else if (n.includes('profesyonel') || n.includes('dil') || n.includes('kibarca')) {
      items.push('Resmi ve samimi dili dengeli kullan; "Sayin Musterimiz" gibi hitaplarla "Elbet" gibi yakin ifadeleri karistic');
    } else if (n.includes('kisisel') || n.includes('kopya') || n.includes('sablon')) {
      items.push('Hazir metin kullanirken mutlaka musteri adini ve ozel durumunu ekle');
    } else {
      items.push(`${issue.text.slice(0, 55)}${issue.text.length > 55 ? '...' : ''} konusunda ornek chatler incele ve 2 gunluk odakli pratik yap`);
    }
  });

  if (avgScore < 75) {
    items.push('Gunde en az 3 onceki basarili chati inceleyerek iyi pratikleri not al');
  }
  items.push('3 gun icerisinde ilerlemeyi degerlendirmek uzere kisa bir takip gorusmesi yap');

  return items;
}

function buildDetailedScript(
  agentName: string,
  issues: EvidencedIssue[],
  avgScore: number,
  totalChats: number,
  dateRange: string,
  _lowestChats: ChatEvidence[],
  actionItems: string[],
  isRepeat: boolean = false
): string {
  const firstName = agentName.split(' ')[0];
  const today = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' });
  const criticals = issues.filter(i => i.type === 'critical');
  const improvements = issues.filter(i => i.type === 'improvement');

  const sep = '─'.repeat(62);
  const thin = '·'.repeat(62);

  if (avgScore >= 90 && !isRepeat) {
    const hasAnyIssues = criticals.length > 0 || improvements.length > 0;

    let s = `YÖNETİCİ–PERSONEL GÖRÜŞMESİ — TAKDİR & MENTORLUK\n`;
    s += `Tarih: ${today}  |  Personel: ${agentName}  |  Süre: ~10 dk\n`;
    s += `${sep}\n`;
    s += `NOT: Bu görüşme tamamen takdir odaklıdır. Hesap soran veya düzeltici\n`;
    s += `     ton kullanılmaz. Y: Yönetici  |  P: Personel\n\n`;

    s += `${sep}\n`;
    s += `TAKDİR VE PERFORMANS PAYLAŞIMI\n`;
    s += `${sep}\n\n`;

    s += `Y: "${firstName}, seninle bu döneme ait verileri paylaşmak istedim.\n`;
    s += `   ${totalChats} chat inceledim — ortalaman ${avgScore}/100. Bu son derece güçlü bir sonuç.\n`;
    s += `   Bu tutarlılığı nasıl sağladığını merak ediyorum, bana anlat."\n\n`;
    s += `P: [Yaklaşımını ve alışkanlıklarını paylaşır]\n\n`;
    s += `Y: "Bunu duymak çok değerli. Takımımız için gerçek bir referans noktasısın.\n`;
    s += `   Bu başarını fark etmemi istedim, tebrik ederim."\n\n`;

    if (hasAnyIssues) {
      s += `${sep}\n`;
      s += `İSTEĞE BAĞLI — PAYLAŞMAK İSTERSEN\n`;
      s += `${sep}\n\n`;
      s += `Y: "İstersen, bazı chatlerde AI'ın küçük notlar düştüğünü de görebiliriz —\n`;
      s += `   bunları eleştiri olarak değil, zaten iyi olan bir performansı ince ayar\n`;
      s += `   yapma fırsatı olarak düşün. Bakmak ister misin?"\n\n`;
      s += `P: [İsterse devam et, istemezse geç]\n\n`;
      const allIssues = [...criticals, ...improvements];
      allIssues.slice(0, 1).forEach(issue => {
        s += `Y: "${issue.text} konusunda birkaç chatte küçük bir not var.\n`;
        s += `   ${issue.correctApproach}\n`;
        s += `   Senin için zaten küçük bir ince ayar meselesi."\n\n`;
        s += `P: [Değerlendirir]\n\n`;
      });
    }

    s += `${sep}\n`;
    s += `MENTORLUK FIRSATI\n`;
    s += `${sep}\n\n`;

    s += `Y: "Senden bir şey talep etmek istiyorum: takımda yeni arkadaşlarımıza\n`;
    s += `   chat kalitesi konusunda örnek olmanı. Bunu nasıl yapabileceğini\n`;
    s += `   birlikte düşünelim."\n\n`;
    s += `P: [Fikirlerini paylaşır]\n\n`;
    s += `Y: "Sana güveniyorum. Bu performansını sürdür, ihtiyaç duyduğunda gel."\n\n`;

    s += `${sep}\n`;
    s += `Yönetici:   _______________________   Tarih: ${today}\n`;
    s += `Personel:   _______________________   Tarih: ${today}\n`;

    return s;
  }

  if (isRepeat) {
    let s = `YÖNETİCİ–PERSONEL GÖRÜŞME SENARYOSU — TAKİP GÖRÜŞMESİ\n`;
    s += `Tarih: ${today}  |  Personel: ${agentName}  |  Süre: ~20-25 dk\n`;
    s += `${sep}\n`;
    s += `NOT: Bu senaryo daha önceki görüşme sonrası aynı sorunların devam\n`;
    s += `     etmesi nedeniyle hazırlanmıştır. Ton daha doğrudan ve hesap soran\n`;
    s += `     bir yaklaşım içerir.\n`;
    s += `     Y: Yönetici  |  P: Personel beklenen yanıt  |  [...] = devam et\n\n`;

    s += `${sep}\n`;
    s += `BÖLÜM 0 — ÖNCEKI GÖRÜŞME TAKİBİ\n`;
    s += `${sep}\n\n`;

    s += `Y: "${firstName}, daha önce seninle performans konusunda bir görüşme yapmıştık.\n`;
    s += `   O görüşmede üzerinde durulan konuların son ${dateRange} günlük verilerinde\n`;
    s += `   hâlâ tekrar ettiğini görüyorum. Bugün bu nedenle buradayız.\n`;
    s += `   ${totalChats} chati inceledim, ortalaman ${avgScore}/100.\n`;
    if (criticals.length > 0) {
      s += `   Özellikle ${criticals.length} kritik konuda somut hatalar var. Bunları seninle\n`;
      s += `   tek tek açık bir şekilde konuşmam gerekiyor."\n\n`;
    } else {
      s += `   Bunları seninle doğrudan konuşmam gerekiyor."\n\n`;
    }

    s += `P: [Dinliyor]\n\n`;
    s += `Y: "Önce sana sormak istiyorum: önceki görüşmemizden bu yana\n`;
    s += `   hangi değişiklikleri uyguladın? Somut olarak anlat."\n\n`;
    s += `P: [Cevaplar — ne yapıp yapmadığını söyler]\n\n`;
    s += `Y: "Anlıyorum. Ancak veriler farklı bir tablo gösteriyor. Sana bu tabloyu göstereceğim."\n\n`;

    if (criticals.length > 0) {
      s += `${sep}\n`;
      s += `BÖLÜM 1 — TEKRAR EDEN KRİTİK HATALAR (${criticals.length} başlık)\n`;
      s += `${sep}\n\n`;

      criticals.forEach((issue, idx) => {
        s += `${thin}\n`;
        s += `TEKRARLAYAN HATA ${idx + 1}: ${issue.text.toUpperCase()}\n`;
        s += `${thin}\n\n`;

        s += `Y: "${firstName}, ${issue.text.toLowerCase()} konusunu daha önce konuşmuştuk.\n`;
        s += `   Bu son dönemde ${issue.count} chatta hâlâ aynı sorunu görüyorum.\n`;
        s += `   Bu benim için ciddi bir endişe kaynağı çünkü anlaştığımız değişiklik gerçekleşmemiş.\n\n`;

        if (issue.evidences.length > 0) {
          const ev = issue.evidences[0];
          s += `Y: "Örnek vereyim: ${formatDate(ev.date)} tarihli Chat #${shortChatId(ev.chatId)},\n`;
          s += `   müşteri ${ev.customerName}, skor ${ev.score}/100.\n`;
          if (ev.aiSummary) {
            const summary = ev.aiSummary.length > 200 ? ev.aiSummary.slice(0, 200) + '...' : ev.aiSummary;
            s += `   Sistem analizi: '${summary}'\n`;
          }
          s += `   Bu chat'te ne yapman gerekiyordu ama yapmadın?"\n\n`;
          s += `P: [Açıklar / kabul eder]\n\n`;
        }

        s += `Y: "Bunu neden bir türlü uygulamakta güçlük çekiyorsun? Engel olan bir şey var mı?"\n\n`;
        s += `P: [Engelleri paylaşır]\n\n`;
        s += `Y: "${issue.correctApproach}\n`;
        s += `   Bunu bir daha görmek istemiyorum. Anlaştık mı?"\n\n`;
        s += `P: [Kesin söz verir]\n\n`;
      });
    }

    if (improvements.length > 0) {
      s += `${sep}\n`;
      s += `BÖLÜM 2 — DEVAM EDEN GELİŞTİRME ALANLARI (${improvements.length} başlık)\n`;
      s += `${sep}\n\n`;

      improvements.forEach((issue, idx) => {
        s += `${thin}\n`;
        s += `DEVAM EDEN ALAN ${idx + 1}: ${issue.text}\n`;
        s += `${thin}\n\n`;

        s += `Y: "${issue.text.toLowerCase()} konusu da henüz çözülmemiş durumda, ${issue.count} chatta görüyorum.\n`;
        if (issue.evidences.length > 0) {
          const ev = issue.evidences[0];
          s += `   ${formatDate(ev.date)} tarihli Chat #${shortChatId(ev.chatId)}, skor ${ev.score}/100.\n`;
          if (ev.aiSummary) s += `   '${ev.aiSummary.slice(0, 150)}'\n`;
        }
        s += `   Bu konuda ilerleme sağlamak için ne yapacaksın?"\n\n`;
        s += `P: [Somut adım söyler]\n\n`;
        s += `Y: "${issue.correctApproach}"\n\n`;
      });
    }

    s += `${sep}\n`;
    s += `BÖLÜM 3 — YAZILI TAAHHÜT VE TAKİP PLANI\n`;
    s += `${sep}\n\n`;

    s += `Y: "Bugün konuştuklarımızı yazıya dökelim. Bu sefer sözlü değil, yazılı taahhüt istiyorum.\n`;
    issues.slice(0, 3).forEach((issue, idx) => {
      s += `   ${idx + 1}. ${issue.text} konusunda somut değişiklik\n`;
    });
    s += `\n   Önümüzdeki ${dateRange} gün içinde bu alanlarda ölçülebilir iyileşme bekliyorum.\"\n\n`;

    actionItems.forEach((item, idx) => {
      s += `   ${idx + 1}. [ ] ${item}\n`;
    });

    s += `\nY: "Bir sonraki görüşmemiz 3 gün sonra. O görüşmede bu maddelerin her birini\n`;
    s += `   veriyle takip edeceğim. Aynı sorunları tekrar görürsem bu bir disiplin meselesi\n`;
    s += `   haline gelecek. Bunu açıkça söylemem gerekiyordu."\n\n`;
    s += `P: [Anladığını onaylar]\n\n`;
    s += `Y: "Seni desteklemek istiyorum. Ama bunun için önce sen değişmeye istekli olmalısın.\n`;
    s += `   Yardıma ihtiyacın olursa bana gel, kapım açık."\n\n`;
    s += `${sep}\n`;
    s += `YAZILI TAAHHÜT\n`;
    s += `${sep}\n\n`;
    s += `Personel olarak aşağıdaki değişiklikleri gerçekleştireceğimi taahhüt ederim:\n\n`;
    issues.slice(0, 3).forEach((issue, idx) => {
      s += `  ${idx + 1}. ${issue.text} konusunda _______________________________\n`;
    });
    s += `\nYönetici:   _______________________   Tarih: ${today}\n`;
    s += `Personel:   _______________________   Tarih: ${today}\n`;

    return s;
  }

  let s = `YÖNETİCİ–PERSONEL GÖRÜŞME SENARYOSU\n`;
  s += `Tarih: ${today}  |  Personel: ${agentName}  |  Süre: ~15-20 dk\n`;
  s += `${sep}\n`;
  s += `NOT: Yönetici konuşmaları "Y:", personel beklenen yanıtlar "P:" ile işaretlenmiştir.\n`;
  s += `     [...] = beklenen cevaba göre devam et\n\n`;

  s += `${sep}\n`;
  s += `BÖLÜM 0 — GİRİŞ\n`;
  s += `${sep}\n\n`;

  s += `Y: "${firstName}, bugün seninle ${dateRange} günlük performans değerlendirmesi yapmak istiyorum.\n`;
  s += `   Seninle birlikte geçtiğimiz dönemde yaptığın ${totalChats} chati inceledim.\n`;
  if (avgScore >= 90) {
    s += `   Genel ortalaman ${avgScore}/100 — bu mükemmel bir sonuç, tebrik ederim!\n`;
    s += `   Bu başarını nasıl sürdürdüğünü ve diğer arkadaşlarına nasıl örnek olabileceğini konuşalım."\n\n`;
  } else if (avgScore >= 70) {
    s += `   Genel ortalaman ${avgScore}/100 — bu iyi bir sonuç. Bazı ince noktaları birlikte konuşalım."\n\n`;
  } else if (avgScore >= 60) {
    s += `   Genel ortalaman ${avgScore}/100 çıktı. Bazı konularda potansiyelinin altında kalıyorsun,\n`;
    s += `   bunları somut örneklerle göstereceğim."\n\n`;
  } else {
    s += `   Genel ortalaman ${avgScore}/100 — bu hedefin belirgin şekilde altında.\n`;
    s += `   Seninle somut örnekler üzerinden konuşmak ve birlikte bir yol haritası çizmek istiyorum."\n\n`;
  }

  s += `P: [Dinliyor, kabul eder ya da merakla sorar]\n\n`;
  s += `Y: "Sana sadece genel bir değerlendirme değil, hangi chatleride ne olduğunu göstereceğim.\n`;
  s += `   Verilerden konuşacağız, kişisel bir eleştiri değil bu."\n\n`;

  if (criticals.length > 0) {
    s += `${sep}\n`;
    s += `BÖLÜM 1 — KRİTİK HATALAR (${criticals.length} başlık)\n`;
    s += `${sep}\n\n`;

    criticals.forEach((issue, idx) => {
      s += `${thin}\n`;
      s += `KONU ${idx + 1}: ${issue.text.toUpperCase()}\n`;
      s += `${thin}\n\n`;

      s += `Y: "${firstName}, ${issue.count} farklı chatta tekrar eden bir konu dikkatimi çekti: ${issue.text.toLowerCase()}.\n`;
      s += `   Sana somut bir örnek vermek istiyorum."\n\n`;

      if (issue.evidences.length > 0) {
        const ev = issue.evidences[0];
        s += `Y: "${formatDate(ev.date)} tarihli, müşteri ${ev.customerName} ile yaptığın Chat #${shortChatId(ev.chatId)}'e baktım.\n`;
        s += `   Bu chatın skoru ${ev.score}/100 olarak çıktı.\n`;
        if (ev.aiSummary) {
          const summary = ev.aiSummary.length > 200 ? ev.aiSummary.slice(0, 200) + '...' : ev.aiSummary;
          s += `   Sistem analizi şunu söylüyor: '${summary}'\n`;
        }
        s += `   Bu durumu nasıl değerlendiriyorsun?"\n\n`;
        s += `P: [Açıklama yapar / kabul eder / savunma yapar]\n\n`;

        if (issue.evidences.length > 1) {
          const ev2 = issue.evidences[1];
          s += `Y: "Bu sadece o chata özgü değil. ${formatDate(ev2.date)} tarihli Chat #${shortChatId(ev2.chatId)}'de\n`;
          s += `   de benzer bir durum var, müşteri ${ev2.customerName}, skor ${ev2.score}/100.\n`;
          if (ev2.aiSummary) {
            s += `   Orada da sistem: '${ev2.aiSummary.slice(0, 160)}' demiş.\n`;
          }
          s += `   Bu iki örneğe baktığında, ne fark ediyorsun?"\n\n`;
          s += `P: [Kalıp fark eder veya sormaya devam et]\n\n`;
        }
      }

      s += `Y: "Peki bu durumu bir sonraki chatlerde nasıl ele almalısın?\n`;
      s += `   ${issue.correctApproach}"\n\n`;
      s += `P: [Anlayıp anlamadığını söyler]\n\n`;
      s += `Y: "Bunu bir sonraki görüşmemde kontrol edeceğim. Anlaştık mı?"\n\n`;
    });
  }

  if (improvements.length > 0) {
    s += `${sep}\n`;
    s += `BÖLÜM 2 — GELİŞTİRME ALANLARI (${improvements.length} başlık)\n`;
    s += `${sep}\n\n`;

    improvements.forEach((issue, idx) => {
      s += `${thin}\n`;
      s += `GELİŞTİRME ${idx + 1}: ${issue.text}\n`;
      s += `${thin}\n\n`;

      s += `Y: "Bir de şunu konuşalım: ${issue.text.toLowerCase()} konusunda ${issue.count} chatta\n`;
      s += `   geliştirme alanı olduğunu görüyorum.\n`;

      if (issue.evidences.length > 0) {
        const ev = issue.evidences[0];
        s += `   Örnek olarak ${formatDate(ev.date)} tarihli Chat #${shortChatId(ev.chatId)}'e bakarsak,\n`;
        s += `   müşteri ${ev.customerName}, skor ${ev.score}/100.\n`;
        if (ev.aiSummary) {
          s += `   '${ev.aiSummary.slice(0, 150)}...'\n`;
        }
      }
      s += `   Bu konuda kendini nasıl değerlendiriyorsun?"\n\n`;
      s += `P: [...]\n\n`;
      s += `Y: "${issue.correctApproach}"\n\n`;
    });
  }

  if (issues.length === 0) {
    s += `${sep}\n`;
    s += `GENEL DEĞERLENDİRME\n`;
    s += `${sep}\n\n`;
    s += `Y: "Analiz ettiğim ${totalChats} chatta spesifik bir hata tespit etmedim.\n`;
    s += `   Bu dönemde tutarlı bir performans sergiliyorsun.\n`;
    s += `   Bunu devam ettirmek için hangi alışkanlıklarını sürdürmek istiyorsun?"\n\n`;
    s += `P: [...]\n\n`;
  }

  s += `${sep}\n`;
  s += `BÖLÜM 3 — AKSİYON MUTABAKATI\n`;
  s += `${sep}\n\n`;

  s += `Y: "Bugün konuştuklarımızı özetleyeyim:\n`;
  issues.slice(0, 3).forEach((issue, idx) => {
    s += `   ${idx + 1}. ${issue.text}\n`;
  });
  s += `\n   Bunlar için şu adımları atmayı öneriyorum:"\n\n`;

  actionItems.forEach((item, idx) => {
    s += `   ${idx + 1}. [ ] ${item}\n`;
  });

  s += `\nY: "Bu adımları gerçekleştirmek için ne gibi desteğe ihtiyacın var?"\n\n`;
  s += `P: [...]\n\n`;
  s += `Y: "3 gün içinde kısa bir takip görüşmesi yapalım. Aynı konuların tekrar\n`;
  s += `   etmemesini bekliyorum. Sorun olursa bana her zaman gelebilirsin."\n\n`;
  s += `P: [Onaylar]\n\n`;
  s += `${sep}\n`;
  s += `İMZALAR\n`;
  s += `${sep}\n\n`;
  s += `Yönetici:   _______________________   Tarih: ${today}\n`;
  s += `Personel:   _______________________   Tarih: ${today}\n`;

  return s;
}

function buildActivityReviewScript(
  agentName: string,
  totalChats: number,
  teamAvgChats: number,
  dateRange: string,
  avgScore: number
): string {
  const firstName = agentName.split(' ')[0];
  const today = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' });
  const sep = '─'.repeat(62);

  let s = `YÖNETİCİ–PERSONEL GÖRÜŞMESİ — AKTİVİTE DEĞERLENDİRME\n`;
  s += `Tarih: ${today}  |  Personel: ${agentName}  |  Süre: ~15 dk\n`;
  s += `${sep}\n`;
  s += `NOT: Bu görüşme düşük aktivite odaklıdır. Skor güçlü görünse de\n`;
  s += `     dönem içindeki chat hacmi ekip ortalamasının çok altında.\n`;
  s += `     Y: Yönetici  |  P: Personel beklenen yanıt\n\n`;

  s += `${sep}\n`;
  s += `BÖLÜM 1 — AÇILIŞ\n`;
  s += `${sep}\n\n`;

  s += `Y: "${firstName}, seninle bu dönemdeki performans verisini paylaşmak istiyorum.\n`;
  s += `   Skor performansın güçlü görünüyor — ${avgScore}/100. Bu olumlu bir tablo.\n`;
  s += `   Ama dönem içinde ekip ortalamasının çok altında chat almışsın.\n`;
  s += `   Bunu konuşmamız gerekiyor."\n\n`;

  s += `P: [Dinliyor]\n\n`;

  s += `Y: "Rakamları paylaşayım: Ekip ortalaması bu dönem ~${Math.round(teamAvgChats)} chat,\n`;
  s += `   sen ${totalChats} chat almışsın. Bu fark benim için ciddi bir soru işareti.\n`;
  s += `   Sana doğrudan sormam gerekiyor: Bu durumun sebebi nedir?"\n\n`;

  s += `P: [Açıklar]\n\n`;

  s += `${sep}\n`;
  s += `BÖLÜM 2 — SORGULAMA\n`;
  s += `${sep}\n\n`;

  s += `Y: "Birkaç konu üzerinden gitmek istiyorum:\n\n`;
  s += `   1. Vardiya düzenin nasıl? Bu dönemde izin, erken çıkış veya geç başlama var mıydı?"\n\n`;
  s += `P: [Cevaplar]\n\n`;
  s += `Y: "2. Teknik bir sorun yaşadın mı? Sistem kesintisi, bağlantı problemi veya\n`;
  s += `   araç erişim sorunu gibi bir durum söz konusu oldu mu?"\n\n`;
  s += `P: [Cevaplar]\n\n`;
  s += `Y: "3. Vardiya içinde chat dışı bir görev mi üstlendin? Eğitim, toplantı,\n`;
  s += `   başka bir sorumluluk gibi bir şey var mıydı?"\n\n`;
  s += `P: [Cevaplar]\n\n`;
  s += `Y: "4. Chat hattında iş yükü dağılımında bir dengesizlik fark ettin mi?\n`;
  s += `   Bazı arkadaşlar çok daha fazla chat alırken sen az aldıysan bu önemli."\n\n`;
  s += `P: [Cevaplar]\n\n`;

  s += `${sep}\n`;
  s += `BÖLÜM 3 — HEDEF BELİRLEME\n`;
  s += `${sep}\n\n`;

  s += `Y: "${firstName}, konuştuklarımızı değerlendirdiğimde, açıklaman yeterliyse\n`;
  s += `   bunu kayda geçirelim. Geçerli bir sebep yoksa önümüzdeki dönem için\n`;
  s += `   somut bir hedef koymamız gerekiyor.\n\n`;
  s += `   Ekip ortalaması ~${Math.round(teamAvgChats)} chat. Önümüzdeki ${dateRange} günlük\n`;
  s += `   dönem için hangi chat rakamını hedefliyorsun?"\n\n`;
  s += `P: [Rakam verir]\n\n`;

  s += `Y: "Bu hedefi kayıt altına alıyoruz. Dönem sonunda bu rakama birlikte bakacağız.\n`;
  s += `   Skor performansın iyi — chat hacmini de buna paralel getirirsen güçlü\n`;
  s += `   bir profil çıkacak karşımıza."\n\n`;
  s += `P: [Onaylar]\n\n`;

  s += `${sep}\n`;
  s += `BÖLÜM 4 — TAKİP TARİHİ\n`;
  s += `${sep}\n\n`;

  s += `Y: "Bir sonraki değerlendirmemizi dönem sonunda yapacağız. O zaman hem skor\n`;
  s += `   hem de chat hacmini birlikte ele alacağız. Dönem ortasında kısa bir kontrol\n`;
  s += `   yapabiliriz — nasıl ilerliyor görmek için."\n\n`;
  s += `P: [Anladığını onaylar]\n\n`;
  s += `Y: "Bu görüşme hesap sorma değil, durumu anlamak ve seni doğru yola\n`;
  s += `   yönlendirmek için yapıldı. Sorun olursa her zaman gelebilirsin."\n\n`;

  s += `${sep}\n`;
  s += `NOTLAR VE TAAHHÜT\n`;
  s += `${sep}\n\n`;
  s += `Açıklama (varsa): ___________________________________________________\n\n`;
  s += `Belirlenen hedef: Önümüzdeki dönem için _______ chat\n`;
  s += `Takip tarihi: _______________\n\n`;
  s += `Yönetici:   _______________________   Tarih: ${today}\n`;
  s += `Personel:   _______________________   Tarih: ${today}\n`;

  return s;
}

const MENTOR_MIN_CHATS = 30;

function determineUrgency(avgScore: number, totalChats: number): 'high' | 'medium' | 'low' | 'excellent' {
  if (avgScore >= 90) return totalChats >= MENTOR_MIN_CHATS ? 'excellent' : 'low';
  if (avgScore >= 70) return 'low';
  if (avgScore >= 60) return 'medium';
  return 'high';
}

export default function CoachingCenter() {
  const { session } = useAuth();
  const { activeBrand } = useBrand();
  const [dateRange, setDateRange] = useState<DateRange>('7');
  const [loading, setLoading] = useState(true);
  const [coachingData, setCoachingData] = useState<AgentCoachingData[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState<string | null>(null);
  const [coachingHistory, setCoachingHistory] = useState<Map<string, string>>(new Map());
  const [filterUrgency, setFilterUrgency] = useState<'all' | 'high' | 'medium' | 'low' | 'excellent' | 'insufficient_activity'>('all');
  const [activeTab, setActiveTab] = useState<Record<string, 'issues' | 'script' | 'actions'>>({});
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    loadCoachingData();
    loadSentFeedbacks();
  }, [dateRange, activeBrand?.brand_id]);

  useEffect(() => {
    const channel = supabase
      .channel('coaching-center-analysis-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_analysis' },
        () => {
          loadCoachingData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange, activeBrand?.brand_id]);

  const loadSentFeedbacks = async () => {
    let query = supabase
      .from('coaching_feedbacks')
      .select('agent_name, sent_at, coaching_suggestion')
      .order('sent_at', { ascending: false });
    if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);
    const { data } = await query;
    if (data) {
      const map = new Map<string, string>();
      data.forEach((f: SentFeedback) => {
        if (!map.has(f.agent_name)) map.set(f.agent_name, f.sent_at);
      });
      setCoachingHistory(map);
    }
  };

  const loadCoachingData = async () => {
    setLoading(true);
    try {
      const daysAgo = new Date();
      if (dateRange !== '1') {
        daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
      }
      daysAgo.setHours(0, 0, 0, 0);

      let allChats: any[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        let batchQuery = supabase
          .from('chats')
          .select('id, agent_name, customer_name, created_at')
          .not('agent_name', 'is', null)
          .gte('created_at', daysAgo.toISOString())
          .range(from, from + batchSize - 1);
        if (activeBrand?.brand_id) batchQuery = batchQuery.eq('brand_id', activeBrand.brand_id);
        const { data: batch } = await batchQuery;
        if (!batch || batch.length === 0) break;
        allChats = [...allChats, ...batch];
        if (batch.length < batchSize) break;
        from += batchSize;
      }

      if (allChats.length === 0) {
        setCoachingData([]);
        setLoading(false);
        return;
      }

      const chatIds = allChats.map(c => c.id);
      const chatMap = new Map(allChats.map(c => [c.id, c]));

      let allAnalyses: any[] = [];
      for (let i = 0; i < chatIds.length; i += batchSize) {
        const batchIds = chatIds.slice(i, i + batchSize);
        let analysisQuery = supabase
          .from('chat_analysis')
          .select('chat_id, overall_score, sentiment, requires_attention, issues_detected, recommendations, coaching_suggestion, ai_summary')
          .in('chat_id', batchIds)
          .gt('overall_score', 0);
        if (activeBrand?.brand_id) analysisQuery = analysisQuery.eq('brand_id', activeBrand.brand_id);
        const { data: batch } = await analysisQuery;
        if (batch) allAnalyses = [...allAnalyses, ...batch];
      }

      const agentMap = new Map<string, {
        totalChatsAll: number;
        scores: { score: number; date: string; chatId: string }[];
        sentiments: string[];
        attentionCount: number;
        scoreBreakdown: ScoreBreakdown;
        issueEvidenceMap: Map<string, { type: 'critical' | 'improvement'; evidences: ChatEvidence[]; totalCount: number }>;
        lastDate: string;
      }>();

      // First: count ALL chats per agent (including unanalyzed)
      allChats.forEach(chat => {
        const agentName = chat.agent_name;
        if (!agentMap.has(agentName)) {
          agentMap.set(agentName, {
            totalChatsAll: 0,
            scores: [],
            sentiments: [],
            attentionCount: 0,
            scoreBreakdown: { kritik: 0, dikkat: 0, olumsuz: 0, orta: 0, iyi: 0, mukemmel: 0 },
            issueEvidenceMap: new Map(),
            lastDate: chat.created_at,
          });
        }
        const agent = agentMap.get(agentName)!;
        agent.totalChatsAll++;
        if (chat.created_at > agent.lastDate) agent.lastDate = chat.created_at;
      });

      // Then: add analysis data
      allAnalyses.forEach(analysis => {
        const chat = chatMap.get(analysis.chat_id);
        if (!chat) return;
        const agentName = chat.agent_name;

        const agent = agentMap.get(agentName)!;
        const score = parseFloat(String(analysis.overall_score)) || 0;
        agent.scores.push({ score, date: chat.created_at, chatId: chat.id });
        agent.sentiments.push(analysis.sentiment || '');
        if (analysis.requires_attention) agent.attentionCount++;
        agent.scoreBreakdown[getScoreCategory(score)]++;

        const evidence: ChatEvidence = {
          chatId: chat.id,
          customerName: chat.customer_name || 'Belirtilmemis',
          date: chat.created_at,
          score,
          aiSummary: analysis.ai_summary || '',
          recommendation: analysis.recommendations || analysis.coaching_suggestion || '',
        };

        const issues = analysis.issues_detected || {};
        const criticalErrors: string[] = issues.critical_errors || [];
        const improvementAreas: string[] = issues.improvement_areas || [];

        criticalErrors.forEach(err => {
          const raw = err.trim();
          if (!raw || raw.length < 5) return;
          const key = categorizeIssue(raw);
          if (!agent.issueEvidenceMap.has(key)) {
            agent.issueEvidenceMap.set(key, { type: 'critical', evidences: [], totalCount: 0 });
          }
          const entry = agent.issueEvidenceMap.get(key)!;
          entry.totalCount++;
          if (entry.evidences.length < 5) entry.evidences.push(evidence);
        });

        improvementAreas.forEach(area => {
          if (score >= 90) return; // Only skip for truly excellent chats
          const raw = area.trim();
          if (!raw || raw.length < 5) return;
          const key = categorizeIssue(raw);
          if (!agent.issueEvidenceMap.has(key)) {
            agent.issueEvidenceMap.set(key, { type: 'improvement', evidences: [], totalCount: 0 });
          }
          const entry = agent.issueEvidenceMap.get(key)!;
          entry.totalCount++;
          if (entry.evidences.length < 5) entry.evidences.push(evidence);
        });
      });

      const results: AgentCoachingData[] = [];

      const totalAgentChatsAll = Array.from(agentMap.values()).reduce((sum, a) => sum + a.totalChatsAll, 0);
      const teamAvgChats = agentMap.size >= 3 ? totalAgentChatsAll / agentMap.size : 0;

      agentMap.forEach((agent, agentName) => {
        const scoreValues = agent.scores.map(s => s.score);
        const avgScore = scoreValues.length > 0
          ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
          : 0;
        const negativeSentimentCount = agent.sentiments.filter(s => s === 'negative').length;

        const minImprovementRepeat = avgScore >= 90 ? Infinity : avgScore >= 70 ? 3 : 2;
        const minCriticalRepeat = avgScore >= 70 ? 2 : 1;

        const evidencedIssues: EvidencedIssue[] = Array.from(agent.issueEvidenceMap.entries())
          .map(([key, data]) => {
            const displayText = CATEGORY_LABELS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
            return {
              text: displayText,
              type: data.type,
              count: data.totalCount,
              evidences: data.evidences.sort((a, b) => a.score - b.score),
              correctApproach: deriveCorrectApproach(displayText),
            };
          })
          .filter(issue => {
            if (issue.type === 'critical') return issue.count >= minCriticalRepeat;
            return issue.count >= minImprovementRepeat;
          })
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'critical' ? -1 : 1;
            return b.count - a.count;
          })
          .slice(0, 10);

        const isInsufficientActivity = teamAvgChats > 0 && agent.totalChatsAll < teamAvgChats * 0.5;
        const urgency: AgentCoachingData['urgency'] = isInsufficientActivity
          ? 'insufficient_activity'
          : determineUrgency(avgScore, agent.totalChatsAll);

        const sortedByScore = [...agent.scores].sort((a, b) => a.score - b.score);
        const lowestScoringChats: ChatEvidence[] = sortedByScore.slice(0, 3).map(s => {
          const chat = chatMap.get(s.chatId);
          const analysis = allAnalyses.find(a => a.chat_id === s.chatId);
          return {
            chatId: s.chatId,
            customerName: chat?.customer_name || 'Belirtilmemis',
            date: s.date,
            score: s.score,
            aiSummary: analysis?.ai_summary || '',
            recommendation: analysis?.recommendations || '',
          };
        }).filter(c => c.chatId);

        const chronoScores = [...agent.scores]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(s => s.score);
        const midIdx = Math.floor(chronoScores.length / 2);
        const firstHalfAvg = chronoScores.slice(0, midIdx).reduce((a, b) => a + b, 0) / (midIdx || 1);
        const secondHalfAvg = chronoScores.slice(midIdx).reduce((a, b) => a + b, 0) / (chronoScores.slice(midIdx).length || 1);
        const trend: 'up' | 'down' | 'stable' =
          secondHalfAvg - firstHalfAvg > 3 ? 'up' :
          firstHalfAvg - secondHalfAvg > 3 ? 'down' : 'stable';

        const actionItems = buildActionItems(evidencedIssues, avgScore);
        // Check if this agent had coaching before (repeat scenario)
        const hadPreviousCoaching = coachingHistory.has(agentName);
        const coachingScript = isInsufficientActivity
          ? buildActivityReviewScript(agentName, agent.totalChatsAll, teamAvgChats, dateRange, avgScore)
          : buildDetailedScript(agentName, evidencedIssues, avgScore, agent.totalChatsAll, dateRange, lowestScoringChats, actionItems, hadPreviousCoaching);

        results.push({
          agentName,
          avgScore,
          totalChats: agent.totalChatsAll,
          negativeSentimentCount,
          requiresAttentionCount: agent.attentionCount,
          scoreBreakdown: agent.scoreBreakdown,
          evidencedIssues,
          coachingScript,
          lastActivityDate: agent.lastDate,
          trend,
          urgency,
          lowestScoringChats,
          actionItems,
          teamAvgChats,
        });
      });

      results.sort((a, b) => {
        const urgencyOrder: Record<string, number> = { high: 0, insufficient_activity: 1, medium: 2, low: 3, excellent: 4 };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        return a.avgScore - b.avgScore;
      });

      setCoachingData(results);
    } catch (err) {
      console.error('Error loading coaching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (agentName: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  };

  const toggleIssue = (key: string) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getTab = (agentName: string) => activeTab[agentName] || 'issues';
  const setTab = (agentName: string, tab: 'issues' | 'script' | 'actions') => {
    setActiveTab(prev => ({ ...prev, [agentName]: tab }));
  };

  const copyScript = async (agentName: string, script: string) => {
    await navigator.clipboard.writeText(script);
    setCopiedAgent(agentName);
    setTimeout(() => setCopiedAgent(null), 2000);
  };

  const markFeedbackSent = async (agent: AgentCoachingData) => {
    if (!session?.user?.id) return;
    setSendingFeedback(agent.agentName);
    try {
      const summary = agent.evidencedIssues.length > 0
        ? agent.evidencedIssues.slice(0, 3).map(i => i.text).join('; ')
        : 'Genel performans degerlendirmesi';
      const insertData: any = {
        agent_name: agent.agentName,
        coaching_suggestion: summary,
        sent_by: session.user.id,
        sent_at: new Date().toISOString(),
      };
      if (activeBrand?.brand_id) insertData.brand_id = activeBrand.brand_id;
      const { error } = await supabase.from('coaching_feedbacks').insert(insertData);
      if (!error) {
        setCoachingHistory(prev => new Map([...prev, [agent.agentName, new Date().toISOString()]]));
      }
    } catch (err) {
      console.error('Error marking feedback:', err);
    } finally {
      setSendingFeedback(null);
    }
  };

  const filteredData = useMemo(() => {
    if (filterUrgency === 'all') return coachingData;
    return coachingData.filter(d => d.urgency === filterUrgency);
  }, [coachingData, filterUrgency]);

  const todayStr = new Date().toDateString();
  const summaryStats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      high: coachingData.filter(d => d.urgency === 'high').length,
      medium: coachingData.filter(d => d.urgency === 'medium').length,
      low: coachingData.filter(d => d.urgency === 'low').length,
      excellent: coachingData.filter(d => d.urgency === 'excellent').length,
      insufficient_activity: coachingData.filter(d => d.urgency === 'insufficient_activity').length,
      sentTodayCount: [...coachingHistory.values()].filter(d => new Date(d).toDateString() === today).length,
      totalAgents: coachingData.length,
    };
  }, [coachingData, coachingHistory]);

  const formatDaysAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'bugün';
    if (diff === 1) return 'dün';
    return `${diff} gün önce`;
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-rose-400" />;
    return <Minus className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-cyan-400" />
            Yönetici Koçluk Merkezi
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Kanıt bazlı görüşme senaryoları — chat ID'leri ve AI analizleriyle desteklenmiş
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg border border-slate-700/50 p-1">
            {(['1', '7', '30'] as DateRange[]).map(d => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                  dateRange === d
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'
                }`}
              >
                {d === '1' ? 'Bugün' : `Son ${d} Gün`}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowReport(true)}
            disabled={coachingData.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 hover:border-cyan-400/50 text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileBarChart className="w-4 h-4" />
            Rapor
          </button>
          <button
            onClick={loadCoachingData}
            className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-500 dark:text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-all duration-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-effect rounded-xl p-4 border border-rose-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Acil Görüşme</span>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{summaryStats.high}</div>
          <div className="text-xs text-slate-500 mt-1">personel (ort. &lt;60)</div>
        </div>
        <div className="glass-effect rounded-xl p-4 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2">
            <BarChart2 className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Düşük Aktivite</span>
          </div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{summaryStats.insufficient_activity}</div>
          <div className="text-xs text-slate-500 mt-1">personel (&lt;%50 avg)</div>
        </div>
        <div className="glass-effect rounded-xl p-4 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Orta Öncelik</span>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summaryStats.medium}</div>
          <div className="text-xs text-slate-500 mt-1">personel (ort. 60–70)</div>
        </div>
        <div className="glass-effect rounded-xl p-4 border border-cyan-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">İyi Performans</span>
          </div>
          <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{summaryStats.low}</div>
          <div className="text-xs text-slate-500 mt-1">personel (ort. 70–89)</div>
        </div>
        <div className="glass-effect rounded-xl p-4 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Mükemmel</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summaryStats.excellent}</div>
          <div className="text-xs text-slate-500 mt-1">personel (ort. 90+)</div>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100/80 dark:bg-slate-800/40 px-3 py-1.5 rounded-lg border border-slate-700/40">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>Bugün geri bildirim verildi:</span>
          <span className="font-semibold text-emerald-400">{summaryStats.sentTodayCount}</span>
        </div>
        <div className="text-xs text-slate-500">
          Toplam <span className="text-slate-900 dark:text-white font-medium">{summaryStats.totalAgents}</span> personel
        </div>
      </div>

      <div className="glass-effect rounded-xl border border-slate-700/50 p-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          {([
            { key: 'all', label: 'Tümü', icon: null, active: 'bg-slate-600/80 text-slate-900 dark:text-white border-slate-500/60 shadow-sm', inactive: 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-700/40' },
            { key: 'high', label: 'Acil', icon: <AlertTriangle className="w-3.5 h-3.5" />, active: 'bg-rose-500/25 text-rose-300 border-rose-500/50 shadow-rose-500/10 shadow-sm', inactive: 'text-slate-500 dark:text-slate-400 hover:text-rose-300 hover:bg-rose-500/10' },
            { key: 'insufficient_activity', label: 'Düşük Aktivite', icon: <BarChart2 className="w-3.5 h-3.5" />, active: 'bg-orange-500/25 text-orange-300 border-orange-500/50 shadow-orange-500/10 shadow-sm', inactive: 'text-slate-500 dark:text-slate-400 hover:text-orange-300 hover:bg-orange-500/10' },
            { key: 'medium', label: 'Orta', icon: <Target className="w-3.5 h-3.5" />, active: 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-amber-500/10 shadow-sm', inactive: 'text-slate-500 dark:text-slate-400 hover:text-amber-300 hover:bg-amber-500/10' },
            { key: 'low', label: 'İyi', icon: <TrendingUp className="w-3.5 h-3.5" />, active: 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50 shadow-cyan-500/10 shadow-sm', inactive: 'text-slate-500 dark:text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10' },
            { key: 'excellent', label: 'Mükemmel', icon: <Star className="w-3.5 h-3.5" />, active: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-emerald-500/10 shadow-sm', inactive: 'text-slate-500 dark:text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10' },
          ] as const).map(({ key, label, icon, active, inactive }) => {
            const isActive = filterUrgency === key;
            const count = key !== 'all' ? (summaryStats as Record<string, number>)[key] ?? 0 : summaryStats.totalAgents;
            return (
              <button
                key={key}
                onClick={() => setFilterUrgency(key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                  isActive
                    ? `${active} border`
                    : `${inactive} border-transparent`
                }`}
              >
                {icon}
                <span>{label}</span>
                <span className={`ml-0.5 min-w-[1.4rem] text-center px-1.5 py-0.5 rounded-md text-xs font-bold ${
                  isActive ? 'bg-white/15' : 'bg-slate-700/60 text-slate-500 dark:text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Chatler analiz ediliyor...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="glass-effect rounded-xl p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-300 font-medium">Bu periyotta veri bulunamadi</p>
          <p className="text-slate-500 text-sm mt-1">Farkli bir tarih araligini deneyin</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredData.map(agent => {
            const isExpanded = expandedAgents.has(agent.agentName);
            const lastCoachingDate = coachingHistory.get(agent.agentName);
            const isSentToday = lastCoachingDate ? new Date(lastCoachingDate).toDateString() === todayStr : false;
            const wasCoachedBefore = !!lastCoachingDate && !isSentToday;
            const isRepeatCoaching = wasCoachedBefore && agent.evidencedIssues.length > 0 && !['excellent', 'low', 'insufficient_activity'].includes(agent.urgency);
            const hasImproved = wasCoachedBefore && agent.evidencedIssues.length === 0;
            const activeScript = isExpanded
              ? agent.urgency === 'insufficient_activity'
                ? buildActivityReviewScript(agent.agentName, agent.totalChats, agent.teamAvgChats, dateRange, agent.avgScore)
                : buildDetailedScript(agent.agentName, agent.evidencedIssues, agent.avgScore, agent.totalChats, dateRange, agent.lowestScoringChats, agent.actionItems, isRepeatCoaching)
              : agent.coachingScript;
            const initials = agent.agentName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
            const tab = getTab(agent.agentName);
            const breakdownEntries = (Object.entries(agent.scoreBreakdown) as [keyof ScoreBreakdown, number][]).filter(([, count]) => count > 0);

            return (
              <div
                key={agent.agentName}
                className={`glass-effect rounded-xl border transition-all duration-300 ${
                  agent.urgency === 'high' ? 'border-rose-500/30 shadow-lg shadow-rose-500/5' :
                  agent.urgency === 'insufficient_activity' ? 'border-orange-500/30 shadow-lg shadow-orange-500/5' :
                  agent.urgency === 'medium' ? 'border-amber-500/20' :
                  agent.urgency === 'excellent' ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/5' :
                  'border-slate-700/50'
                }`}
              >
                <div className="p-5 cursor-pointer select-none" onClick={() => toggleExpand(agent.agentName)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      agent.urgency === 'high' ? 'bg-rose-500/20 text-rose-300 border-2 border-rose-500/40' :
                      agent.urgency === 'insufficient_activity' ? 'bg-orange-500/20 text-orange-300 border-2 border-orange-500/40' :
                      agent.urgency === 'medium' ? 'bg-amber-500/20 text-amber-300 border-2 border-amber-500/40' :
                      agent.urgency === 'excellent' ? 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500/40' :
                      'bg-cyan-500/20 text-cyan-300 border-2 border-cyan-500/30'
                    }`}>
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-white text-base">{agent.agentName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${URGENCY_COLORS[agent.urgency]}`}>
                          {URGENCY_LABELS[agent.urgency]}
                        </span>
                        {isSentToday && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Bugün görüşüldü
                          </span>
                        )}
                        {isRepeatCoaching && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Repeat className="w-3 h-3" />
                            Sorunlar devam ediyor ({formatDaysAgo(lastCoachingDate!)} görüşüldü)
                          </span>
                        )}
                        {hasImproved && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            İyileşti ({formatDaysAgo(lastCoachingDate!)} görüşüldü)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className={`font-bold text-sm ${SCORE_COLOR(agent.avgScore)}`}>
                          {agent.avgScore}
                          <span className="text-slate-500 font-normal">/100</span>
                        </span>
                        <span className="text-slate-600">|</span>
                        <span>{agent.totalChats} chat</span>
                        <TrendIcon trend={agent.trend} />
                        {breakdownEntries.map(([cat, count]) => (
                          <span key={cat} className={`flex items-center gap-1 ${SCORE_CATEGORY_COLORS[cat]}`}>
                            {count} {SCORE_CATEGORY_LABELS[cat].toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {agent.evidencedIssues.length > 0 && !isExpanded && (
                        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-lg border border-slate-700/40">
                          <Repeat className="w-3 h-3" />
                          <span>{agent.evidencedIssues.length} sorun</span>
                        </div>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700/40">
                    <div className="flex border-b border-slate-700/40">
                      {([
                        { id: 'issues', label: 'Kanıtlı Sorunlar', icon: AlertTriangle, count: agent.evidencedIssues.length },
                        { id: 'script', label: 'Görüşme Senaryosu', icon: FileText, count: null },
                        { id: 'actions', label: 'Aksiyon Planı', icon: ListChecks, count: agent.actionItems.length },
                      ] as const).map(t => (
                        <button
                          key={t.id}
                          onClick={() => setTab(agent.agentName, t.id)}
                          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${
                            tab === t.id
                              ? 'border-cyan-500 text-cyan-300 bg-cyan-500/5'
                              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:bg-slate-800/30'
                          }`}
                        >
                          <t.icon className="w-3.5 h-3.5" />
                          {t.label}
                          {t.count !== null && t.count > 0 && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                              {t.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-slate-700/30">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Son aktivite: {formatDateTime(agent.lastActivityDate)}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); markFeedbackSent(agent); }}
                        disabled={sendingFeedback === agent.agentName || isSentToday}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isSentToday
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : isRepeatCoaching
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                        }`}
                      >
                        {sendingFeedback === agent.agentName ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : isSentToday ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : isRepeatCoaching ? (
                          <Repeat className="w-4 h-4" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        {isSentToday
                          ? 'Bugün Görüşme Kaydedildi'
                          : isRepeatCoaching
                            ? `Tekrar Görüşme Yap (son: ${formatDaysAgo(lastCoachingDate!)})`
                            : 'Görüşme Yapıldı Olarak Kaydet'}
                      </button>
                    </div>

                    <div className="p-5">
                      {tab === 'issues' && (
                        <div className="space-y-4">
                          {isRepeatCoaching && (
                            <div className="bg-amber-950/20 rounded-lg border border-amber-500/20 p-3 flex items-start gap-3">
                              <Repeat className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-semibold text-amber-300">Tekrarlayan Sorun Uyarısı</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  Bu personelle son görüşme <span className="text-amber-400">{formatDaysAgo(lastCoachingDate!)}</span> yapıldı
                                  ancak aynı dönemde sorunlar tespit edilmeye devam ediyor.
                                  Görüşme yaklaşımını değiştirmeyi veya daha sık takip yapmayı düşünün.
                                </p>
                              </div>
                            </div>
                          )}
                          {agent.evidencedIssues.length === 0 ? (
                            <div className="bg-emerald-950/20 rounded-lg border border-emerald-500/20 p-5 flex items-center gap-3">
                              <Star className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                              <div>
                                <p className="font-medium text-emerald-300">Hata Tespit Edilmedi</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Bu personel seçili periyotta hata kaydetmedi. Performansını korumaya devam etmesi için teşvik edin.</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              {agent.evidencedIssues.filter(i => i.type === 'critical').length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                                    <h4 className="text-sm font-semibold text-rose-300">Kritik Hatalar</h4>
                                    <div className="h-px flex-1 bg-rose-500/20" />
                                  </div>
                                  <div className="space-y-3">
                                    {agent.evidencedIssues.filter(i => i.type === 'critical').map((issue, idx) => {
                                      const issueKey = `${agent.agentName}-c-${idx}`;
                                      const isIssueExpanded = expandedIssues.has(issueKey);
                                      return (
                                        <div key={idx} className="bg-rose-950/20 rounded-lg border border-rose-500/20 overflow-hidden">
                                          <div
                                            className="p-4 cursor-pointer"
                                            onClick={() => toggleIssue(issueKey)}
                                          >
                                            <div className="flex items-start gap-3">
                                              <div className="w-6 h-6 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <span className="text-rose-400 text-xs font-bold">{issue.count}</span>
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-rose-200">{issue.text}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                  {issue.count} chatta tespit edildi
                  {issue.count > issue.evidences.length && ` (${issue.evidences.length} kanıt gösteriliyor)`}
                </p>
                                              </div>
                                              <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-xs text-slate-500">{issue.evidences.length} kanıt</span>
                                                {isIssueExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                                              </div>
                                            </div>
                                          </div>

                                          {isIssueExpanded && (
                                            <div className="border-t border-rose-500/20">
                                              <div className="p-4 space-y-3">
                                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Kanıt Chatler</p>
                                                {issue.evidences.map((ev, evIdx) => (
                                                  <div key={evIdx} className="bg-slate-100/50 dark:bg-slate-900/50 rounded-lg border border-slate-700/40 p-3">
                                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                                      <span className="flex items-center gap-1 text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                                                        <Hash className="w-3 h-3" />
                                                        {shortChatId(ev.chatId)}
                                                      </span>
                                                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(ev.date)}</span>
                                                      <span className="text-xs text-slate-500 dark:text-slate-400">Müsteri: {ev.customerName}</span>
                                                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${SCORE_BG(ev.score)}`}>
                                                        Skor: {ev.score}/100
                                                      </span>
                                                    </div>
                                                    {ev.aiSummary && (
                                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-2 pl-2 border-l-2 border-slate-600">
                                                        "{ev.aiSummary.slice(0, 200)}{ev.aiSummary.length > 200 ? '...' : ''}"
                                                      </p>
                                                    )}
                                                    {ev.recommendation && (
                                                      <p className="text-xs text-amber-300/80 leading-relaxed">
                                                        <span className="font-medium text-amber-400">AI Önerisi:</span> {ev.recommendation.slice(0, 180)}{ev.recommendation.length > 180 ? '...' : ''}
                                                      </p>
                                                    )}
                                                  </div>
                                                ))}

                                                <div className="bg-cyan-950/30 rounded-lg border border-cyan-500/20 p-3">
                                                  <div className="flex items-start gap-2">
                                                    <Lightbulb className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                                                    <div>
                                                      <p className="text-xs font-semibold text-cyan-300 mb-1">Dogru Yaklasim</p>
                                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{issue.correctApproach}</p>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {agent.evidencedIssues.filter(i => i.type === 'improvement').length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <Target className="w-4 h-4 text-amber-400" />
                                    <h4 className="text-sm font-semibold text-amber-300">Gelistirme Alanlari</h4>
                                    <div className="h-px flex-1 bg-amber-500/20" />
                                  </div>
                                  <div className="space-y-3">
                                    {agent.evidencedIssues.filter(i => i.type === 'improvement').map((issue, idx) => {
                                      const issueKey = `${agent.agentName}-i-${idx}`;
                                      const isIssueExpanded = expandedIssues.has(issueKey);
                                      return (
                                        <div key={idx} className="bg-amber-950/10 rounded-lg border border-amber-500/15 overflow-hidden">
                                          <div className="p-4 cursor-pointer" onClick={() => toggleIssue(issueKey)}>
                                            <div className="flex items-start gap-3">
                                              <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <span className="text-amber-400 text-xs font-bold">{issue.count}</span>
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-amber-200">{issue.text}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                  {issue.count} chatta tespit edildi
                                                  {issue.count > issue.evidences.length && ` (${issue.evidences.length} kanıt gösteriliyor)`}
                                                </p>
                                              </div>
                                              <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-xs text-slate-500">{issue.evidences.length} kanit</span>
                                                {isIssueExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
                                              </div>
                                            </div>
                                          </div>

                                          {isIssueExpanded && (
                                            <div className="border-t border-amber-500/15">
                                              <div className="p-4 space-y-3">
                                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Örnek Chatler</p>
                                                {issue.evidences.slice(0, 3).map((ev, evIdx) => (
                                                  <div key={evIdx} className="bg-slate-100/50 dark:bg-slate-900/50 rounded-lg border border-slate-700/40 p-3">
                                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                                      <span className="flex items-center gap-1 text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                                                        <Hash className="w-3 h-3" />
                                                        {shortChatId(ev.chatId)}
                                                      </span>
                                                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(ev.date)}</span>
                                                      <span className="text-xs text-slate-500 dark:text-slate-400">Müsteri: {ev.customerName}</span>
                                                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${SCORE_BG(ev.score)}`}>
                                                        {ev.score}/100
                                                      </span>
                                                    </div>
                                                    {ev.aiSummary && (
                                                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                                        "{ev.aiSummary.slice(0, 160)}{ev.aiSummary.length > 160 ? '...' : ''}"
                                                      </p>
                                                    )}
                                                  </div>
                                                ))}
                                                <div className="bg-cyan-950/30 rounded-lg border border-cyan-500/20 p-3">
                                                  <div className="flex items-start gap-2">
                                                    <Lightbulb className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                                                    <div>
                                                      <p className="text-xs font-semibold text-cyan-300 mb-1">Onerim</p>
                                                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{issue.correctApproach}</p>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {agent.lowestScoringChats.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-3">
                                    <BarChart2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                    <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300">En Düşük Skorlu Chatler</h4>
                                    <div className="h-px flex-1 bg-slate-700/50" />
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {agent.lowestScoringChats.map((chat, idx) => (
                                      <div key={idx} className="bg-slate-100/80 dark:bg-slate-800/40 rounded-lg border border-slate-700/40 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="flex items-center gap-1 text-xs font-mono text-cyan-400">
                                            <Hash className="w-3 h-3" />
                                            {shortChatId(chat.chatId)}
                                          </span>
                                          <span className={`text-sm font-bold ${SCORE_COLOR(chat.score)}`}>{chat.score}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(chat.date)}</p>
                                        <p className="text-xs text-slate-500">Müsteri: {chat.customerName}</p>
                                        {chat.aiSummary && (
                                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed border-t border-slate-700/40 pt-2">
                                            {chat.aiSummary.slice(0, 100)}...
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {tab === 'script' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Y: Yönetici konuşur — P: Personel cevaplar — Somut chat örnekleriyle hazır senaryo</p>
                              {isRepeatCoaching && (
                                <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                                  <Repeat className="w-3 h-3" />
                                  Takip görüşmesi senaryosu — daha önceki görüşme baz alınarak daha doğrudan bir ton kullanılmıştır
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => copyScript(agent.agentName, activeScript)}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-200 border bg-slate-800/60 border-slate-700/50 hover:border-cyan-500/40 hover:text-cyan-300 text-slate-600 dark:text-slate-300"
                            >
                              {copiedAgent === agent.agentName ? (
                                <><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Kopyalandi</span></>
                              ) : (
                                <><Copy className="w-3.5 h-3.5" /><span>Tümünü Kopyala</span></>
                              )}
                            </button>
                          </div>
                          <pre className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed bg-slate-900/60 rounded-xl p-5 border border-slate-700/40 overflow-x-auto text-xs">
                            {activeScript}
                          </pre>
                        </div>
                      )}

                      {tab === 'actions' && (
                        <div className="space-y-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Görüşme sonrası takip edilmesi gereken aksiyonlar</p>
                          <div className="space-y-2">
                            {agent.actionItems.map((item, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-3 bg-slate-100/60 dark:bg-slate-800/30 rounded-lg border border-slate-700/30 hover:border-cyan-500/20 transition-colors duration-200">
                                <div className="w-5 h-5 rounded border-2 border-slate-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-sm text-slate-700 dark:text-slate-200">{item}</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between pt-3 border-t border-slate-700/40">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Son aktivite: {formatDateTime(agent.lastActivityDate)}</span>
                            </div>
                            <button
                              onClick={() => markFeedbackSent(agent)}
                              disabled={sendingFeedback === agent.agentName || isSentToday}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                isSentToday
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-default'
                                  : isRepeatCoaching
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                              }`}
                            >
                              {sendingFeedback === agent.agentName ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : isSentToday ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : isRepeatCoaching ? (
                                <Repeat className="w-4 h-4" />
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                              {isSentToday
                                ? 'Bugün Görüşme Kaydedildi'
                                : isRepeatCoaching
                                  ? `Tekrar Görüşme Yap (son: ${formatDaysAgo(lastCoachingDate!)})`
                                  : 'Görüşme Yapıldı Olarak Kaydet'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showReport && (
        <CoachingReport
          coachingData={coachingData}
          coachingHistory={coachingHistory}
          dateRange={dateRange}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
