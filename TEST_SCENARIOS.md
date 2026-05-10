# LiveChat QA Test Senaryoları

## Sistem Özeti
LiveChat kalite kontrol sistemi, canlı destek sohbetlerini otomatik olarak analiz eder, kalite skorları verir ve sorunlu durumları Telegram'a bildirir.

## Otomatik İşleyiş
- **pg_cron** her 1 dakikada bir `sync-livechat` edge function'ını çağırır
- Function, LiveChat API'den chat'leri çeker, yeni chat'leri ChatGPT ile analiz eder ve sorunlu olanları Telegram'a gönderir

## Test Senaryoları

### 1. Ayarlar Sayfası Testi ✅
**Amaç:** API anahtarlarının doğru kaydedildiğini doğrulamak

**Adımlar:**
1. Ayarlar sayfasını aç
2. ChatGPT API Key girişini kontrol et (şu an: `test-key-placeholder`)
3. LiveChat API Key'in doğru olduğunu kontrol et
4. Telegram Bot Token ve Chat ID'nin doğru olduğunu kontrol et
5. Kaydet butonuna tıkla

**Beklenen Sonuç:**
- Tüm ayarlar başarıyla kaydedilir
- Başarı mesajı gösterilir

**Mevcut Durum:** ✅ Çalışıyor

---

### 2. Chat Senkronizasyonu Testi ✅
**Amaç:** LiveChat API'den chat'lerin doğru çekildiğini doğrulamak

**Adımlar:**
1. Canlı İzleme sayfasını aç
2. "Manuel Pipeline Çalıştır" butonuna tıkla
3. Logs bölümünü izle

**Beklenen Sonuç:**
- Chat'ler LiveChat API'den çekilir
- Mesajlar `chat_messages` tablosuna kaydedilir
- İstatistikler güncellenir

