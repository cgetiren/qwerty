# LiveChat QA Sistemi - Hızlı Başlangıç

## Sistem Nedir?

LiveChat kalite kontrol ve analiz sistemi, canlı destek sohbetlerinizi otomatik olarak:
- **İzler** - Her dakika LiveChat API'den yeni chat'leri çeker
- **Analiz Eder** - ChatGPT ile kalite, dil, üslup ve performans analizi yapar
- **Uyarır** - Sorunlu durumları Telegram'a bildirir
- **Raporlar** - Personel bazlı performans raporları oluşturur

## Sistem Gereksinimleri

✅ **Zaten Hazır:**
- ✅ Supabase veritabanı kurulu ve yapılandırılmış
- ✅ LiveChat API bağlantısı aktif
- ✅ Telegram bot ve grup ayarlanmış
- ✅ Otomatik zamanlama (pg_cron) çalışıyor
- ✅ 3 Edge Function deploy edilmiş

⚠️ **Sizden Bekleniyor:**
- ChatGPT API Key (analizler için)

## Başlangıç Adımları

### 1. ChatGPT API Key Alın

1. [OpenAI Platform](https://platform.openai.com/api-keys) adresine gidin
2. Hesabınıza giriş yapın
3. "Create new secret key" butonuna tıklayın
4. API key'i kopyalayın (örn: sk-proj-...)

### 2. API Key'i Sisteme Girin

1. Uygulamayı açın
2. Sol menüden **Ayarlar** sayfasına gidin
3. **ChatGPT API Key** alanına kopyaladığınız key'i yapıştırın
4. **Kaydet** butonuna tıklayın

### 3. Manuel Test Yapın

1. Sol menüden **Canlı İzleme** sayfasına gidin
2. **Manuel Pipeline Çalıştır** butonuna tıklayın
3. İşlem tamamlanana kadar bekleyin (30-60 saniye)
4. Logs bölümünde sonuçları görün

**Beklenen Sonuç:**
```
Pipeline tamamlandı: 50 chat senkronize, 0 yeni, 5 analiz edildi, 2 uyarı gönderildi
```

### 4. Telegram Grubunuzu Kontrol Edin

Düşük skorlu veya sorunlu chat'ler için Telegram grubunuza bildirim gelecek:

```
🚨 DİKKAT GEREKTİREN SOHBET

Temsilci: Asya
Müşteri: Ahmet Y.
Puan: 45/100
Durum: Olumsuz

📊 Özet:
Müşteri ile etkili iletişim kurulamadı...

⚠️ Sorunlar:
- Müşteriye yanlış bilgi verildi
- Kaba davranış

💡 Öneriler:
İletişim becerileri geliştirilmeli...
```

## Otomatik Çalışma

✅ **Sistem şu anda otomatik çalışıyor!**

- **Her 1 dakikada** bir `pg_cron` otomatik olarak pipeline'ı çalıştırır
- Yeni chat'ler otomatik analiz edilir
- Sorunlu durumlar otomatik Telegram'a gönderilir

**Otomatik durumu kontrol etmek için:**
1. Canlı İzleme sayfasını açın
2. Sağ üstte **"Otomatik Çalışma Aktif (her 1 dk)"** yazısını görmelisiniz

## Sayfalar ve Kullanım

### Dashboard
- **Amaç:** Genel sistem durumunu görüntüleme
- **İçerik:** Toplam chat, analiz edilen, personel sayısı, bekleyen uyarılar
- **Kullanım:** Ana sayfa olarak sistemin özet durumunu gösterir

### Chat Analizleri
- **Amaç:** Tüm chat kayıtlarını ve analizlerini görüntüleme
- **İçerik:** Chat listesi, filtreler, arama, detay görünümü
- **Kullanım:**
  - Arama yaparak belirli chat'leri bulun
  - Filtreleri kullanarak analiz durumuna göre filtreleyin
  - Chat'e tıklayarak detaylı analiz sonucunu görün

### Personel Performansı
- **Amaç:** Temsilci bazlı performans takibi
- **İçerik:** Personel listesi, ortalama skorlar, günlük istatistikler
- **Kullanım:**
  - Sol taraftan personel seçin
  - Sağ tarafta detaylı performans metriklerini görün
  - Güçlü ve zayıf konuları inceleyin

### Raporlar & Trendler
- **Amaç:** Zaman bazlı trend analizi
- **İçerik:** Günlük/haftalık/aylık grafikler, top/bottom performans
- **Kullanım:**
  - Günlük, haftalık veya aylık görünüm seçin
  - Trend grafiklerini inceleyin
  - En iyi ve gelişmesi gereken personeli görün

### Canlı İzleme
- **Amaç:** Sistem durumu ve manuel işlemler
- **İçerik:** Canlı istatistikler, manuel tetikleme, sistem logları
- **Kullanım:**
  - Otomatik çalışma durumunu kontrol edin
  - İhtiyaç halinde manuel pipeline çalıştırın
  - Sistem loglarını izleyin

### Ayarlar
- **Amaç:** API anahtarları ve yapılandırma
- **İçerik:** ChatGPT, LiveChat, Telegram ayarları
- **Kullanım:**
  - API key'lerini girin veya güncelleyin
  - Senkronizasyon aralığını ayarlayın
  - Değişiklikleri kaydedin

## Analiz Kriterleri

Sistem her chat'i şu başlıklarda değerlendirir:

### 1. Dil ve Üslup (0-100)
- Profesyonel dil kullanımı
- Saygılı ve kibar ton
- Yasaklı kelime kontrolü
- Kopyala-yapıştır / ezber mesaj tespiti

### 2. Kalite Metrikleri (0-100)
- Soruya gerçek cevap verildi mi?
- Oyalama, geçiştirme tespiti
- Gereksiz uzatma / kısa kesme analizi
- Müşteri memnuniyeti (pozitif/nötr/negatif)

### 3. Performans (0-100)
- İlk yanıt kalitesi
- Çözüm odaklılık
- İletişim etkinliği

### 4. Genel Skor (0-100)
- Tüm metriklerin ortalaması
- **60 altı:** Dikkat gerektirir (Telegram bildirimi)
- **60-79:** Orta seviye
- **80+:** İyi performans

## Telegram Bildirimleri

**Ne Zaman Gönderilir:**
- Genel skor < 60
- `requires_attention = true` (kritik durum)
- Yasaklı kelime tespit edildiğinde
- Müşteriye yanlış bilgi verildiğinde

**Bildirim İçeriği:**
- Temsilci ve müşteri bilgileri
- Genel skor ve durum
- AI özeti
- Tespit edilen sorunlar
- Öneriler

## Sorun Giderme

### "Analiz edilmiyor"
- **Kontrol:** Ayarlar sayfasında ChatGPT API key'in doğru girildiğinden emin olun
- **Test:** Canlı İzleme'den manuel pipeline çalıştırın
- **Log:** Logs bölümünde hata mesajını kontrol edin

### "Telegram bildirimi gelmiyor"
- **Kontrol:** Telegram bot token ve chat ID'nin doğru olduğundan emin olun
- **Test:** Canlı İzleme'den "Bekleyen Uyarıları Gönder" butonuna tıklayın
- **Doğrulama:** Düşük skorlu bir chat olduğundan emin olun (skor < 60)

### "Chat'ler çekilmiyor"
- **Kontrol:** LiveChat API key'in doğru olduğundan emin olun
- **Test:** API'yi manuel test edin:
  ```bash
  curl -H "X-API-Key: YOUR_KEY" https://livechat.systemtest.store/api/v1/chats
  ```

### "pg_cron çalışmıyor"
- **Kontrol:** Veritabanında cron job'u kontrol edin:
  ```sql
  SELECT * FROM cron.job WHERE jobname = 'livechat-pipeline';
  ```
- **Log:** Son çalışma zamanlarını kontrol edin:
  ```sql
  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
  ```

## Veritabanı Bakımı

### Eski Verileri Temizleme
```sql
-- 30 günden eski chat'leri sil
DELETE FROM chats WHERE created_at < NOW() - INTERVAL '30 days';

-- Gönderilmiş alert'leri temizle (60 gün)
DELETE FROM alerts WHERE sent_to_telegram = true AND created_at < NOW() - INTERVAL '60 days';
```

### İstatistikleri Güncelleme
```sql
-- Personel skorlarını yeniden hesapla
UPDATE personnel p
SET average_score = (
  SELECT AVG(ca.overall_score)
  FROM chat_analysis ca
  JOIN chats c ON c.id = ca.chat_id
  WHERE c.agent_name = p.name
);
```

### Chat Message Count Senkronizasyonu
```sql
-- Message count'ları güncelle
UPDATE chats c
SET message_count = (
  SELECT COUNT(*)
  FROM chat_messages cm
  WHERE cm.chat_id = c.id AND cm.is_system = false
);
```

## Destek ve Dökümantasyon

- **Test Senaryoları:** `TEST_SCENARIOS.md` dosyasına bakın
- **Edge Functions:** `supabase/functions/` klasöründe kaynak kodlar
- **Database Schema:** `supabase/migrations/` klasöründe migration dosyaları

## Özet Kontrol Listesi

✅ ChatGPT API Key girildi mi?
✅ Manuel test yapıldı mı?
✅ Telegram bildirimi geldi mi?
✅ Otomatik çalışma aktif mi?
✅ Dashboard istatistikleri doğru mu?

Tüm adımlar tamamlandıysa sistem kullanıma hazır! 🎉
