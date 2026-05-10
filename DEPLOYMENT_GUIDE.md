# Yeni Marka İçin Deployment Rehberi

Bu rehber, mevcut projeyi tamamen bağımsız yeni bir marka için nasıl deploy edeceğinizi adım adım açıklar.

## Adım 1: Projeyi Kopyalayın

1. Mevcut proje dizinini tamamen yeni bir konuma kopyalayın:
   ```bash
   cp -r /path/to/current-project /path/to/new-brand-project
   cd /path/to/new-brand-project
   ```

2. Git geçmişini temizleyin (isteğe bağlı):
   ```bash
   rm -rf .git
   git init
   git add .
   git commit -m "Initial commit for new brand"
   ```

## Adım 2: Yeni Supabase Projesi Oluşturun

1. [Supabase Dashboard](https://supabase.com/dashboard) üzerinden yeni bir proje oluşturun
2. Proje adını yeni markanıza göre belirleyin
3. Region seçin (mevcut proje ile aynı region önerilir)
4. Database şifresini güvenli bir yere kaydedin

## Adım 3: Environment Variables'ları Güncelleyin

`.env` dosyasını yeni Supabase bilgileri ile güncelleyin:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-new-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-new-anon-key

# LiveChat Configuration (Yeni markanın LiveChat bilgileri)
VITE_LIVECHAT_API_URL=https://api.livechat.com/v3.5
VITE_LIVECHAT_LICENSE_ID=your-new-license-id
VITE_LIVECHAT_ACCESS_TOKEN=your-new-access-token

# Telegram Configuration (Yeni markanın Telegram bot'u)
VITE_TELEGRAM_BOT_TOKEN=your-new-telegram-bot-token
VITE_TELEGRAM_CHAT_ID=your-new-telegram-chat-id
```

**Önemli:** Yeni Supabase projesinin URL ve API key'lerini Dashboard > Settings > API bölümünden alabilirsiniz.

## Adım 4: Dependencies'leri Yükleyin

```bash
npm install
```

## Adım 5: Database Migration'larını Uygulayın

Tüm migration dosyalarını sırayla yeni Supabase projesine uygulayın. Bunun için Supabase CLI kullanmanız gerekir:

### Supabase CLI Kurulumu

```bash
npm install -g supabase
```

### Supabase'e Login Olun

```bash
supabase login
```

### Projeyi Link Edin

```bash
supabase link --project-ref your-new-project-ref
```

**Not:** `project-ref`'i Supabase Dashboard'dan alabilirsiniz (URL'deki ID).

### Migration'ları Uygulayın

```bash
supabase db push
```

Bu komut `supabase/migrations/` klasöründeki tüm migration dosyalarını sırayla uygulayacaktır.

## Adım 6: Edge Functions'ları Deploy Edin

Her bir edge function'ı deploy etmeniz gerekir. Bu projedeki tüm fonksiyonlar:

1. **analyze-chat** - Chat analizi için
2. **calculate-bonuses** - Bonus hesaplama
3. **callback-telegram-webhook** - Callback telegram webhook
4. **create-user** - Kullanıcı oluşturma
5. **detect-callbacks** - Callback tespiti
6. **get-coaching** - Coaching önerileri
7. **reset-analyses** - Analiz sıfırlama
8. **send-telegram-alerts** - Telegram bildirimleri
9. **simple-analyze** - Basit analiz
10. **sync-livechat** - LiveChat senkronizasyonu
11. **telegram-webhook** - Telegram webhook
12. **test-query** - Test query
13. **update-settings** - Ayar güncelleme

Her birini deploy etmek için:

```bash
supabase functions deploy analyze-chat
supabase functions deploy calculate-bonuses
supabase functions deploy callback-telegram-webhook
supabase functions deploy create-user
supabase functions deploy detect-callbacks
supabase functions deploy get-coaching
supabase functions deploy reset-analyses
supabase functions deploy send-telegram-alerts
supabase functions deploy simple-analyze
supabase functions deploy sync-livechat
supabase functions deploy telegram-webhook
supabase functions deploy test-query
supabase functions deploy update-settings
```

## Adım 7: Edge Function Secrets'larını Ayarlayın

Edge function'ların çalışması için gerekli secret'ları ekleyin:

```bash
# Claude API Key
supabase secrets set ANTHROPIC_API_KEY=your-claude-api-key

# LiveChat Credentials
supabase secrets set LIVECHAT_API_URL=https://api.livechat.com/v3.5
supabase secrets set LIVECHAT_LICENSE_ID=your-license-id
supabase secrets set LIVECHAT_ACCESS_TOKEN=your-access-token

# Telegram Bot
supabase secrets set TELEGRAM_BOT_TOKEN=your-telegram-bot-token
supabase secrets set TELEGRAM_CHAT_ID=your-telegram-chat-id
```

**Not:** Supabase ortam değişkenleri (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) otomatik olarak eklenir, elle eklemenize gerek yok.

## Adım 8: İlk Kullanıcıyı Oluşturun

Sistem, signup sırasında otomatik olarak user profile oluşturur. İlk super admin kullanıcıyı oluşturmak için:

1. Uygulamaya gidin ve signup yapın
2. Supabase Dashboard > Authentication > Users bölümüne gidin
3. Oluşturduğunuz kullanıcının email'ini onaylayın
4. Supabase Dashboard > SQL Editor'e gidin ve şu sorguyu çalıştırın:

```sql
-- İlk kullanıcıyı founder ve super admin yapın
UPDATE user_profiles
SET is_founder = true
WHERE auth_user_id = 'your-user-auth-id';

-- Kullanıcıya super_admin rolü atayın
INSERT INTO user_role_assignments (user_id, role_id)
SELECT id, (SELECT id FROM roles WHERE name = 'super_admin')
FROM user_profiles
WHERE auth_user_id = 'your-user-auth-id';
```

**Not:** `auth_user_id`'yi Supabase Dashboard > Authentication > Users bölümünden alabilirsiniz.

## Adım 9: Telegram Webhook'ları Ayarlayın

İki ayrı telegram bot için webhook'ları ayarlamanız gerekir:

### Ana Telegram Bot (Alertler için)

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-new-project.supabase.co/functions/v1/telegram-webhook"
  }'
```

### Callback Telegram Bot

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_CALLBACK_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-new-project.supabase.co/functions/v1/callback-telegram-webhook"
  }'