**Test SQL:**
\`\`\`sql
-- Toplam chat sayısı
SELECT COUNT(*) FROM chats;

-- Mesaj sayısı
SELECT COUNT(*) FROM chat_messages WHERE is_system = false;

-- En çok mesajlı chat'ler
SELECT c.id, c.agent_name, c.customer_name, COUNT(cm.id) as msg_count
FROM chats c
LEFT JOIN chat_messages cm ON c.id = cm.chat_id AND cm.is_system = false
GROUP BY c.id, c.agent_name, c.customer_name
ORDER BY msg_count DESC
LIMIT 5;
\`\`\`

**Mevcut Durum:** ✅ Çalışıyor (43 chat, 114 mesaj)

---

### 3. ChatGPT Analiz Testi ⚠️
**Amaç:** Chat'lerin ChatGPT ile analiz edildiğini doğrulamak

**Ön Gereksinim:** Geçerli bir ChatGPT API Key girilmeli

**Adımlar:**
1. Ayarlar sayfasından geçerli bir OpenAI API key gir
2. Canlı İzleme sayfasından "Manuel Pipeline Çalıştır" butonuna tıkla
3. Logs'da analiz mesajlarını izle

**Beklenen Sonuç:**
- Archived ve analiz edilmemiş chat'ler ChatGPT'ye gönderilir
- Analiz sonuçları `chat_analysis` tablosuna kaydedilir
- Personel skorları güncellenir
- Düşük skorlu chat'ler için alert oluşturulur

**Test SQL:**
\`\`\`sql
-- Analiz edilen chat'ler
SELECT COUNT(*) FROM chats WHERE analyzed = true;

-- Analiz sonuçları
SELECT
  ca.chat_id,
  ca.overall_score,
  ca.sentiment,
  ca.requires_attention,
  c.agent_name
FROM chat_analysis ca
JOIN chats c ON c.id = ca.chat_id
ORDER BY ca.analysis_date DESC
LIMIT 5;

-- Personel skorları
SELECT name, total_chats, average_score, warning_count
FROM personnel
ORDER BY average_score DESC;
\`\`\`

**Mevcut Durum:** ⚠️ ChatGPT API key gerekiyor

**Test için geçici çözüm:**
Geçici olarak test için mock bir analiz eklenebilir:
\`\`\`sql
-- Bir chat'i manuel olarak test analizi ile işaretle
INSERT INTO chat_analysis (
  chat_id, overall_score, sentiment, requires_attention,
  language_compliance, quality_metrics, performance_metrics,
  issues_detected, positive_aspects, recommendations, ai_summary
) VALUES (
  'TA27BOFO2R', 75, 'positive', false,
  '{"professional_language": 80, "polite_tone": 85, "forbidden_words": [], "copy_paste_detected": false}'::jsonb,
  '{"answer_relevance": 70, "stalling_detected": false, "unnecessary_length": false, "customer_satisfaction": "positive"}'::jsonb,
  '{"first_response_quality": 75, "solution_focused": 80, "communication_effectiveness": 75}'::jsonb,
  '{"critical_errors": [], "improvement_areas": ["Daha detaylı bilgi verilebilir"], "misinformation": []}'::jsonb,
  '{"strengths": ["Kibar yaklaşım", "Hızlı yanıt"], "good_practices": ["Müşteri memnuniyeti öncelikli"]}'::jsonb,
  'Daha detaylı açıklamalar eklenebilir',
  'Genel olarak iyi bir sohbet, kibar ve profesyonel yaklaşım.'
);

UPDATE chats SET analyzed = true WHERE id = 'TA27BOFO2R';
\`\`\`

---

### 4. Telegram Bildirim Testi ⚠️
**Amaç:** Sorunlu chat'lerin Telegram'a gönderildiğini doğrulamak

**Ön Gereksinim:**
- ChatGPT analizi çalışıyor olmalı
- Düşük skorlu (< 60) veya dikkat gerektiren chat olmalı

**Adımlar:**
1. Düşük skorlu bir analiz oluştur veya bekle
2. Alert'lerin oluştuğunu kontrol et
3. Telegram grubunu kontrol et

**Test SQL:**
\`\`\`sql
-- Oluşturulan alert'ler
SELECT
  a.id,
  a.severity,
  a.sent_to_telegram,
  c.agent_name,
  ca.overall_score
FROM alerts a
JOIN chats c ON c.id = a.chat_id
LEFT JOIN chat_analysis ca ON ca.id = a.analysis_id
ORDER BY a.created_at DESC
LIMIT 5;
\`\`\`

**Manuel test için düşük skorlu analiz oluşturma:**
\`\`\`sql
INSERT INTO chat_analysis (
  chat_id, overall_score, sentiment, requires_attention,
  language_compliance, quality_metrics, performance_metrics,
  issues_detected, positive_aspects, recommendations, ai_summary
) VALUES (
  'TA28HFCYD4', 45, 'negative', true,
  '{"professional_language": 40, "polite_tone": 50, "forbidden_words": ["kaba ifade"], "copy_paste_detected": true}'::jsonb,
  '{"answer_relevance": 30, "stalling_detected": true, "unnecessary_length": false, "customer_satisfaction": "negative"}'::jsonb,
  '{"first_response_quality": 50, "solution_focused": 40, "communication_effectiveness": 45}'::jsonb,
  '{"critical_errors": ["Müşteriye yanlış bilgi verildi", "Kaba davranış"], "improvement_areas": ["İletişim becerileri", "Ürün bilgisi"], "misinformation": ["Yanlış kampanya bilgisi"]}'::jsonb,
  '{"strengths": [], "good_practices": []}'::jsonb,
  'Müşteri ile etkili iletişim kurulamadı. Kaba ve yetersiz yaklaşım.',
  'Kritik hatalar tespit edildi: Müşteriye yanlış bilgi verildi ve kaba davranıldı.'
);

UPDATE chats SET analyzed = true WHERE id = 'TA28HFCYD4';
\`\`\`

**Mevcut Durum:** ⚠️ Test edilmedi (ChatGPT API key gerekiyor)

---

### 5. Dashboard Testi ✅
**Amaç:** Dashboard istatistiklerinin doğru gösterildiğini doğrulamak

**Adımlar:**
1. Dashboard sayfasını aç
2. İstatistik kartlarını kontrol et
3. Son uyarılar bölümünü kontrol et

**Beklenen Sonuç:**
- Toplam chat sayısı doğru
- Analiz edilen chat sayısı doğru
- Personel sayısı doğru
- Bekleyen uyarı sayısı doğru
- Ortalama skor ve yanıt süresi gösteriliyor

**Mevcut Durum:** ✅ Çalışıyor

---

### 6. Chat Analizleri Listesi Testi ✅
**Amaç:** Chat listesinin ve filtrelerin çalıştığını doğrulamak

**Adımlar:**
1. Chat Analizleri sayfasını aç
2. Arama kutusunu test et
3. Filtreleri test et (Analiz Edildi, Analiz Bekliyor, Olumlu, Olumsuz)
4. Bir chat'e tıkla ve detay modal'ını kontrol et

**Beklenen Sonuç:**
- Chat listesi gösteriliyor
- Arama çalışıyor
- Filtreler çalışıyor
- Chat detayları gösteriliyor

**Mevcut Durum:** ✅ Çalışıyor

---

### 7. Personel Performans Testi ✅
**Amaç:** Personel performans verilerinin doğru gösterildiğini doğrulamak

**Adımlar:**
1. Personel Performansı sayfasını aç
2. Personel listesinden birini seç
3. Performans metriklerini kontrol et
4. Günlük istatistikleri kontrol et

**Beklenen Sonuç:**
- Personel listesi gösteriliyor
- Ortalama skor doğru
- Uyarı sayısı doğru
- Güçlü/zayıf konular gösteriliyor (analiz yapıldıktan sonra)

**Mevcut Durum:** ✅ Çalışıyor

---

### 8. Raporlar Testi ✅
**Amaç:** Trend analizlerinin ve raporların doğru gösterildiğini doğrulamak

**Adımlar:**
1. Raporlar & Trendler sayfasını aç
2. Günlük/Haftalık/Aylık görünümleri test et
3. En iyi performans ve gelişmesi gerekenler listelerini kontrol et

**Beklenen Sonuç:**
- Trend verileri gösteriliyor
- Performans listeleri doğru

**Mevcut Durum:** ✅ Çalışıyor

---

### 9. Canlı İzleme Testi ✅
**Amaç:** Manuel işlemlerin ve otomatik durumun gösterildiğini doğrulamak

**Adımlar:**
1. Canlı İzleme sayfasını aç
2. Otomatik çalışma durumunu kontrol et
3. Manuel pipeline çalıştır
4. Logs'u kontrol et

**Beklenen Sonuç:**
- Otomatik çalışma durumu gösteriliyor
- Manuel tetikleme çalışıyor
- İstatistikler güncelleniyor
- Logs gösteriliyor

**Mevcut Durum:** ✅ Çalışıyor

---

### 10. Otomatik Zamanlama Testi ✅
**Amaç:** pg_cron'un her dakika pipeline'ı çalıştırdığını doğrulamak

**Test SQL:**
\`\`\`sql
-- Cron job'u kontrol et
SELECT * FROM cron.job WHERE jobname = 'livechat-pipeline';

-- Son çalışma zamanlarını kontrol et
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'livechat-pipeline')
ORDER BY start_time DESC
LIMIT 5;
\`\`\`

**Mevcut Durum:** ✅ Çalışıyor (her 1 dakika)

---

## Bilinen Sorunlar ve Çözümler

### 1. ✅ ÇÖZÜLDÜ: analyzed=true ama analysis yok
**Sorun:** Bazı chat'ler analyzed=true olarak işaretlenmiş ama chat_analysis tablosunda kayıt yok.

**Çözüm:**
\`\`\`sql
UPDATE chats SET analyzed = false
WHERE id NOT IN (SELECT chat_id FROM chat_analysis);
\`\`\`

### 2. ✅ ÇÖZÜLDÜ: message_count güncel değil
**Sorun:** Chat'lerdeki message_count sıfır gösteriliyor ama chat_messages'da mesajlar var.

**Çözüm:**
\`\`\`sql
UPDATE chats c
SET message_count = (
  SELECT COUNT(*)
  FROM chat_messages cm
  WHERE cm.chat_id = c.id AND cm.is_system = false
)
WHERE EXISTS (
  SELECT 1 FROM chat_messages cm WHERE cm.chat_id = c.id
);
\`\`\`

### 3. ⚠️ DEVAM EDİYOR: ChatGPT API Key gerekiyor
**Durum:** Sistem analiz yapabilmek için geçerli bir OpenAI API key'e ihtiyaç duyuyor.

**Çözüm:** Ayarlar sayfasından gerçek bir API key girilmeli.

---

## Hızlı Test Komutu

Tüm sistemi tek seferde test etmek için:

\`\`\`bash
# 1. Veritabanı durumunu kontrol et
curl -X POST "https://yjtmssvuukcazbuvvmvz.supabase.co/rest/v1/rpc/get_system_status" \\
  -H "apikey: YOUR_ANON_KEY" \\
  -H "Authorization: Bearer YOUR_ANON_KEY"

# 2. Manuel pipeline çalıştır
curl -X POST "https://yjtmssvuukcazbuvvmvz.supabase.co/functions/v1/sync-livechat" \\
  -H "Authorization: Bearer YOUR_ANON_KEY"

# 3. Telegram alert'leri gönder
curl -X POST "https://yjtmssvuukcazbuvvmvz.supabase.co/functions/v1/send-telegram-alerts" \\
  -H "Authorization: Bearer YOUR_ANON_KEY"
\`\`\`

---

## Sonuç

**Çalışan Özellikler:** ✅
- Chat senkronizasyonu
- Mesaj kaydetme
- Personel takibi
- Dashboard istatistikleri
- Tüm UI sayfaları
- Otomatik zamanlama (pg_cron)
- Manuel tetikleme

**ChatGPT API Key Gerektirenler:** ⚠️
- Chat analizi
- Telegram bildirimleri
- Performans skorlama
- Güçlü/zayıf konu tespiti

**Sistem Hazır:** Sadece ChatGPT API key'i eklendikten sonra tam otomatik çalışmaya başlayacak!
