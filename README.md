# LiveChat QA — Kalite Kontrol ve Analiz Sistemi

Canlı destek operasyonları için yapay zeka destekli, tam otomatik kalite kontrol ve performans izleme platformu. LiveChat verilerini otomatik senkronize eder, her konuşmayı Claude AI ile analiz eder, personel performansını takip eder, koçluk önerileri üretir, prim hesaplar ve kalite sorunları için Telegram bildirimleri gönderir.

---

## İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Özellikler](#özellikler)
3. [Teknoloji Yığını](#teknoloji-yığını)
4. [Mimari](#mimari)
5. [Ortam Değişkenleri](#ortam-değişkenleri)
6. [Veritabanı Şeması](#veritabanı-şeması)
7. [Edge Functions](#edge-functions)
8. [Sayfalar ve Özellikler](#sayfalar-ve-özellikler)
9. [Bileşenler](#bileşenler)
10. [Kütüphaneler](#kütüphaneler)
11. [Otomatik Zamanlama](#otomatik-zamanlama)
12. [AI Analiz Kriterleri](#ai-analiz-kriterleri)
13. [Şikayet Kategorileri](#şikayet-kategorileri)
14. [Skorlama Sistemi](#skorlama-sistemi)
15. [Güvenilirlik Seviyeleri](#güvenilirlik-seviyeleri)
16. [Hata Giderme](#hata-giderme)

---

## Genel Bakış

Bu sistem, bir canlı destek ekibinin tüm chat kalite sürecini baştan sona yönetir:

```
LiveChat API
    │
    ▼ (Her 2 dakikada bir otomatik, akıllı artımlı senkronizasyon)
Supabase PostgreSQL
    │
    ├─► chat_messages   (tüm mesajlar)
    ├─► chats           (chat kayıtları)
    └─► chat_analysis   (Claude AI analiz sonuçları)
            │
            ├─► alerts              (Telegram bildirimleri)
            ├─► personnel_daily_stats (günlük istatistikler)
            ├─► coaching_feedbacks  (koçluk takibi)
            └─► bonus_records       (prim kayıtları)
```

Tüm veriler Supabase'de tutulur ve React + TypeScript tabanlı yönetim panelinden izlenir.

---

## Özellikler

### Otomatik Senkronizasyon
- Her 2 dakikada bir LiveChat API'den yeni chatler çekilir
- Akıllı artımlı senkronizasyon: sadece son senkronizasyondan bu yana gelen yeni chatler çekilir, gereksiz veri aktarımı yapılmaz
- Eşzamanlı çalışmayı engelleyen iş (job) tabanlı işlem yönetimi
- 10 dakikadan uzun süren işlerde otomatik temizlik mekanizması
- Manuel senkronizasyon: bugün, bu hafta, son 10 gün, bu ay, son 90 gün, özel tarih aralığı seçenekleri

### AI Destekli Analiz
- Claude (Anthropic) ile her chat otomatik olarak analiz edilir
- Her analiz için 0–100 arası genel puan üretilir
- Dil uyumu, kalite metrikleri, performans göstergeleri ve tespit edilen sorunlar ayrı ayrı değerlendirilir
- Her chat için Türkçe AI özeti ve koçluk önerisi üretilir

### Gerçek Zamanlı Bildirimler
- Puan < 50 veya duygu durumu olumsuz olan chatlerde otomatik Telegram bildirimi
- Bot token ve chat ID ayarlar sayfasından yapılandırılır
- Gönderilmeyen bekleyen bildirimler manuel olarak da tetiklenebilir

### Performans İzleme
- Her personel için günlük istatistikler hesaplanır (toplam chat, ortalama puan, uyarı sayısı, yanıt ve çözüm süreleri)
- Güçlü ve gelişmesi gereken konular otomatik tespit edilir
- Güvenilirlik seviyeleri (A, B, C, D) istatistiksel analiz yöntemiyle belirlenir
- Son 30 günün trend grafiği her personel için ayrı gösterilir

### Koçluk Sistemi
- Olumsuz chatlere göre Türkçe koçluk önerileri üretilir
- Yönetici koçluk merkezi: somut chat kanıtlarına dayalı, bölümlendirilmiş koçluk senaryoları
- Koçluk öncesi ve sonrası 30 günlük performans karşılaştırması
- Koçluk gönderim takibi: kime, ne zaman, hangi öneri gönderildi

### Prim Sistemi
- Toplam chat sayısı, ortalama puan, müşteri memnuniyeti, yanıt süresi gibi metriklere dayalı kural tanımlama
- Günlük, haftalık veya aylık prim/ceza hesaplama
- Önizleme (kaydetmeden hesapla) ve kayıtlı raporlar modları
- Her personel için detaylı prim dökümü ve PDF çıktısı

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Stil | Tailwind CSS, özel dark theme |
| İkonlar | Lucide React |
| PDF | html2canvas + jsPDF |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Runtime | Deno (Edge Functions) |
| AI | Claude (Anthropic) API |
| Veri Kaynağı | LiveChat API |
| Bildirim | Telegram Bot API |
| Zamanlama | PostgreSQL pg_cron + pg_net |

---

## Mimari

```
src/
├── App.tsx                  # Uygulama kökü, kimlik doğrulama akışı, navigasyon
├── main.tsx                 # Giriş noktası
├── index.css                # Global stiller, dark theme değişkenleri
│
├── pages/
│   ├── LoginPage.tsx        # Email/şifre girişi
│   ├── Dashboard.tsx        # Ana panel, tüm metrikler
│   ├── ChatList.tsx         # Tüm chat kayıtları ve filtreleme
│   ├── ChatAnalysisList.tsx # AI analizli chatler
│   ├── PersonnelAnalytics.tsx # Personel performans detayları
│   ├── Reports.tsx          # Trend analizi, koçluk, gelişim takibi
│   ├── Monitoring.tsx       # Canlı izleme ve manuel operasyonlar
│   ├── BonusSettings.tsx    # Prim kural yönetimi
│   ├── BonusReports.tsx     # Prim hesaplama ve raporlar
│   ├── CoachingCenter.tsx   # Yönetici koçluk merkezi
│   ├── SettingsPage.tsx     # API anahtarları ve sistem ayarları
│   └── UserGuide.tsx        # Kapsamlı kullanım kılavuzu
│
├── components/
│   ├── BarChart.tsx         # Çubuk grafik
│   ├── DonutChart.tsx       # Halka/pasta grafik
│   ├── HeatMap.tsx          # Saat dağılım haritası
│   ├── Leaderboard.tsx      # Personel sıralama ve detay popup'ı
│   ├── Modal.tsx            # Genel amaçlı modal
│   ├── SentimentChatsModal.tsx # Duygu bazlı chat listesi
│   ├── Toast.tsx            # Bildirim toast'ları
│   ├── Tooltip.tsx          # Araç ipucu
│   └── TrendChart.tsx       # Çizgi trend grafiği
│
├── lib/
│   ├── supabase.ts          # Supabase singleton istemcisi
│   ├── auth.tsx             # Kimlik doğrulama hook'u
│   ├── backgroundSync.ts    # Arka plan senkronizasyon hook'u
│   ├── notifications.tsx    # Toast bildirim sistemi
│   ├── utils.ts             # İstanbul zaman dilimi yardımcıları
│   └── complaintCategories.ts # Şikayet kategorilendirme mantığı
│
└── types/
    └── index.ts             # TypeScript tip tanımları

supabase/
├── migrations/              # 43 veritabanı migration dosyası
└── functions/
    ├── sync-livechat/       # LiveChat senkronizasyonu
    ├── analyze-chat/        # Claude AI chat analizi
    ├── get-coaching/        # Koçluk önerisi üretimi
    ├── calculate-bonuses/   # Prim hesaplama
    ├── send-telegram-alerts/ # Telegram bildirimleri
    ├── update-settings/     # Ayarlar güncelleme
    ├── create-user/         # Kullanıcı oluşturma
    └── telegram-webhook/    # Telegram webhook alıcısı
```

---

## Ortam Değişkenleri

`.env` dosyasında aşağıdaki iki değişken bulunmalıdır:

```env
VITE_SUPABASE_URL=https://<proje-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anonim-anahtar>
```

Aşağıdaki değerler sistem çalışırken **Ayarlar sayfasından** veritabanına kaydedilir (`.env`'ye yazılmaz):

| Ayar | Açıklama |
|---|---|
| Claude API Key | Anthropic Claude API anahtarı (AI analizi için) |
| LiveChat API Key | LiveChat REST API anahtarı (chat verisi için) |
| Telegram Bot Token | Telegram bot token'ı (bildirimler için) |
| Telegram Chat ID | Bildirimlerin gönderileceği Telegram grup/kanal ID'si |
| Polling Interval | Senkronizasyon sıklığı (saniye cinsinden) |

---

## Veritabanı Şeması

### `settings`
Sistem yapılandırma tablosu. Tek bir kayıt tutulur.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| chatgpt_api_key | text | Claude API anahtarı |
| livechat_api_key | text | LiveChat API anahtarı |
| telegram_bot_token | text | Telegram bot token'ı |
| telegram_chat_id | text | Telegram hedef ID |
| polling_interval | integer | Senkronizasyon aralığı (saniye) |
| created_at / updated_at | timestamptz | Zaman damgaları |

---

### `personnel`
Personel bilgileri ve hesaplanmış istatistikler.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| name | text UNIQUE | Personel adı (LiveChat agent adıyla eşleşir) |
| email | text | Personel e-posta adresi |
| total_chats | integer | Toplam chat sayısı |
| average_score | numeric | Ortalama AI analiz puanı |
| warning_count | integer | Uyarı sayısı (puan < 60 olan chatler) |
| strong_topics | jsonb | Güçlü konu listesi |
| weak_topics | jsonb | Gelişmesi gereken konu listesi |
| reliability_tier | text | Güvenilirlik seviyesi: A, B, C veya D |
| confidence_level | numeric | İstatistiksel güven skoru |
| created_at / updated_at | timestamptz | Zaman damgaları |

---

### `chats`
LiveChat API'den senkronize edilen tüm chat kayıtları.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | text | Birincil anahtar (LiveChat chat ID) |
| chat_id | text | LiveChat konuşma thread ID |
| agent_name | text | Sorumlu temsilci adı |
| customer_name | text | Müşteri adı |
| created_at / ended_at | timestamptz | Başlangıç ve bitiş zamanları |
| duration_seconds | integer | Chat süresi (saniye) |
| first_response_time | integer | İlk yanıt süresi (saniye) |
| message_count | integer | Toplam mesaj sayısı |
| chat_data | jsonb | Ham LiveChat verisi |
| status | text | Chat durumu (archived, active, vb.) |
| analyzed | boolean | AI analizi yapıldı mı |
| rating_score | numeric | Müşteri memnuniyet puanı |
| rating_status | text | Beğendi / beğenmedi / yorum yok |
| rating_comment | text | Müşteri yorumu |
| has_rating_comment | boolean | Yorum var mı |
| complaint_flag | boolean | Şikayet içeriyor mu |
| synced_at | timestamptz | Son senkronizasyon zamanı |

---

### `chat_messages`
Chatlere ait bireysel mesajlar.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| chat_id | text | İlgili chat ID (chats tablosuna FK) |
| message_id | text | LiveChat mesaj ID'si |
| author_id | text | Yazar ID'si |
| author_type | text | Yazar tipi: agent, customer, supervisor |
| text | text | Mesaj metni |
| created_at | timestamptz | Mesaj zamanı |
| is_system | boolean | Sistem mesajı mı |

---

### `chat_analysis`
Claude AI analiz sonuçları.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| chat_id | text | İlgili chat (chats'e FK) |
| analysis_date | timestamptz | Analiz tarihi |
| overall_score | numeric | Genel kalite puanı (0–100) |
| language_compliance | jsonb | Dil ve üslup uyum detayları |
| quality_metrics | jsonb | Kalite metrik detayları |
| performance_metrics | jsonb | Performans metrik detayları |
| issues_detected | jsonb | Tespit edilen sorunlar listesi |
| positive_aspects | jsonb | Güçlü yönler listesi |
| recommendations | text | Geliştirme önerileri |
| sentiment | text | Duygu durumu: positive, neutral, negative |
| requires_attention | boolean | Dikkat gerektiriyor mu |
| ai_summary | text | Türkçe AI özeti |
| coaching_suggestion | text | Koçluk önerisi |

---

### `alerts`
Oluşturulan Telegram bildirimleri.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| chat_id | text | İlgili chat |
| analysis_id | uuid | İlgili analiz |
| alert_type | text | Bildirim tipi |
| severity | text | Önem derecesi |
| message | text | Bildirim mesajı |
| sent_to_telegram | boolean | Telegram'a gönderildi mi |
| telegram_message_id | text | Telegram mesaj ID'si |
| created_at | timestamptz | Oluşturma zamanı |

---

### `personnel_daily_stats`
Her personel için günlük hesaplanmış istatistikler.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| personnel_name | text | Personel adı |
| date | date | İstatistik tarihi |
| total_chats | integer | O gün toplam chat sayısı |
| average_score | numeric | O gün ortalama AI puanı |
| total_issues | integer | Tespit edilen sorun sayısı |
| average_response_time | integer | Ortalama yanıt süresi |
| average_resolution_time | integer | Ortalama çözüm süresi |

`(personnel_name, date)` çiftine UNIQUE kısıt uygulanmıştır.

---

### `bonus_rules`
Prim ve ceza kural tanımları.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| rule_name | text | Kural adı |
| metric_type | text | Metrik türü: total_chats, avg_score, avg_satisfaction, avg_response_time, positive_chats, negative_chats, neutral_chats |
| condition_type | text | Koşul: greater_than, less_than, equals, between |
| threshold_min | numeric | Alt eşik (between için) |
| threshold_max | numeric | Üst eşik (between için) |
| bonus_amount | numeric | Prim/ceza miktarı (TL) |
| period_type | text | Dönem: daily, weekly, monthly |
| is_active | boolean | Kural aktif mi |
| created_at / updated_at | timestamptz | Zaman damgaları |

---

### `bonus_calculations`
Kaydedilmemiş (önizleme) prim hesaplamaları.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| personnel_id | uuid | Personel referansı |
| period_type | text | Hesaplama dönemi |
| period_start / period_end | timestamptz | Dönem başlangıç/bitiş |
| total_bonus_amount | numeric | Toplam prim/ceza |
| calculation_details | jsonb | Uygulanan kurallar ve tutarlar |
| metrics_snapshot | jsonb | Hesaplama anındaki metrikler |
| calculated_at | timestamptz | Hesaplama zamanı |

---

### `bonus_records`
Kalıcı olarak kaydedilmiş prim raporları. `bonus_calculations` ile aynı yapıya ek olarak `saved_at` alanı bulunur.

---

### `coaching_feedbacks`
Gönderilen koçluk geri bildirimlerinin takibi.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| chat_id | uuid | İlgili chat |
| agent_name | text | Personel adı |
| agent_email | text | Personel e-posta |
| coaching_suggestion | text | Gönderilen koçluk metni |
| sent_by | uuid | Gönderen kullanıcı (auth.uid) |
| sent_at | timestamptz | Gönderim zamanı |

---

### `sync_jobs`
Arka plan senkronizasyon işlerinin durum takibi.

| Sütun | Tip | Açıklama |
|---|---|---|
| id | uuid | Birincil anahtar |
| status | text | İş durumu: pending, processing, completed, failed |
| start_date / end_date | timestamptz | Senkronizasyon tarih aralığı |
| days | integer | Kaç günlük veri |
| started_at / completed_at | timestamptz | Başlangıç/bitiş zamanları |
| result | jsonb | İş sonuç verisi |
| error | text | Hata mesajı (varsa) |

---

### Veritabanı Fonksiyonları (RPC)

| Fonksiyon | Açıklama |
|---|---|
| `recalculate_personnel_stats()` | Tüm personel istatistiklerini yeniden hesaplar |
| `get_personnel_improvement_report(agent_email, days_before, days_after)` | Koçluk öncesi ve sonrası performans karşılaştırması döndürür |
| `get_average_score(agent_name, start_date, end_date)` | Belirli bir dönem için personel ortalama puanı hesaplar |

---

## Edge Functions

### `sync-livechat`
**Endpoint:** `POST /functions/v1/sync-livechat`

Sistemin ana veri toplama fonksiyonu. LiveChat API'den chat ve mesaj verilerini çeker, veritabanına kaydeder, yeni chatleri analiz eder ve Telegram bildirimleri oluşturur.

**Parametreler:**
- `?background=true` — Eşzamanlı olmayan mod; işi başlatır ve hemen iş ID'si döndürür
- `?days=7` — Kaç günlük geriye dönük veri çekileceği
- `?start_date=2025-01-01&end_date=2025-01-31` — Özel tarih aralığı

**Özellikler:**
- Exponential backoff ile yeniden deneme mekanizması
- Eşzamanlı işleri engelleyen kilitleme (çalışan iş varsa 409 döner)
- 10 dakikadan uzun süren sıkışmış işleri otomatik temizler
- Akıllı artımlı senkronizasyon: son `synced_at` değerinden sonrasını çeker

**Dönen değer:**
```json
{ "success": true, "synced": 45, "new_chats": 12, "analyzed": 8, "alerts_sent": 2, "timestamp": "..." }
```

---

### `analyze-chat`
**Endpoint:** `POST /functions/v1/analyze-chat`

Analiz edilmemiş chatleri bulur ve Claude API kullanarak her birini analiz eder. Analiz sonuçlarını `chat_analysis` tablosuna kaydeder, gerekirse uyarı oluşturur.

**Dönen değer:**
```json
{ "success": true, "analyzed": 15, "alerts_created": 3 }
```

---

### `get-coaching`
**Endpoint:** `POST /functions/v1/get-coaching`

Tek bir chat ve analiz verisi alarak Claude AI'dan Türkçe koçluk önerisi üretir. Öneriyi `chat_analysis.coaching_suggestion` alanına kaydeder.

**İstek gövdesi:**
```json
{
  "chatId": "abc123",
  "chatAnalysisId": "uuid",
  "messages": [{ "author": { "name": "..." }, "text": "..." }],
  "analysis": {
    "sentiment": "negative",
    "score": 42,
    "issues": ["Müşteri sorusu cevaplanmadı"],
    "summary": "..."
  }
}
```

**Dönen değer:**
```json
{ "suggestion": "...", "saved": true }
```

---

### `calculate-bonuses`
**Endpoint:** `POST /functions/v1/calculate-bonuses`

Aktif prim kurallarını alır, her personel için belirtilen dönemdeki metrikleri hesaplar, uygun kuralları uygular ve toplamları bulur.

**İstek gövdesi:**
```json
{
  "period_type": "monthly",
  "period_start": "2025-01-01T00:00:00.000Z",
  "period_end": "2025-01-31T23:59:59.999Z",
  "save_to_db": false
}
```

`save_to_db: false` → `bonus_calculations` (önizleme, üzerine yazılabilir)
`save_to_db: true` → `bonus_records` (kalıcı kayıt)

---

### `send-telegram-alerts`
**Endpoint:** `POST /functions/v1/send-telegram-alerts`

Veritabanındaki `sent_to_telegram = false` olan bekleyen uyarıları Telegram'a gönderir. Her gönderim sonrası `sent_to_telegram = true` ve `telegram_message_id` güncellenir.

---

### `update-settings`
**Endpoint:** `POST /functions/v1/update-settings`

`settings` tablosundaki sistem ayarlarını günceller. API anahtarları ve yapılandırma bu fonksiyon üzerinden kaydedilir.

---

### `create-user`
**Endpoint:** `POST /functions/v1/create-user`

Supabase Auth üzerinden yeni kullanıcı oluşturur. Servis rol anahtarı gerektirdiği için edge function olarak çalıştırılır.

---

### `telegram-webhook`
**Endpoint:** `POST /functions/v1/telegram-webhook`

Telegram botundan gelen webhook mesajlarını alır ve işler.

---

## Sayfalar ve Özellikler

### Dashboard
Ana panel. Tüm kritik metrikleri tek ekranda sunar.

**Metrik Kartları:**
- Unique Chat — LiveChat benzersiz konuşma sayısı
- Total Thread — Toplam thread sayısı
- Analiz Edilen — AI analizi yapılan chat sayısı
- Personel Sayısı — Aktif personel sayısı
- Bekleyen Uyarı — Gönderilmemiş Telegram bildirimi sayısı
- Ortalama Skor — Tüm analizlerin ortalama puanı
- Ort. Yanıt Süresi — İlk yanıt süresi ortalaması
- Toplam Beğeni / Beğenilmeyen — Müşteri memnuniyet sayıları
- Kaçan Chat — Cevaplanmadan kapanan chat sayısı

**Grafikler:**
- Duygu dağılımı (halka grafik): Pozitif / Nötr / Negatif oranları
- En İyi Performanslar: Son 30 günün en yüksek puanlı 5 personeli (tıklanabilir — detay popup)
- Gelişim Gereken Personel: Takım içinde görece en düşük puanlı 5 personel (tıklanabilir — detay popup)
- Personel Trend Grafiği: Her personel için son 30 günlük günlük puan sparkline
- Günlük Şikayet Trendi: Özelleştirilebilir tarih aralığında günlük olumsuz/nötr chat sayıları
- Şikayet Kategorileri: En sık görülen 10 şikayet konusu (çubuk grafik)
- Saatlik Chat Dağılımı: Son 30 günün saat bazlı heatmap'i
- Son Uyarılar: En son Telegram bildirimleri listesi

Her 30 saniyede otomatik yenileme.

---

### Tüm Chatler
LiveChat'ten senkronize edilen tüm chat kayıtlarını listeler ve filtreler.

**Filtreler:**
- Durum (archived, active, vb.)
- Personel
- Analiz edilmiş / edilmemiş
- Müşteri değerlendirmesi
- Tarih aralığı (bugün, dün, son 7 gün veya özel)
- Metin arama
- Kaçan chatler

**Detay görünümü:**
Sol listede seçilen chat için sağda tüm mesajlar, müşteri derecelendirmesi ve yorumu gösterilir. İstanbul zaman dilimine göre doğru filtreleme uygulanır.

---

### Chat Analizleri
AI tarafından analiz edilmiş chatlerin listesi ve detayları.

**Özet Kartları:** Toplam / Olumlu (≥80) / Nötr (50–79) / Olumsuz (<50) / Ortalama Puan — her kart filtre olarak tıklanabilir.

**Arama:** Chat ID, personel adı, müşteri adı veya mesaj içeriği üzerinden arama yapılabilir.

**Detay Modalı:**
- Genel puan ve duygu durumu
- İlk yanıt süresi
- AI özeti
- Kritik hatalar ve gelişim alanları
- Güçlü yönler
- Öneriler
- Tam konuşma geçmişi
- Manuel analiz tetikleme butonu

---

### Personel Analitiği
Personel bazında derinlemesine performans analizi.

**Sol Panel:** Tüm personel listesi; güvenilirlik seviyesi, uyarı sayısı, chat sayısı, beğeni/beğenmeme ve kaçan chat göstergeleriyle birlikte.

**Sağ Panel (seçilen personel):**
- 8 metrik kartı: Toplam Chat, İstatistiksel Skor, Ham Skor, Uyarı Sayısı, Beğeni, Beğenmeme, Kaçan Chat, İlk Yanıt Süresi, Çözüm Süresi
- Son 30 günün ilk 10 günlük performansı
- Güçlü konular listesi
- Gelişmesi gereken konular listesi
- Uyarılar ve beğeni sayıları tıklanabilir — ilgili chatlerin listesi açılır
- İstatistikleri yeniden hesapla butonu

---

### Raporlar
Üç sekmeli kapsamlı rapor sayfası.

**Sekme 1 — Trend Analizi:**
Günlük / haftalık / aylık bazda toplam chat sayısı, analiz puanı, personel puanı, ortalama yanıt ve çözüm sürelerinin trend grafikleri.

**Sekme 2 — Koçluk Önerileri:**
- Olumsuz chatlere göre filtreli liste (personel, tarih, sorun türü, koçluk durumu, gönderim durumu)
- Her chat için ayrı koçluk önerisi üretme butonu
- Tüm filtrelenmiş chatler için toplu koçluk üretme
- Oluşturulan önerileri tek tek veya toplu olarak gönderme
- Gönderim durumu takibi (`coaching_feedbacks` tablosunda)

**Sekme 3 — Gelişim Takibi:**
Koçluk gönderilmiş personel için koçluk öncesi 30 gün ile sonrası 30 günün karşılaştırması. Personel puanı, analiz puanı ve toplam chat metriklerinde değişim gösterilir. Başarı durumu otomatik hesaplanır: Mükemmel Gelişme / Küçük Gelişmeler / Gelişme Görülmedi.

---

### Canlı İzleme
Sistemin çalışma durumunu izlemek ve manuel operasyonlar başlatmak için.

**Özellikler:**
- Anlık metrik kartları: Toplam Chat, Analiz Edilen, Bekleyen, Uyarı
- Manuel senkronizasyon butonu (tarih aralığı seçeneğiyle)
- Manuel analiz tetikleme
- Manuel Telegram bildirimi gönderme
- İşlem durum takibi: senkronizasyon işi her 2 saniyede sorgulanır, tamamlanana kadar veya 2 dakika dolana kadar beklenir
- Sistem günlükleri: zaman damgası, tür (başarı / hata / bilgi) ve mesajla birlikte gerçek zamanlı log

---

### Prim Ayarları
Prim ve ceza kural yönetimi.

**Kural Parametreleri:**
- Kural adı
- Metrik türü: Toplam Chat / Ort. Puan / Ort. Memnuniyet / Ort. Yanıt Süresi / Olumlu-Olumsuz-Nötr Chat sayısı
- Koşul: Büyüktür / Küçüktür / Eşittir / Arasında
- Eşik değerleri
- Tür: Prim veya Ceza
- Tutar (TL)
- Dönem: Günlük / Haftalık / Aylık
- Aktif/pasif durumu

Masaüstünde tablo, mobilde kart görünümü.

---

### Prim Raporları
Prim hesaplama ve kayıtlı raporlar.

**Hesaplama Akışı:**
1. Dönem tipi (günlük / haftalık / aylık) ve tarih aralığı seçilir
2. "Hesapla" butonu önizleme sonuçlarını gösterir
3. "Kaydet" butonu sonuçları kalıcı olarak `bonus_records` tablosuna yazar

**Rapor Görünümü:**
- Dönem kartları (örn. "Ocak 2026" — toplam ve ortalama prim)
- Her dönem için personel tablosu
- Personel detay modalı: 8 performans metriği + uygulanan kural listesi + PDF çıktısı

---

### Yönetici Koçluk Merkezi
Yöneticiler için somut kanıtlara dayalı, yapılandırılmış koçluk senaryosu üretici.

**Giriş Parametreleri:**
- Personel seçimi
- Tarih aralığı (varsayılan: son 7 gün)
- Puan eşiği (varsayılan: 65 — bu puanın altındaki chatler derlenir)

**Üretilen Senaryo Yapısı:**
- **Bölüm 0 — Giriş:** Yönetici giriş konuşması şablonu
- **Bölüm 1 — Kritik Hatalar:** Her hata için somut chat kanıtı (Chat ID, müşteri adı, tarih, AI özeti) ve doğru yaklaşım önerisi
- **Bölüm 2 — Geliştirme Alanları:** Gelişim gerektiren konular ve örnekler
- **Bölüm 3 — Aksiyon Mutabakatı:** Üzerinde anlaşılan eylem maddeleri
- **İmzalar:** Yönetici ve personel imza alanları

Panoya kopyalama ve veritabanına kaydetme butonları.

---

### Ayarlar
API anahtarları ve sistem yapılandırması. Tüm değerler `update-settings` edge function aracılığıyla `settings` tablosuna kaydedilir.

---

### Kullanım Kılavuzu
16 başlıklı kapsamlı Türkçe kullanım kılavuzu. Dashboard metriklerinden AI analiz kriterlerine, güvenilirlik seviyelerinden prim sistemine kadar tüm konuları kapsar.

---

## Bileşenler

### `Leaderboard`
Personel sıralama kartları. Hem "En İyi Performanslar" hem de "Gelişim Gereken Personel" listeleri için kullanılır.

**Props:**
- `data` — Personel listesi (name, score, chatCount, avgSatisfaction, details)
- `title` — Başlık
- `type` — `'top'` veya `'bottom'`
- `teamTopScore` — En yüksek takım puanı (fark hesaplaması için)

**Tıklama Modalı:**
Her kart tıklandığında açılan popup'ta:
- Puan / Chat Sayısı / Memnuniyet metrikleri
- "Neden bu listede?" açıklaması — `bottom` tipi için listenin görece sıralama gösterdiği, gerçek bir "kötü performans" göstergesi olmadığı belirtilir; lider performansçıdan kaç puan geride olduğu gösterilir
- Motivasyon mesajı — puana ve duruma göre kişiselleştirilmiş
- Gelişim önerileri / Güçlü yönler — memnuniyet, chat hacmi ve puan farkına göre somut öneriler
- Hatırlatmalar

### `TrendChart`
Çizgi grafik. Dashboard ve Raporlar sayfalarında trend verisi için kullanılır.

### `BarChart`
Dikey çubuk grafik. Şikayet kategorileri dağılımı için kullanılır.

### `DonutChart`
Halka grafik. Duygu dağılımı (Pozitif / Nötr / Negatif) için kullanılır.

### `HeatMap`
24×30'luk ısı haritası. Saatlik chat dağılımını gösterir.

### `Tooltip`
Hover ile gösterilen araç ipucu bileşeni.

### `Modal`
Genel amaçlı modal. Başlık, içerik ve kapatma butonu içerir.

### `SentimentChatsModal`
Duygu türüne göre filtrelenmiş chat listesi gösteren modal. Dashboard metrik kartlarına tıklandığında açılır.

### `Toast`
Bildirim toast'ı. Başarı (yeşil), hata (kırmızı), uyarı (sarı) ve bilgi (mavi) türlerini destekler.

---

## Kütüphaneler

### `src/lib/supabase.ts`
Supabase istemci başlatma. Singleton pattern.

```typescript
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### `src/lib/auth.tsx`
`useAuth()` hook'u. Supabase auth session'ını yönetir.

**Dönen değer:** `{ session, loading, signOut }`

Giriş formatı: `{kullanici_adi}@takip.local` — Supabase email/password authentication kullanılır.

### `src/lib/backgroundSync.ts`
Arka plan senkronizasyon durumunu izleyen hook. `sync_jobs` tablosunu her 15 saniyede sorgular. Manuel senkronizasyon ve analiz tetikleme metodları sağlar.

**Dönen değer:** `{ syncStatus: { syncing, analyzing, error, lastSyncTime }, syncChats, analyzeChats }`

### `src/lib/notifications.tsx`
Toast bildirim sistemi. Context Provider ve hook.

```typescript
const { showSuccess, showError, showWarning, showInfo, showConfirm } = useNotification();
```

### `src/lib/utils.ts`
İstanbul zaman dilimi (UTC+3) yardımcı fonksiyonları.

| Fonksiyon | Açıklama |
|---|---|
| `maskName(name)` | Adı gizler (örn. "A*** B***") |
| `getIstanbulDateStartUTC(daysAgo)` | İstanbul gün başlangıcını UTC ISO string'e çevirir |
| `getIstanbulDateEndUTC(daysAgo)` | İstanbul gün sonunu (23:59:59.999) UTC'ye çevirir |
| `formatDateInIstanbulTimezone(utcDate)` | UTC tarihi İstanbul'a göre YYYY-MM-DD formatlar |
| `convertIstanbulDateToUTC(date, isEndOfDay)` | Çift yönlü dönüşüm |

### `src/lib/complaintCategories.ts`
Şikayet kategorilendirme motoru. Metin içeriğine göre anahtar kelime eşleştirmesi yapar.

**Fonksiyonlar:**
- `categorizeComplaint(text)` — metni 9 kategoriden birine eşler
- `extractComplaintTopics(aiSummary)` — AI özetinden "Para Yatırım İşleminin Gecikmesi" gibi spesifik konu başlıkları çıkarır

---

## Otomatik Zamanlama

Sunucu tarafında `pg_cron` ve `pg_net` extension'ları kullanılarak otomatik işlemler çalıştırılır:

| İş | Sıklık | Açıklama |
|---|---|---|
| `livechat-sync` | Her 10 dakikada bir | LiveChat API'den yeni veriler senkronize edilir |
| `livechat-analyze` | Her 5 dakikada bir | Analiz edilmemiş chatler Claude AI ile işlenir |

Tüm cron işleri `sync_jobs` tablosu üzerinden takip edilir. Eşzamanlı işleri önlemek için kilitleme mekanizması mevcuttur.

---

## AI Analiz Kriterleri

Her chat Claude AI tarafından dört ana kategoride değerlendirilir:

### 1. Dil ve Üslup (0–100)
- Profesyonel ve saygılı dil kullanımı
- Uygun hitap şekilleri
- Yasaklı / uygunsuz kelime kontrolü
- Kopyala-yapıştır (template) mesaj tespiti

### 2. Kalite Göstergeleri (0–100)
- Müşteri sorusuna doğru ve tam yanıt verme
- Oyalama veya geçiştirme tespiti
- Gereksiz uzatma veya erken kapatma
- Müşteri memnuniyeti yönetimi

### 3. Performans Metrikleri (0–100)
- İlk yanıt kalitesi ve hızı
- Çözüm odaklılık
- İletişim etkinliği
- Takip ve kapanış

### 4. Sorunlar ve Eksikler
- Kritik hatalar (bilgi yanlışlığı, kaba davranış, vb.)
- Gelişim gerektiren alanlar
- Kaçırılan fırsatlar

### Genel Puan Aralıkları

| Aralık | Anlam | Tetiklenen İşlem |
|---|---|---|
| 80–100 | İyi performans | — |
| 50–79 | Orta seviye | — |
| 0–49 | Kritik | Telegram bildirimi gönderilir |

---

## Şikayet Kategorileri

Sistem 9 şikayet kategorisini otomatik olarak tespit eder:

| Kategori | Örnekler |
|---|---|
| Para Yatırma / Çekim | Yatırım işlemi, para çekme talebi, geciken havale |
| Bonus / Promosyon | Hoşgeldin bonusu, freespin, çevrim şartı |
| Hesap Erişimi | Şifre sıfırlama, hesap kilidi, giriş sorunu |
| İşlem Gecikmeleri | Bekleyen işlem, gecikmiş ödeme |
| Güvenlik / Lisans | Lisans sorgusu, güvenlik ihlali şüphesi |
| Müşteri Hizmetleri | Hizmet kalitesi şikayeti, bekleme süresi |
| Bahis / Oyun Sorunları | Bahis iptali, oyun hatası, kazanç sorunu |
| Teknik Sorunlar | Site çökmesi, uygulama hatası, bağlantı sorunu |
| Doğrulama / KYC | Kimlik doğrulama, belge yükleme, hesap onayı |

---

## Skorlama Sistemi

### Ham Skor
Tüm AI analiz puanlarının basit ortalaması.

### İstatistiksel Skor
Güvenilirlik seviyesine göre ağırlıklandırılmış skor. Az sayıda chat ile çalışan personelin puanı ham skora kıyasla daha muhafazakâr hesaplanır.

### Güvenilirlik Seviyeleri

| Seviye | Açıklama | Chat Sayısı Kriteri |
|---|---|---|
| A — En Güvenilir | İstatistiksel güven yüksek | Yüksek chat hacmi |
| B — Güvenilir | Güvenilir tahmin | Orta-yüksek hacim |
| C — Orta Güvenilir | Sınırlı veri | Orta hacim |
| D — Düşük Güvenilir | Yetersiz veri | Düşük hacim |

---

## Hata Giderme

### Senkronizasyon Çalışmıyor
1. Ayarlar sayfasından LiveChat API Key'in doğru girildiğini kontrol edin
2. Canlı İzleme sayfasından manuel senkronizasyonu test edin
3. Sistem günlüklerinde hata mesajını inceleyin
4. `sync_jobs` tablosunda `failed` durumundaki işlerin `error` alanını kontrol edin

### Analiz Çalışmıyor
1. Ayarlar sayfasından Claude API Key'in doğru girildiğini kontrol edin
2. `chat_analysis` tablosunda son kayıtlara bakın
3. Canlı İzleme sayfasından manuel analiz tetikleyin

### Telegram Bildirimleri Gelmiyor
1. Bot token ve chat ID'nin doğru girildiğini kontrol edin
2. Puan < 50 olan analiz sonuçları olduğunu doğrulayın
3. `alerts` tablosunda `sent_to_telegram = false` kayıt var mı kontrol edin
4. Canlı İzleme sayfasından manuel bildirim göndermeyi deneyin

### Dashboard Boş Görünüyor
1. LiveChat senkronizasyonunun başarıyla çalıştığını doğrulayın
2. `chats` tablosunda kayıt olup olmadığını kontrol edin
3. `recalculate_personnel_stats()` fonksiyonunu manuel olarak çalıştırın
4. Sayfayı yenileyin (30 saniyede otomatik yenileme de aktif)

---

## Lisans

Bu proje özel kullanım içindir.
