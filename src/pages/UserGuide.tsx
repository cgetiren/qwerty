import { useState } from 'react';
import {
  BookOpen, BarChart3, MessageSquare, Users, Award, Settings,
  AlertTriangle, TrendingUp, Activity, GraduationCap,
  ChevronRight, Info, Zap, Shield, CheckCircle, Clock, Star,
  Database, Bell, RefreshCw, Search, Filter, Target,
  Brain, BarChart2, PieChart, Calendar, DollarSign, Layers,
  ArrowRight, Hash, PhoneCall, UserCog, Lock,
  PhoneIncoming, Tag
} from 'lucide-react';

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
}

const sections: Section[] = [
  { id: 'overview',       title: 'Genel Bakış',               icon: Info,          color: 'text-sky-400' },
  { id: 'dashboard',      title: 'Dashboard',                  icon: BarChart3,     color: 'text-blue-400' },
  { id: 'chats',          title: 'Chat Analizleri',            icon: MessageSquare, color: 'text-emerald-400' },
  { id: 'personnel',      title: 'Personel Analizi',           icon: Users,         color: 'text-amber-400' },
  { id: 'reports',        title: 'Raporlar',                   icon: TrendingUp,    color: 'text-cyan-400' },
  { id: 'monitoring',     title: 'Canlı İzleme',               icon: Activity,      color: 'text-green-400' },
  { id: 'bonus-settings', title: 'Prim Ayarları',              icon: DollarSign,    color: 'text-yellow-400' },
  { id: 'bonus-reports',  title: 'Prim Raporları',             icon: Award,         color: 'text-orange-400' },
  { id: 'coaching',         title: 'Yönetici Koçluk Merkezi',   icon: GraduationCap, color: 'text-teal-400' },
  { id: 'ai-criteria',     title: 'AI Analiz Kriterleri',       icon: Brain,         color: 'text-blue-400' },
  { id: 'callback-queue',  title: 'Geri Arama Kuyruğu',        icon: PhoneCall,     color: 'text-cyan-400' },
  { id: 'user-management', title: 'Kullanıcı Yönetimi',        icon: UserCog,       color: 'text-rose-400' },
  { id: 'role-management', title: 'Roller & Yetkiler',          icon: Shield,        color: 'text-rose-400' },
  { id: 'settings',        title: 'Ayarlar',                    icon: Settings,      color: 'text-slate-500 dark:text-slate-400' },
];

function SectionHeader({ icon: Icon, title, color, id }: { icon: React.ElementType; title: string; color: string; id: string }) {
  return (
    <div id={id} className="flex items-center gap-3 mb-6 pt-2">
      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-700/60">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
    </div>
  );
}

