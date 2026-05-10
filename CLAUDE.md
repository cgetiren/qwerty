# LiveTakip - AI Canli Destek Kalite Yonetim Sistemi

## Proje Nedir
LiveChat uzerinden gelen musteri chatlerini otomatik senkronize eden, Claude AI ile analiz eden, personel performansini takip eden ve Telegram uzerinden bildirim gonderen cok markali (multi-brand) kalite yonetim platformu.

## Tech Stack
- **Frontend:** React 18.3 + TypeScript + Vite 5.4 + Tailwind CSS 3.4
- **Backend:** Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- **AI:** Claude API (Haiku batch analiz, Sonnet dusuk puanli yeniden analiz)
- **Bildirimler:** Telegram Bot API + Web Push (PWA)
- **Deploy:** Netlify (frontend), Supabase Edge Functions (backend)
- **Routing:** React Router 7.13

## Onemli Bilgiler

### Supabase
- **Project ref:** anfpgiaaobvmnqboqwdw
- **URL:** https://anfpgiaaobvmnqboqwdw.supabase.co
- **DB:** postgresql://postgres:[bbb333444!!**]@db.anfpgiaaobvmnqboqwdw.supabase.co:5432/postgres

### Edge Function Deploy
```bash
SUPABASE_ACCESS_TOKEN=sbp_YOUR_ACCESS_TOKEN_HERE npx supabase functions deploy FUNCTION_NAME --project-ref anfpgiaaobvmnqboqwdw
```

### Markalar (Brand ID'leri)
| Marka | ID | Renk |
|---|---|---|
| Benja | `00000000-0000-0000-0000-000000000001` | cyan |
| Dil | `00000000-0000-0000-0000-000000000003` | emerald |
| MarkBia | `c1fbe05a-a1f0-4811-af59-6aa8c79032ba` | amber |

### Claude Model Isimleri (GUNCELLENMIS)
- Batch analiz: `claude-haiku-4-5-20251001`
- Itiraz/yeniden analiz: `claude-sonnet-4-20250514`
- **ASLA `claude-3-haiku-20240307` KULLANMA** — bu model kaldirildi, 404 verir

### Timezone
- Tum tarihler Istanbul timezone (UTC+3)
- Edge function'larda `toLocaleString("tr-TR")` GUVENILIR DEGIL — manuel UTC+3 hesapla:
```ts
function toIstanbul(dateStr: string): Date {
  return new Date(new Date(dateStr).getTime() + 3 * 60 * 60 * 1000);
}
```

## Proje Yapisi

```
src/
  App.tsx              # Ana layout + router
  main.tsx             # Entry point + provider'lar
  index.css            # Tailwind + tema degiskenleri + animasyonlar
  lib/
    supabase.ts        # Supabase client
    auth.tsx           # Auth context (session, permission, MFA)
    brand.tsx          # Multi-brand context
    theme.tsx          # Dark/light tema context
    navigation.ts      # Sidebar navigasyon yapilandirmasi
    backgroundSync.ts  # Otomatik sync/analiz
    auditLogger.ts     # Audit log helper
    notifications.tsx  # Toast/modal context
    pushNotifications.ts # PWA push subscription yonetimi
    utils.ts           # Yardimci fonksiyonlar
  pages/               # 19 sayfa (lazy loaded)
  components/          # 15 tekrar kullanilabilir component
  types/index.ts       # TypeScript tipleri

supabase/functions/    # 22 edge function (Deno runtime)
public/                # PWA manifest, icons, service worker
```

## Edge Functions (Kritik Olanlar)

| Function | Gorev | Cron |
|---|---|---|
| `sync-livechat` | LiveChat API'den chat cekme | Her 2 dk |
| `analyze-chat` | Claude AI ile chat analizi | Her 2 dk |
| `send-telegram-alerts` | Dusuk puanli chatler icin TG bildirimi | Her 2 dk |
| `send-push-notifications` | Web push bildirimi | Her 2 dk |
| `send-finance-alerts` | Finans konulu chatler icin TG bildirimi | Her 2 dk |
| `detect-callbacks` | Geri arama talebi tespiti | Her 2 dk |
| `telegram-webhook` | Dil markasi TG bot komutlari | Webhook |
| `telegram-webhook-benja` | Benja markasi TG bot komutlari | Webhook |
| `telegram-webhook-markbia` | MarkBia markasi TG bot komutlari | Webhook |

## Veritabani Tablolari (Ana Olanlar)

- `chats` — Sync edilen chatler (analyzed, analyzing_at, brand_id)
- `chat_messages` — Chat mesajlari
- `chat_analysis` — AI analiz sonuclari (overall_score, sentiment, chat_topic)
- `personnel` — Temsilci bilgileri
- `personnel_daily_stats` — Gunluk performans istatistikleri
- `alerts` — Bildirimler (sent_to_telegram, push_sent_at)
- `brands` — Marka yapilandirmasi (API key'ler, TG token'lar)
- `sync_jobs` — Sync is kayitlari
- `analyze_runs` — Analiz calistirma kayitlari
- `push_subscriptions` — Web push abonelikleri
- `audit_logs` — Denetim kayitlari
- `system_config` — Sistem yapilandirmasi (VAPID key'ler, edge function URL)
- `settings` — Marka bazli ayarlar (API key'ler)

## Calisma Mantigi

1. **Sync:** `cron_sync_all_brands()` her 2 dk'da tum markalari tarar, `sync-livechat` edge function'i tetikler
2. **Analiz:** `analyze-chat` claim_unanalyzed_chats RPC ile 20 chat alir, Haiku ile analiz eder, puan <70 ise Sonnet ile yeniden analiz eder
3. **Alert:** Puan <60 veya sentiment negative ise `alerts` tablosuna yazar
4. **Telegram:** `send-telegram-alerts` unsent alert'leri marka bazli TG gruplarina gonderir
5. **Push:** `send-push-notifications` ayni alert'leri web push ile gonderir
6. **Finans:** `send-finance-alerts` finans konulu dusuk puanli chatler icin ayri TG grubuna gonderir

## Sync Overlap
- `last_sync_at` her zaman 15 dk geride tutulur (gecikmeli chat'leri yakalamak icin)
- Chunk window: 10 dk (normal), 24 saat (buyuk acik)

## Tema Sistemi
- Tailwind `darkMode: 'class'` stratejisi
- CSS custom properties `:root` (light) ve `.dark` (dark)
- LocalStorage key: `livetakip_theme`
- Sidebar her zaman dark kalir
- `index.html`'de flash onleme script'i var

## PWA
- VAPID Public Key: `BLKNZrWvOk3SfV2zIvvnoZpEjoLktA2HJc8qDcMvb3pR2rtD0c4hv8N5WPQ1rLDYX9r1AQ56ROWSVJFqzv1bNso`
- Service Worker: `public/sw.js`
- Manifest: `public/manifest.json`

## Komutlar
```bash
npm run dev        # Gelistirme sunucusu
npm run build      # Production build
npm run typecheck  # TypeScript kontrol
npm run lint       # ESLint
```

## Dikkat Edilecekler
- RLS (Row Level Security) tum tablolarda aktif — service_role key kullan edge function'larda
- `analyzing_at` kolonu analiz lock mekanizmasi — 10 dk sonra otomatik expire olur
- Her brand'in kendi `claude_api_key`, `livechat_api_key`, `telegram_*_bot_token` alanlari var
- Edge function'larda `import "jsr:@supabase/functions-js/edge-runtime.d.ts"` zorunlu
- Supabase client: `import { createClient } from "npm:@supabase/supabase-js@2.57.4"`