```

## Adım 10: Frontend'i Build ve Deploy Edin

### Local Test

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

Build klasörünü (`dist/`) istediğiniz hosting platformuna (Vercel, Netlify, Cloudflare Pages vb.) deploy edebilirsiniz.

### Vercel'e Deploy (Örnek)

```bash
npm install -g vercel
vercel
```

## Adım 11: System Configuration'ı Yapın

Uygulamaya giriş yaptıktan sonra:

1. **Settings** sayfasına gidin
2. **LiveChat Ayarları**'nı yapılandırın
3. **Telegram Ayarları**'nı yapılandırın
4. **Analiz Ayarları**'nı gözden geçirin
5. **Bonus Ayarları**'nı yapılandırın

## Adım 12: Cron Job'ları Kontrol Edin

Migration'lar otomatik olarak şu cron job'ları oluşturur:

- `sync-livechat`: Her 10 dakikada bir LiveChat verilerini çeker
- `analyze-unanalyzed-chats`: Her 3 dakikada bir analiz edilmemiş chatları analiz eder
- `send-telegram-alerts`: Her 5 dakikada bir telegram alertleri gönderir
- `detect-callbacks`: Her 15 dakikada bir callback'leri tespit eder
- `calculate-bonuses`: Her gün gece yarısı bonusları hesaplar

Bunların çalışıp çalışmadığını Supabase Dashboard > Database > Extensions > pg_cron bölümünden kontrol edebilirsiniz.

## Adım 13: Test Edin

1. LiveChat senkronizasyonunun çalıştığını kontrol edin
2. Chat analiz sisteminin çalıştığını kontrol edin
3. Telegram bildirimlerinin geldiğini kontrol edin
4. Dashboard'daki verilerin doğru gösterildiğini kontrol edin
5. Kullanıcı yönetimi ve rol sistemini test edin

## Önemli Notlar

### Güvenlik
- ✅ Tüm `.env` dosyalarını `.gitignore`'a ekleyin
- ✅ API key'leri asla Git'e commit etmeyin
- ✅ Production'da güçlü database şifreleri kullanın
- ✅ RLS (Row Level Security) zaten tüm tablolarda aktif

### Veri İzolasyonu
- ✅ Her marka tamamen ayrı Supabase projesi kullanır
- ✅ Veriler aralarında hiç karışmaz
- ✅ Kullanıcı hesapları markalara özeldir

### Bakım ve Güncelleme
- Yeni özellikler eklendiğinde her iki projeyi ayrı ayrı güncellemeniz gerekir
- Migration'ları her iki projede ayrı ayrı uygulamanız gerekir
- Bu dezavantaj gibi görünse de, markalar arası veri güvenliği açısından en güvenli yöntemdir

## Sorun Giderme

### Migration Hataları
Eğer migration sırasında hata alırsanız:
```bash
supabase db reset
supabase db push
```

### Edge Function Deploy Hataları
```bash
# Function'ı yeniden deploy edin
supabase functions deploy function-name --no-verify-jwt
```

### Cron Job Çalışmıyor
Supabase Dashboard'dan manuel olarak trigger edin:
```sql
SELECT cron.schedule('test-sync', '* * * * *', 'SELECT sync_livechat()');
```

## Destek

Herhangi bir sorun yaşarsanız:
1. Supabase logs'larını kontrol edin: Dashboard > Logs
2. Edge function logs'larını kontrol edin: Dashboard > Edge Functions > [function-name] > Logs
3. Database logs'larını kontrol edin: Dashboard > Database > Logs

---

**Tebrikler!** Yeni markanız için tamamen bağımsız bir deployment yaptınız. 🎉