function InfoCard({ title, children, accent = 'blue' }: { title: string; children: React.ReactNode; accent?: string }) {
  const accents: Record<string, string> = {
    blue:    'border-blue-500/30 bg-blue-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    amber:   'border-amber-500/30 bg-amber-500/5',
    red:     'border-red-500/30 bg-red-500/5',
    cyan:    'border-cyan-500/30 bg-cyan-500/5',
    teal:    'border-teal-500/30 bg-teal-500/5',
    rose:    'border-rose-500/30 bg-rose-500/5',
    orange:  'border-orange-500/30 bg-orange-500/5',
    slate:   'border-slate-600/50 bg-slate-800/60',
  };
  return (
    <div className={`rounded-xl border p-5 ${accents[accent] ?? accents.slate}`}>
      {title && <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 uppercase tracking-wide">{title}</h3>}
      {children}
    </div>
  );
}

function Badge({ label, color = 'slate' }: { label: string; color?: string }) {
  const colors: Record<string, string> = {
    green:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    blue:    'bg-blue-500/15 text-blue-300 border-blue-500/30',
    amber:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
    red:     'bg-red-500/15 text-red-300 border-red-500/30',
    slate:   'bg-slate-700/60 text-slate-600 dark:text-slate-300 border-slate-600/50',
    cyan:    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    teal:    'bg-teal-500/15 text-teal-300 border-teal-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color] ?? colors.slate}`}>
      {label}
    </span>
  );
}

function MetricRow({ label, value, desc }: { label: string; value?: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-700/40 last:border-0">
      <div className="w-44 shrink-0">
        <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
        {value && <span className="ml-2 text-xs text-slate-500">{value}</span>}
      </div>
      <span className="text-sm text-slate-500 dark:text-slate-400">{desc}</span>
    </div>
  );
}

function StepItem({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-7 h-7 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-xs font-bold text-sky-300">{num}</div>
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

export default function UserGuide() {
  const [activeSection, setActiveSection] = useState('overview');

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-gradient-to-r from-sky-900/60 to-slate-900/80 border border-sky-500/20 rounded-2xl p-8 mb-8 shadow-xl">
        <div className="flex items-start gap-5">
          <div className="p-3 rounded-xl bg-sky-500/20 border border-sky-500/30">
            <BookOpen className="w-8 h-8 text-sky-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">Sistem Kullanım Kılavuzu</h1>
            <p className="text-sky-200/80 text-base mb-4">LiveChat Kalite Kontrol ve Performans İzleme Sistemi — Kapsamlı Yönetici Rehberi</p>
            <div className="flex flex-wrap gap-2">
              <Badge label="Versiyon 5.0" color="blue" />
              <Badge label="Güncel" color="green" />
              <Badge label="Türkçe" color="slate" />
              <Badge label="Yönetici Rehberi" color="cyan" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-8">
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-6 glass-effect rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">İçindekiler</p>
            </div>
            <nav className="p-2">
              {sections.map((s) => {
                const Icon = s.icon;
                const active = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all duration-150 mb-0.5 ${
                      active
                        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? s.color : ''}`} />
                    <span className="leading-tight">{s.title}</span>
                    {active && <ChevronRight className="w-3 h-3 ml-auto" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="flex-1 min-w-0 space-y-10">

          {/* ── GENEL BAKIŞ ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="overview" icon={Info} title="Genel Bakış" color="text-sky-400" />
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              Bu sistem, LiveChat üzerinden yürütülen tüm müşteri görüşmelerini yapay zeka destekli olarak
              otomatik analiz eder; personel performansını puanlar, gelişim alanlarını tespit eder ve
              yöneticilere veri bazlı karar alma imkânı sunar.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {[
                { icon: Zap,        color: 'text-yellow-400', title: 'Otomatik Senkronizasyon',   desc: 'LiveChat chatları her 10 dakikada bir otomatik çekilir' },
                { icon: Brain,      color: 'text-blue-400',   title: 'AI Destekli Analiz',         desc: 'Claude AI her chati 0-100 puan üzerinden değerlendirir' },
                { icon: Bell,       color: 'text-red-400',    title: 'Anlık Telegram Uyarıları',   desc: 'Kritik chatler tespit edildiğinde anında bildirim gönderilir' },
                { icon: Award,      color: 'text-emerald-400',title: 'Otomatik Prim Hesaplama',    desc: 'Tanımladığınız kurallara göre primler otomatik hesaplanır' },
                { icon: GraduationCap, color: 'text-teal-400', title: 'Koçluk Senaryoları',      desc: 'Her personel için hazır yönetici-personel görüşme senaryosu' },
                { icon: Shield,     color: 'text-slate-500 dark:text-slate-400',  title: 'Güvenli Altyapı',            desc: 'Supabase RLS ile rol tabanlı veri erişim kontrolü' },
              ].map((f) => (
                <div key={f.title} className="flex gap-3 p-4 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-700/40">
                  <f.icon className={`w-5 h-5 shrink-0 mt-0.5 ${f.color}`} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{f.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <InfoCard title="Sistem Akışı" accent="slate">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                {['LiveChat API', 'Otomatik Senkronizasyon', 'Claude AI Analizi', 'Veritabanı', 'Dashboard / Raporlar / Koçluk'].map((step, i, arr) => (
                  <span key={step} className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg bg-slate-700/60 border border-slate-600/50 text-xs font-medium">{step}</span>
                    {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-500" />}
                  </span>
                ))}
              </div>
            </InfoCard>
          </section>

          {/* ── DASHBOARD ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="dashboard" icon={BarChart3} title="Dashboard" color="text-blue-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Ana sayfada seçilen tarih aralığına ait tüm temel metrikler, grafikler ve personel karşılaştırmaları yer alır.
            </p>

            <div className="space-y-4">
              <InfoCard title="Üst Bant — Temel Metrikler" accent="blue">
                <div className="space-y-0.5">
                  <MetricRow label="Unique Chat"           desc="Farklı müşterilerle açılmış toplam görüşme sayısı" />
                  <MetricRow label="Total Thread"          desc="Tek bir chat içindeki mesaj thread adedi" />
                  <MetricRow label="Ortalama Skor"         desc="Tüm AI analizlerinin genel puan ortalaması (0–100)" />
                  <MetricRow label="Ortalama Yanıt Süresi" desc="Müşteriye ilk yanıt verilme süresi (saniye)" />
                  <MetricRow label="Müşteri Memnuniyeti"   desc="Müşteri rating puanlarının yüzde ortalaması" />
                </div>
              </InfoCard>

              <InfoCard title="Sentiment Dağılımı" accent="emerald">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">AI her chati müşteri memnuniyetine göre üç kategoriye atar:</p>
                <div className="space-y-2">
                  {[
                    { dot: 'bg-emerald-500', label: 'Pozitif', desc: 'Sorun çözüldü, müşteri memnun, iletişim başarılı' },
                    { dot: 'bg-yellow-500',  label: 'Nötr',    desc: 'Standart görüşme, özel bir sorun tespit edilmedi' },
                    { dot: 'bg-red-500',     label: 'Negatif', desc: 'Müşteri memnun değil, sorun çözülmedi, şikayet var' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-3 text-sm">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                      <span className="text-slate-900 dark:text-white font-medium w-16">{s.label}</span>
                      <span className="text-slate-500 dark:text-slate-400">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard title="Haftanın En İyi Performansı" accent="amber">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Son 7 günün en yüksek istatistiksel skora sahip 5 personeli listelenir. Her kartta chat sayısı, ortalama skor ve müşteri memnuniyeti gösterilir.</p>
                </InfoCard>
                <InfoCard title="Gelişim Gereken Personel" accent="red">
                  <p className="text-sm text-slate-500 dark:text-slate-400">En düşük skorlu 5 personel listelenir. Yöneticinin öncelikli dikkat etmesi gereken personeli hızlıca görüntülemesini sağlar.</p>
                </InfoCard>
              </div>

              <InfoCard title="Müşteri Şikayet Analizi" accent="cyan">
                <div className="space-y-1.5 text-sm">
                  <p className="text-slate-500 dark:text-slate-400 mb-2">Dashboard'un alt bölümünde müşteri bazlı şikayet analizleri yer alır:</p>
                  <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" /><span className="text-slate-600 dark:text-slate-300">Top 10 Şikayet Kategorisi — AI'ın negatif chatlerden otomatik çıkardığı kategori istatistikleri</span></div>
                  <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" /><span className="text-slate-600 dark:text-slate-300">Günlük Şikayet Trendi — Son 7 günün saatlik ve günlük dağılımı</span></div>
                  <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-cyan-400 shrink-0" /><span className="text-slate-600 dark:text-slate-300">Saatlik Dağılım Isı Haritası — Hangi saatlerde yoğunlaştığını gösterir</span></div>
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── CHAT ANALİZLERİ ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="chats" icon={MessageSquare} title="Chat Analizleri" color="text-emerald-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Tüm chatler tarih, personel ve sentiment'a göre filtrelenebilir. Herhangi bir chate tıklandığında
              tam mesaj geçmişi ve AI analiz detayları açılır.
            </p>

            <div className="space-y-4">
              <InfoCard title="Filtre Seçenekleri" accent="emerald">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {[
                    { icon: Calendar, label: 'Tarih Aralığı',   desc: 'Belirli tarihler arasındaki chatler' },
                    { icon: Users,    label: 'Personel',         desc: 'Belirli bir temsilciye ait chatler' },
                    { icon: PieChart, label: 'Sentiment',        desc: 'Pozitif / Nötr / Negatif filtresi' },
                    { icon: Search,   label: 'Müşteri Arama',    desc: 'Müşteri adına göre arama' },
                    { icon: Star,     label: 'Rating',           desc: '1–5 yıldız aralığı filtresi' },
                    { icon: Filter,   label: 'Analiz Durumu',    desc: 'Analiz edilmiş / edilmemiş' },
                  ].map(f => (
                    <div key={f.label} className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-700/40">
                      <f.icon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-slate-900 dark:text-white font-medium">{f.label}</p>
                        <p className="text-xs text-slate-500">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Chat Detay Paneli" accent="slate">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Bir chate tıkladığınızda sağ panelde şunlar görünür:</p>
                <div className="space-y-2">
                  {[
                    'Tüm mesaj geçmişi — müşteri ve temsilci mesajları zaman damgasıyla',
                    'AI Özet — Claude\'ın chati tek cümleyle özetlemesi',
                    'Overall Score (0–100) ve alt skor dağılımı',
                    'Tespit edilen sorunlar (kritik hatalar, geliştirme alanları)',
                    'Koçluk önerisi — bu chat için üretilmişse görünür',
                    'Müşteri rating yıldızı ve yorumu',
                  ].map(item => (
                    <div key={item} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-slate-600 dark:text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Uyarı Eşikleri" accent="red">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3"><Badge label="Skor < 50" color="amber" /><span className="text-slate-500 dark:text-slate-400">Uyarı işareti — Telegram bildirimi tetiklenir</span></div>
                  <div className="flex items-center gap-3"><Badge label="Skor < 30" color="red" /><span className="text-slate-500 dark:text-slate-400">Kritik işareti — Acil müdahale gerekli</span></div>
                  <div className="flex items-center gap-3"><Badge label="Rating 1–2" color="red" /><span className="text-slate-500 dark:text-slate-400">Müşteri şikayeti olarak otomatik işaretlenir</span></div>
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── PERSONEL ANALİZİ ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="personnel" icon={Users} title="Personel Analizi" color="text-amber-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Her personel için günlük / haftalık / aylık performans istatistikleri, skor trendleri,
              uyarı geçmişi ve müşteri memnuniyeti verileri görüntülenir.
            </p>

            <div className="space-y-4">
              <InfoCard title="Puanlama Sistemi" accent="amber">
                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Ham Skor (Average Score)</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Personelin tüm chat analizlerinin basit aritmetik ortalaması.</p>
                  </div>
                  <div className="border-l-4 border-emerald-500 pl-4">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">İstatistiksel Skor (Statistical Score)</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Chat sayısı, tutarlılık ve güvenilirlik faktörleri hesaba katılarak normalize edilmiş gelişmiş skor. Sıralama ve prim hesaplamalarında bu kullanılır.</p>
                  </div>
                </div>
              </InfoCard>

              <InfoCard title="Güvenilirlik Seviyeleri" accent="slate">
                <div className="space-y-2">
                  {[
                    { grade: 'A', label: 'En Güvenilir', color: 'text-emerald-400', desc: 'Yüksek ve tutarlı performans' },
                    { grade: 'B', label: 'Güvenilir',     color: 'text-blue-400',    desc: 'İyi performans, kabul edilebilir kalite' },
                    { grade: 'C', label: 'Orta',          color: 'text-amber-400',   desc: 'Geliştirilmesi gereken alanlar mevcut' },
                    { grade: 'D', label: 'Düşük',         color: 'text-red-400',     desc: 'Ciddi kalite sorunları, acil müdahale' },
                  ].map(g => (
                    <div key={g.grade} className="flex items-center gap-3 py-2 border-b border-slate-700/40 last:border-0">
                      <span className={`w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-600 flex items-center justify-center text-sm font-bold ${g.color}`}>{g.grade}</span>
                      <span className="text-slate-900 dark:text-white text-sm font-medium w-28">{g.label}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-sm">{g.desc}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Metrik Referansı" accent="slate">
                <div className="space-y-0.5">
                  <MetricRow label="Toplam Chat"          desc="Personelin yönettiği toplam görüşme sayısı" />
                  <MetricRow label="Ortalama İlk Yanıt"   desc="Müşterinin ilk mesajına verilen yanıt süresi" />
                  <MetricRow label="Çözüm Süresi"         desc="Chatın başından kapanışına kadar geçen ortalama süre" />
                  <MetricRow label="Uyarı Sayısı"         desc="Düşük skor (< 50) alan chat adedi" />
                  <MetricRow label="Kaçan Chat"           desc="Cevapsız kalan veya kaçırılan görüşmeler" />
                  <MetricRow label="Beğeni / Beğenmeme"   desc="Müşteri pozitif / negatif geri bildirimleri" />
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── RAPORLAR ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="reports" icon={TrendingUp} title="Raporlar" color="text-cyan-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Seçilen tarih aralığı ve personel için detaylı performans raporları ve koçluk öneri geçmişi sunulur.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: BarChart2,  color: 'text-cyan-400',   title: 'Trend Analizi',     desc: 'Zaman içindeki skor ve chat hacmi değişimleri, haftalık karşılaştırmalar' },
                  { icon: Target,     color: 'text-emerald-400',title: 'Koçluk Önerileri',  desc: 'Negatif chatler için AI tarafından üretilmiş bireysel gelişim önerileri' },
                  { icon: Layers,     color: 'text-amber-400',  title: 'Koçluk Etki Raporu',desc: 'Koçluk öncesi ve sonrası performans karşılaştırması, gelişim kanıtı' },
                ].map(r => (
                  <div key={r.title} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-700/40">
                    <r.icon className={`w-5 h-5 ${r.color} mb-3`} />
                    <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{r.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{r.desc}</p>
                  </div>
                ))}
              </div>

              <InfoCard title="Koçluk Öneri Akışı" accent="cyan">
                <div className="space-y-3">
                  <StepItem num={1} title="Negatif Chat Listesi" desc="Düşük skorlu veya sorunlu chatler otomatik listelenir, personele göre filtrelenebilir." />
                  <StepItem num={2} title="AI Öneri Üretimi" desc="Seçili chat için Claude AI analizi esas alarak kişiselleştirilmiş gelişim önerisi üretir." />
                  <StepItem num={3} title="Toplu Üretim" desc="Tüm filtrelenmiş chatler için tek tıkla toplu öneri üretimi yapılabilir." />
                  <StepItem num={4} title="Telegram'a İlet" desc="Oluşturulan öneriler Telegram'a veya doğrudan personele iletilebilir." />
                  <StepItem num={5} title="Koçluk Etki İzleme" desc="Gönderilen öneriler sonrası performans değişimi Koçluk Etki Raporu sekmesinde takip edilir." />
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── CANLI İZLEME ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="monitoring" icon={Activity} title="Canlı İzleme" color="text-green-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Sistem arka planda otomatik çalışır. Bu sayfa, manuel müdahale gereken durumlarda
              ve sistem sağlığını kontrol etmek için kullanılır.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { icon: RefreshCw, color: 'text-blue-400',   title: 'Manuel Senkronizasyon', desc: 'LiveChat\'ten chatları hemen çek. Otomatik senkronizasyonu beklemek istemediğinizde kullanın.' },
                  { icon: Brain,     color: 'text-emerald-400',title: 'Manuel Analiz',          desc: 'Bekleyen chatleri hemen analiz et. Yoğun dönemlerde AI kuyruğunu hızlandırır.' },
                  { icon: Bell,      color: 'text-amber-400',  title: 'Uyarı Gönderimi',        desc: 'Bekleyen Telegram uyarılarını anında gönder.' },
                  { icon: Database,  color: 'text-slate-500 dark:text-slate-400',  title: 'Sistem Durumu',          desc: 'Son senkronizasyon zamanı, son analiz zamanı ve kuyruk durumu.' },
                ].map(m => (
                  <div key={m.title} className="flex gap-3 p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-700/40">
                    <m.icon className={`w-5 h-5 shrink-0 mt-0.5 ${m.color}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{m.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <InfoCard title="Otomatik Zamanlama" accent="slate">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
                    <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-slate-900 dark:text-white w-48">Chat Senkronizasyonu</span>
                    <Badge label="Her 10 dakika" color="blue" />
                  </div>
                  <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
                    <Brain className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-slate-900 dark:text-white w-48">AI Analizi</span>
                    <Badge label="Senkronizasyon sonrası" color="green" />
                  </div>
                  <div className="flex items-center gap-3 py-2">
                    <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-slate-900 dark:text-white w-48">Telegram Bildirimleri</span>
                    <Badge label="Kritik chat tespitinde" color="amber" />
                  </div>
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── PRİM AYARLARI ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="bonus-settings" icon={DollarSign} title="Prim Ayarları" color="text-yellow-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Prim kuralları bu sayfadan tanımlanır. Her kural bir performans metriğini belirli bir koşula
              göre değerlendirir ve koşul sağlanırsa belirlenen tutarda prim verilir.
            </p>

            <div className="space-y-4">
              <InfoCard title="Kural Koşul Türleri" accent="amber">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {[
                    { op: 'greater_than', desc: 'Metrik değeri eşikten büyükse prim verilir',          ex: 'Skor > 85 → +500 TL' },
                    { op: 'less_than',    desc: 'Metrik değeri eşikten küçükse prim verilir',           ex: 'Yanıt süresi < 30sn → +300 TL' },
                    { op: 'between',      desc: 'Metrik belirlenen aralıkta ise prim verilir',          ex: 'Chat 100–150 arası → +400 TL' },
                    { op: 'equals',       desc: 'Metrik tam olarak belirtilen değere eşitse prim',      ex: 'Skor = 100 → +1000 TL' },
                  ].map(r => (
                    <div key={r.op} className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/40">
                      <code className="text-xs text-yellow-400 font-mono">{r.op}</code>
                      <p className="text-slate-600 dark:text-slate-300 text-xs mt-1">{r.desc}</p>
                      <p className="text-slate-500 text-xs mt-1 italic">{r.ex}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Değerlendirilebilir Metrikler" accent="slate">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {[
                    ['total_chats',           'Toplam chat sayısı'],
                    ['avg_score',             'Ortalama AI puanı'],
                    ['avg_satisfaction',      'Müşteri memnuniyeti %'],
                    ['avg_response_time',     'Ortalama yanıt süresi (sn)'],
                    ['positive_chats_count',  'Pozitif chat adedi'],
                    ['negative_chats_count',  'Negatif chat adedi'],
                    ['warning_count',         'Uyarı alan chat adedi'],
                    ['neutral_chats_count',   'Nötr chat adedi'],
                  ].map(([key, label]) => (
                    <div key={key} className="p-2 rounded bg-slate-100 dark:bg-slate-800/50 border border-slate-700/40">
                      <code className="text-yellow-400 font-mono">{key}</code>
                      <p className="text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Periyot Türleri" accent="slate">
                <div className="flex flex-wrap gap-2">
                  <Badge label="Günlük" color="blue" />
                  <Badge label="Haftalık" color="cyan" />
                  <Badge label="Aylık" color="amber" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Her kural için ayrı bir periyot belirlenebilir. Farklı periyottaki kurallar aynı anda aktif olabilir.</p>
              </InfoCard>
            </div>
          </section>

          {/* ── PRİM RAPORLARI ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="bonus-reports" icon={Award} title="Prim Raporları" color="text-orange-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Prim hesaplamalarını yönetin, aylık dönemleri karşılaştırın ve her personel için PDF raporu oluşturun.
            </p>

            <div className="space-y-4">
              <InfoCard title="Adım Adım Kullanım" accent="orange">
                <div className="space-y-4">
                  <StepItem num={1} title="Mod Seçimi" desc="'Prim Hesaplama' yeni hesaplama yapar; 'Kayıtlı Raporlar' geçmiş dönemleri gösterir." />
                  <StepItem num={2} title="Periyot ve Tarih Aralığı" desc="Hesaplama modunda periyot tipi (günlük/haftalık/aylık), başlangıç ve bitiş tarihi seçin." />
                  <StepItem num={3} title="Hesapla" desc="Hesapla butonuna tıklayın. Sonuçlar önizleme olarak görüntülenir — henüz kaydedilmez." />
                  <StepItem num={4} title="Kaydet" desc="Önizlemeyi onayladıktan sonra Kaydet butonuyla veritabanına kaydedin." />
                  <StepItem num={5} title="Ay Kartı Seçimi" desc="Aylara göre gruplandırılmış kartlardan istediğiniz dönemi seçin." />
                  <StepItem num={6} title="Personel Detayı" desc="Tabloda personelin satırındaki Detay butonuna tıklayın — tüm metrikler ve uygulanan kurallar görünür." />
                  <StepItem num={7} title="PDF İndirme" desc="Popup içinde PDF Olarak İndir butonuna basın. Dosya otomatik isimlendirilip bilgisayarınıza indirilir." />
                </div>
              </InfoCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard title="PDF İçeriği" accent="slate">
                  <div className="space-y-1.5 text-sm">
                    {['Personel adı ve dönem bilgileri', '8 adet performans metriği kartı', 'Uygulanan tüm prim kuralları ve tutarları', 'A4 boyutunda yüksek çözünürlüklü çıktı', 'Çok sayfalı destek'].map(item => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-600 dark:text-slate-300">{item}</span>
                      </div>
                    ))}
                  </div>
                </InfoCard>

                <InfoCard title="Önemli Notlar" accent="amber">
                  <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                    <p>Hesapla ile yapılan önizlemeler geçicidir, Kaydet ile kalıcı hale gelir.</p>
                    <p>Aynı dönem için birden fazla hesaplama yapılabilir; raporlarda en son kayıt gösterilir.</p>
                    <p>Personel hiçbir kuralı karşılamıyorsa prim 0 TL olabilir.</p>
                  </div>
                </InfoCard>
              </div>
            </div>
          </section>

          {/* ── YÖNETİCİ KOÇLUK MERKEZİ ── */}
          <section className="glass-effect rounded-xl p-6 border border-teal-500/20">
            <SectionHeader id="coaching" icon={GraduationCap} title="Yönetici Koçluk Merkezi" color="text-teal-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Sistemin en güçlü özelliklerinden biridir. Her personel için gerçek chat kanıtlarına dayalı
              yönetici–personel görüşme senaryosu otomatik oluşturulur. Yöneticinin yalnızca senaryoyu
              okuyarak görüşmeyi yürütmesi yeterlidir.
            </p>

            <div className="space-y-4">
              <InfoCard title="Sistem Nasıl Çalışır?" accent="teal">
                <div className="space-y-4">
                  <StepItem num={1} title="Veri Toplama" desc="Seçilen zaman aralığındaki tüm chatler analiz edilir. AI skorları, tespit edilen sorunlar ve chat kanıtları toplanır." />
                  <StepItem num={2} title="Sorun Tespiti" desc="Kritik hatalar (skor < 60) ve geliştirme alanları (60–75) ayrı kategorilere ayrılır. Her sorun için en az iki chat kanıtı listelenir." />
                  <StepItem num={3} title="Aksiyon Planı" desc="Tespit edilen sorunlara göre somut, uygulanabilir aksiyon maddeleri oluşturulur." />
                  <StepItem num={4} title="Senaryo Üretimi" desc="Yönetici (Y:) ve personel (P:) diyaloğu olarak yapılandırılmış, chat ID ve AI özeti içeren tam görüşme senaryosu yazılır." />
                </div>
              </InfoCard>

              <InfoCard title="Görüşme Senaryosu Formatı" accent="slate">
                <div className="space-y-3 text-sm">
                  <p className="text-slate-500 dark:text-slate-400">Senaryo sekmesi açıldığında aşağıdaki bölümleri içeren hazır diyalog metni görünür:</p>
                  <div className="rounded-lg bg-slate-900/80 border border-slate-700/40 p-4 font-mono text-xs space-y-2">
                    <p className="text-slate-500">── BÖLÜM 0: GİRİŞ ──</p>
                    <p className="text-teal-300">Y: "Ali, bugün seninle 7 günlük performansı değerlendirmek istiyorum..."</p>
                    <p className="text-slate-500 dark:text-slate-400">P: [Dinliyor, kabul eder ya da merakla sorar]</p>
                    <p className="text-slate-500 mt-2">── BÖLÜM 1: KRİTİK HATALAR ──</p>
                    <p className="text-teal-300">Y: "14 Şubat tarihli müşteri [Ad] ile Chat #AB1234'e baktım..."</p>
                    <p className="text-teal-300">   Sistem analizi: '...' Bu durumu nasıl değerlendiriyorsun?"</p>
                    <p className="text-slate-500 dark:text-slate-400">P: [Açıklama yapar / kabul eder / savunma yapar]</p>
                    <p className="text-slate-500 mt-2">── BÖLÜM 2: GELİŞTİRME ALANLARI ──</p>
                    <p className="text-slate-500 mt-2">── BÖLÜM 3: AKSİYON MUTABAKATI ──</p>
                    <p className="text-slate-500 mt-2">── İMZALAR ──</p>
                  </div>
                </div>
              </InfoCard>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoCard title="Kanıtlı Sorunlar Sekmesi" accent="red">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Her sorun için chat ID, tarih, müşteri adı, skor ve AI analizi bir arada gösterilir. Görüşmede somut delil olarak kullanılır.</p>
                </InfoCard>
                <InfoCard title="Aksiyon Planı Sekmesi" accent="cyan">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Personelin yapması gereken somut adımlar listelenir. Görüşmede mutabık kalınan maddeler için tablo oluşturulur.</p>
                </InfoCard>
                <InfoCard title="Aciliyet Sınıflandırması" accent="amber">
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2"><Badge label="Yüksek" color="red" /><span className="text-slate-500 dark:text-slate-400">Ort. skor &lt; 70</span></div>
                    <div className="flex items-center gap-2"><Badge label="Orta" color="amber" /><span className="text-slate-500 dark:text-slate-400">Skor 70–82</span></div>
                    <div className="flex items-center gap-2"><Badge label="Düşük" color="green" /><span className="text-slate-500 dark:text-slate-400">Skor &gt; 82</span></div>
                  </div>
                </InfoCard>
              </div>

              <InfoCard title="Görüşme Sonrası Takip" accent="teal">
                <div className="space-y-2 text-sm">
                  <p className="text-slate-500 dark:text-slate-400">Senaryoyu kopyalayın ve görüşmeyi yürütün. Görüşme tamamlandığında:</p>
                  <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" /><span className="text-slate-600 dark:text-slate-300">Geri Bildirim Gönderildi butonuna basın — görüşme tarihi kayıt altına alınır</span></div>
                  <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" /><span className="text-slate-600 dark:text-slate-300">Raporlar sayfasındaki Koçluk Etki Raporu ile görüşme öncesi ve sonrası skor değişimi takip edilir</span></div>
                  <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" /><span className="text-slate-600 dark:text-slate-300">3 gün içinde takip görüşmesi planlamak için hatırlatıcı not ekleyin</span></div>
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── AI ANALİZ KRİTERLERİ ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="ai-criteria" icon={Brain} title="AI Analiz Kriterleri" color="text-blue-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Claude AI her chati aşağıdaki dört ana başlık üzerinden değerlendirir ve 0–100 puan verir.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {[
                { num: '1', title: 'Dil ve Üslup Uyumu',   color: 'border-blue-500', items: ['Profesyonel ve kibar dil kullanımı', 'Yasaklı kelime kontrolü', 'Kopyala-yapıştır şablonu tespiti', 'Müşteriye saygılı hitap'] },
                { num: '2', title: 'Chat Kalitesi',         color: 'border-emerald-500', items: ['Soruya gerçek cevap verildi mi?', 'Oyalama veya geçiştirme var mı?', 'Gereksiz uzatma veya erken kapanış', 'Müşteri memnuniyeti sonucu'] },
                { num: '3', title: 'Performans Metrikleri', color: 'border-amber-500', items: ['İlk yanıt kalitesi ve hızı', 'Çözüm odaklı yaklaşım', 'İletişim etkinliği', 'Müşteri yönlendirme becerisi'] },
                { num: '4', title: 'Sorun Tespiti',         color: 'border-red-500', items: ['Kritik hatalar (büyük puan kesintisi)', 'Geliştirme alanları (küçük puan kesintisi)', 'Eksik veya hatalı bilgi verme', 'Yönlendirme hataları'] },
              ].map(c => (
                <div key={c.num} className={`p-4 rounded-xl border-l-4 bg-slate-100 dark:bg-slate-800/50 border ${c.color} border-slate-700/40`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-900 dark:text-white`}>{c.num}</span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</h3>
                  </div>
                  <ul className="space-y-1">
                    {c.items.map(item => (
                      <li key={item} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <ChevronRight className="w-3 h-3 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <InfoCard title="Puan Yorumlama Rehberi" accent="slate">
              <div className="space-y-2">
                {[
                  { range: '90–100', label: 'Mükemmel',   color: 'text-emerald-400', desc: 'Üstün kalite, örnek alınacak seviye' },
                  { range: '80–89',  label: 'İyi',        color: 'text-blue-400',    desc: 'Hedef performans, küçük geliştirmeler yapılabilir' },
                  { range: '65–79',  label: 'Orta',       color: 'text-amber-400',   desc: 'Geliştirilmesi gereken belirgin alanlar var' },
                  { range: '50–64',  label: 'Düşük',      color: 'text-orange-400',  desc: 'Önemli eksiklikler, koçluk görüşmesi önerilir' },
                  { range: '0–49',   label: 'Kritik',     color: 'text-red-400',     desc: 'Ciddi sorunlar, acil müdahale ve izleme gerekli' },
                ].map(p => (
                  <div key={p.range} className="flex items-center gap-3 py-1.5 border-b border-slate-700/30 last:border-0">
                    <code className={`text-sm font-mono font-bold ${p.color} w-16`}>{p.range}</code>
                    <span className="text-slate-900 dark:text-white text-sm w-20">{p.label}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-sm">{p.desc}</span>
                  </div>
                ))}
              </div>
            </InfoCard>
          </section>

          {/* ── GERİ ARAMA KUYRUĞU ── */}
          <section className="glass-effect rounded-xl p-6 border border-cyan-500/20">
            <SectionHeader id="callback-queue" icon={PhoneCall} title="Geri Arama Kuyruğu" color="text-cyan-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Chatlerden otomatik tespit edilen veya manuel oluşturulan geri arama taleplerini yönetir.
              Operatörlerin arama süreçlerini takip etmesini, not bırakmasını ve yöneticilerin ekip
              aktivitesini anlık izlemesini sağlar.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: PhoneIncoming, color: 'text-cyan-400',   title: 'Talep Kuyruğu',    desc: 'Bekleyen ve işlenen geri arama taleplerinin listesi. Durum güncelleme, atama ve arama notu girişi buradan yapılır.' },
                  { icon: Activity,      color: 'text-emerald-400', title: 'Ekip Aktivitesi',  desc: 'Son 24 saatte yapılan tüm arama girişlerinin kronolojik akışı — arama sonucu, süre ve notlarla birlikte.' },
                  { icon: Settings,      color: 'text-slate-500 dark:text-slate-400',   title: 'Ayarlar',          desc: 'Kategori bazlı anahtar kelimeler, öncelik seviyeleri ve özel Telegram bot/kanal yapılandırması.' },
                ].map(t => (
                  <div key={t.title} className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-700/40">
                    <t.icon className={`w-5 h-5 ${t.color} mb-3`} />
                    <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{t.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.desc}</p>
                  </div>
                ))}
              </div>

              <InfoCard title="Otomatik Tespit Sistemi" accent="cyan">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  Sistem, gelen chatler analiz edilirken müşterinin telefon numarası paylaştığı veya geri arama talep ettiği durumları otomatik tespit eder.
                </p>
                <div className="space-y-2">
                  {[
                    { icon: Tag,          color: 'text-cyan-400',   label: 'Kategori Eşleştirme', desc: 'Şikayet, teknik destek, satış gibi kategorilere göre otomatik sınıflandırma' },
                    { icon: Bell,         color: 'text-amber-400',  label: 'Telegram Bildirimi',  desc: 'Yeni tespit edilen talep için ayrı callback Telegram kanalına anlık bildirim' },
                    { icon: AlertTriangle,color: 'text-red-400',    label: 'Öncelik Skoru',       desc: 'Aciliyet seviyesine göre (Düşük / Orta / Yüksek / Kritik) otomatik sıralama' },
                  ].map(i => (
                    <div key={i.label} className="flex items-center gap-3 text-sm">
                      <i.icon className={`w-4 h-4 shrink-0 ${i.color}`} />
                      <span className="text-slate-900 dark:text-white font-medium w-40">{i.label}</span>
                      <span className="text-slate-500 dark:text-slate-400">{i.desc}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Talep Durumları" accent="slate">
                <div className="space-y-2">
                  {[
                    { label: 'Bekliyor',          color: 'amber',   desc: 'Henüz kimseye atanmamış, aranmayı bekleyen talep' },
                    { label: 'İşleniyor',          color: 'blue',    desc: 'Bir operatör tarafından üstlenilmiş, arama süreci devam ediyor' },
                    { label: 'Geri Arama',         color: 'cyan',    desc: 'Müşteri meşgul / yanıt vermedi, yeniden aranacak' },
                    { label: 'Randevu Alındı',     color: 'teal',    desc: 'Belirli bir saat için randevu oluşturuldu' },
                    { label: 'Çözüldü',            color: 'green',   desc: 'Talep başarıyla tamamlandı ve kapatıldı' },
                    { label: 'İptal',              color: 'red',     desc: 'Talep geçersiz veya kullanıcı tarafından iptal edildi' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-3 py-1.5 border-b border-slate-700/30 last:border-0">
                      <Badge label={s.label} color={s.color} />
                      <span className="text-slate-500 dark:text-slate-400 text-sm">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Arama Akışı" accent="slate">
                <div className="space-y-3">
                  <StepItem num={1} title="Talebi Üstlen" desc="Kuyruktan bir talep seçin, Üstlen butonuyla atayın. Durum otomatik 'İşleniyor'a geçer." />
                  <StepItem num={2} title="Aramayı Gerçekleştir" desc="Müşteriyi arayın. Arama sırasında veya sonrasında arama sonucunu (Cevap Verdi / Meşgul / Yanıt Yok) seçin." />
                  <StepItem num={3} title="Not Ekle" desc="Görüşme detaylarını, müşterinin talebini ve alınan aksiyonu not alanına girin." />
                  <StepItem num={4} title="Durumu Güncelle" desc="Talep çözüldüyse Çözüldü, yeniden aranması gerekiyorsa Geri Arama durumuna alın." />
                  <StepItem num={5} title="Ekip Aktivitesi" desc="Yöneticiler Ekip Aktivitesi sekmesinden tüm operatörlerin arama kayıtlarını gerçek zamanlı takip eder." />
                </div>
              </InfoCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard title="Kategori Ayarları" accent="cyan">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Ayarlar sekmesinden her kategori için tespit anahtar kelimeleri düzenlenebilir. Örneğin "teknik destek" kategorisine "arıza, bağlanamıyorum, çalışmıyor" gibi kelimeler eklenerek otomatik eşleştirme hassasiyeti artırılır.</p>
                </InfoCard>
                <InfoCard title="Callback Telegram Yapılandırması" accent="slate">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Geri arama bildirimleri için ana sistem Telegram ayarlarından bağımsız, ayrı bir bot token ve kanal ID kullanılabilir. Bu sayede bildirimler farklı bir kanala yönlendirilebilir.</p>
                </InfoCard>
              </div>
            </div>
          </section>

          {/* ── KULLANICI YÖNETİMİ ── */}
          <section className="glass-effect rounded-xl p-6 border border-rose-500/20">
            <SectionHeader id="user-management" icon={UserCog} title="Kullanıcı Yönetimi" color="text-rose-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Sisteme erişim yetkisi verilecek kullanıcılar bu sayfadan oluşturulur ve yönetilir.
              Her kullanıcıya bir rol atanır; ek olarak kişisel yetki geçersiz kılmaları (override) tanımlanabilir.
              Yalnızca <Badge label="admin.users.view" color="red" /> iznine sahip kullanıcılar bu sayfaya erişebilir.
            </p>

            <div className="space-y-4">
              <InfoCard title="Yeni Kullanıcı Oluşturma" accent="rose">
                <div className="space-y-3">
                  <StepItem num={1} title="Kullanıcı Oluştur Butonuna Tıklayın" desc="Sağ üstteki butona basın. Açılan formda gerekli alanları doldurun." />
                  <StepItem num={2} title="Bilgileri Girin" desc="Ad Soyad, kullanıcı adı ve güçlü bir şifre girilir. Rol atanır. E-posta adresi sisteme gerek yoktur — kullanıcı adından otomatik oluşturulur." />
                  <StepItem num={3} title="Oluştur" desc="Sistem Supabase Auth üzerinden kullanıcıyı oluşturur ve profil kaydını otomatik açar." />
                  <StepItem num={4} title="Giriş Bilgileri" desc="Kullanıcı sisteme girerken e-posta değil, belirlenen kullanıcı adı ile giriş yapar. Şifre oluşturulurken seçilen şifredir." />
                </div>
              </InfoCard>

              <InfoCard title="Kullanıcı Düzenleme ve Yetki Override" accent="slate">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  Tablodaki kullanıcı satırına tıklayarak sağ panelde düzenleme yapılabilir:
                </p>
                <div className="space-y-2">
                  {[
                    'Rol değiştirme — kullanıcıya farklı bir temel rol atanır',
                    'Kişisel yetki override — belirli izinleri rolden bağımsız olarak aç veya kapat',
                    'Aktif/pasif durumu — devre dışı bırakılan kullanıcılar sisteme giremez',
                  ].map(item => (
                    <div key={item} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span className="text-slate-600 dark:text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Önemli Notlar" accent="amber">
                <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                  <p>Kurucu (Founder) hesabının rolü değiştirilemez ve silinemez.</p>
                  <p>Yetki override, kullanıcının rolünden gelen izinleri geçersiz kılar — bu sayede tek bir kullanıcıya ince ayar yapılabilir.</p>
                  <p>Şifre değişikliği yalnızca kullanıcının kendi profilinden yapılabilir; yönetici şifre sıfırlayamaz.</p>
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── ROL YÖNETİMİ ── */}
          <section className="glass-effect rounded-xl p-6 border border-rose-500/20">
            <SectionHeader id="role-management" icon={Shield} title="Roller & Yetkiler" color="text-rose-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Sistemdeki tüm erişim kontrolleri rol tabanlı çalışır. Her rol, belirli modüllere ait izinlerin
              bir kümesidir. Bu sayfada rol oluşturabilir, düzenleyebilir ve modül bazlı izinleri yönetebilirsiniz.
              Yalnızca <Badge label="admin.roles.view" color="red" /> iznine sahip kullanıcılar erişebilir.
            </p>

            <div className="space-y-4">
              <InfoCard title="İzin Modülleri" accent="rose">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {[
                    { mod: 'dashboard',        label: 'Dashboard',           desc: 'Ana sayfa görüntüleme' },
                    { mod: 'chats',            label: 'Chat',                desc: 'Chat listesi ve analiz detayları' },
                    { mod: 'personnel',        label: 'Personel',            desc: 'Personel analizi ve istatistikleri' },
                    { mod: 'reports',          label: 'Raporlar',            desc: 'Koçluk önerileri ve trend raporları' },
                    { mod: 'monitoring',       label: 'Canlı İzleme',        desc: 'Manuel senkronizasyon ve sistem durumu' },
                    { mod: 'bonus',            label: 'Prim',                desc: 'Prim ayarları ve raporları' },
                    { mod: 'coaching',         label: 'Koçluk Merkezi',      desc: 'Görüşme senaryoları ve aksiyon planları' },
                    { mod: 'settings',         label: 'Ayarlar',             desc: 'API anahtarları ve sistem yapılandırması' },
                    { mod: 'callcenter',       label: 'Geri Arama Kuyruğu',  desc: 'Callback talep yönetimi ve arama kaydı' },
                    { mod: 'admin',            label: 'Yönetim',             desc: 'Kullanıcı ve rol yönetimi (yüksek yetki)' },
                  ].map(m => (
                    <div key={m.mod} className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-700/40">
                      <code className="text-xs text-rose-400 font-mono">{m.mod}.*</code>
                      <p className="text-slate-900 dark:text-white text-sm font-medium mt-1">{m.label}</p>
                      <p className="text-slate-500 text-xs">{m.desc}</p>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Rol Oluşturma / Düzenleme" accent="slate">
                <div className="space-y-3">
                  <StepItem num={1} title="Yeni Rol Oluştur" desc="Sağ üstteki butona basın. Rol adı, açıklama ve renk seçin." />
                  <StepItem num={2} title="İzinleri Seçin" desc="Modül bazlı izin listesinden bu role tanınan erişimleri işaretleyin. Her modülün alt izinleri ayrı ayrı açılabilir." />
                  <StepItem num={3} title="Kaydet" desc="Kaydet ile rol oluşturulur. Artık Kullanıcı Yönetimi sayfasında bu rol kullanıcılara atanabilir." />
                </div>
              </InfoCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoCard title="Varsayılan Roller" accent="slate">
                  <div className="space-y-2 text-sm">
                    {[
                      { name: 'Super Admin',  desc: 'Tüm modüllere tam erişim, silinemeyen temel rol' },
                      { name: 'Admin',        desc: 'Yönetim hariç tüm modüllere tam erişim' },
                      { name: 'Supervisor',   desc: 'İzleme, raporlar ve koçluk görüntüleme' },
                      { name: 'Agent',        desc: 'Yalnızca geri arama kuyruğuna erişim' },
                    ].map(r => (
                      <div key={r.name} className="flex items-start gap-2 py-1.5 border-b border-slate-700/30 last:border-0">
                        <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-900 dark:text-white font-medium">{r.name}</span>
                          <p className="text-slate-500 text-xs">{r.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </InfoCard>
                <InfoCard title="Güvenlik Notları" accent="red">
                  <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                    <p>Sistem roller veritabanı RLS politikaları ile korunur — rol kaldırılsa bile veri silme riski yoktur.</p>
                    <p>Bir role bağlı kullanıcılar mevcutsa rol silinemez; önce kullanıcıların rolü değiştirilmelidir.</p>
                    <p>Super Admin rolü silinemez ve izinleri değiştirilemez.</p>
                  </div>
                </InfoCard>
              </div>
            </div>
          </section>

          {/* ── AYARLAR ── */}
          <section className="glass-effect rounded-xl p-6 border border-slate-700/40">
            <SectionHeader id="settings" icon={Settings} title="Ayarlar" color="text-slate-500 dark:text-slate-400" />
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              Sistemin çalışması için gerekli API anahtarları ve yapılandırma parametreleri bu sayfadan yönetilir.
            </p>

            <div className="space-y-4">
              <InfoCard title="Gerekli API Anahtarları" accent="red">
                <div className="space-y-3">
                  {[
                    { key: 'Claude API Key',       required: true,  desc: 'Chat analizleri için zorunludur. Anthropic hesabından edinilir.' },
                    { key: 'LiveChat API Key',      required: true,  desc: 'Chat senkronizasyonu için zorunludur. LiveChat yönetim panelinden alınır.' },
                    { key: 'Telegram Bot Token',   required: false, desc: 'Uyarı bildirimleri için opsiyoneldir. BotFather üzerinden oluşturulur.' },
                    { key: 'Telegram Chat ID',     required: false, desc: 'Bildirimlerin gönderileceği Telegram grup veya kanal ID\'si.' },
                  ].map(a => (
                    <div key={a.key} className="flex items-start gap-3 py-2.5 border-b border-slate-700/40 last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{a.key}</span>
                          <Badge label={a.required ? 'Zorunlu' : 'Opsiyonel'} color={a.required ? 'red' : 'slate'} />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{a.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </InfoCard>

              <InfoCard title="Yapılandırma Parametreleri" accent="slate">
                <div className="space-y-0.5">
                  <MetricRow label="Skor Uyarı Eşiği"    desc="Bu değerin altındaki chatler uyarı alır (varsayılan: 50)" />
                  <MetricRow label="Uyarı Sayısı Eşiği"  desc="Kaç uyarıdan sonra personel kırmızı işaret alır" />
                  <MetricRow label="Zaman Dilimi"         desc="Tüm istatistikler bu zaman dilimine göre hesaplanır (varsayılan: Avrupa/İstanbul)" />
                  <MetricRow label="Analiz Dili"          desc="AI analizinin yapıldığı dil (varsayılan: Türkçe)" />
                </div>
              </InfoCard>

              <InfoCard title="Kullanıcı Yönetimi" accent="slate">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Sisteme kullanıcı eklemek için sol menüdeki <strong className="text-slate-900 dark:text-white">Kullanıcı Yönetimi</strong> sayfasını kullanın. Kullanıcı adı ve şifre ile oluşturulur; e-posta girilmez.</p>
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-slate-500 dark:text-slate-400">Tüm ayarlar şifrelenmiş olarak veritabanında saklanır. Yetkisiz erişim RLS politikaları ile engellenir.</span>
                </div>
              </InfoCard>
            </div>
          </section>

          {/* ── ALT BANNER ── */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-slate-900 dark:text-white font-semibold mb-1">Yardıma mı İhtiyacınız Var?</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Kılavuzda bulamadığınız bir konu veya teknik sorun için sistem yöneticinizle iletişime geçin.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="p-2 rounded-lg bg-slate-700/60 border border-slate-600/50">
                <Hash className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Versiyon</p>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">5.0 — Geri Arama & RBAC</p>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
