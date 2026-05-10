/*
  # Dil Brand Integration Setup

  ## Summary
  Creates and fully configures the "Dil" brand with LiveChat API integration,
  Telegram alert bot and callback bot tokens, standard callback detection
  categories, and brand membership for all founder users.

  ## Changes

  ### 1. brands table
  - Inserts the "Dil" brand with fixed UUID 00000000-0000-0000-0000-000000000003
  - livechat_api_key: -B9pr7nlyolcElvV67CH61OaWzbs2eWZLJdQXpejFXE
  - telegram_alert_bot_token: 7759543109:AAHawZK1g7awEuaWMRVGrYiXfqkKM8az6Ko (Dil_live_bot)
  - telegram_callback_bot_token: 8729817564:AAHYWlOATf80ufXDEm60nxneI19Dq381H18 (Dil_Call_Bot)
  - livechat_url: NULL (will use default https://livechat.systemtest.store until configured)
  - telegram_alert_chat_id and telegram_callback_chat_id must be set via UI
    after adding the bots to their respective Telegram groups.

  ### 2. settings table
  - Creates a settings row for Dil (no unique constraint; guarded by NOT EXISTS)

  ### 3. callback_settings table
  - Copies the five standard callback categories from MarkBia to Dil

  ### 4. brand_members table
  - Adds all is_founder users as active members of the Dil brand

  ## Notes
  1. The universal cron cron_sync_all_brands() auto-picks up Dil on the next cycle.
  2. send-telegram-alerts and callback-telegram-webhook are already brand-aware —
     no new edge functions needed.
  3. Telegram chat_ids must be configured once the bots join their groups.
*/

-- ============================================================
-- 1. CREATE DIL BRAND RECORD
-- ============================================================
INSERT INTO brands (
  id,
  name,
  slug,
  color,
  is_active,
  is_system,
  is_default,
  livechat_api_key,
  telegram_alert_bot_token,
  telegram_callback_bot_token,
  created_at
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'Dil',
  'dil',
  '#0ea5e9',
  true,
  false,
  false,
  '-B9pr7nlyolcElvV67CH61OaWzbs2eWZLJdQXpejFXE',
  '7759543109:AAHawZK1g7awEuaWMRVGrYiXfqkKM8az6Ko',
  '8729817564:AAHYWlOATf80ufXDEm60nxneI19Dq381H18',
  now()
)
ON CONFLICT (id) DO UPDATE
  SET
    livechat_api_key            = EXCLUDED.livechat_api_key,
    telegram_alert_bot_token    = EXCLUDED.telegram_alert_bot_token,
    telegram_callback_bot_token = EXCLUDED.telegram_callback_bot_token,
    is_active                   = true;

-- ============================================================
-- 2. CREATE SETTINGS ROW FOR DIL
-- ============================================================
INSERT INTO settings (brand_id, livechat_api_key, polling_interval)
SELECT
  '00000000-0000-0000-0000-000000000003',
  '-B9pr7nlyolcElvV67CH61OaWzbs2eWZLJdQXpejFXE',
  60
WHERE NOT EXISTS (
  SELECT 1 FROM settings WHERE brand_id = '00000000-0000-0000-0000-000000000003'
);

-- ============================================================
-- 3. COPY CALLBACK CATEGORIES FROM MARKBIA TO DIL
-- ============================================================
INSERT INTO callback_settings (brand_id, category, label, keywords, send_telegram, min_urgency_for_alert, is_active)
VALUES
  (
    '00000000-0000-0000-0000-000000000003',
    'explicit_callback',
    'Acik Geri Arama Istegi',
    ARRAY['beni arayın','geri arayın','telefon edin','aranmak istiyorum','beni ara','numaram şu','telefonla ulaşın','sesli görüşme istiyorum','aranmayı bekliyorum','telefon numaramı veriyorum','bana ulaşın','iletişime geçin','whatsapp''tan arayın','telegram''dan arayın','numaramı bırakıyorum','arayabilir misiniz','ne zaman ararsınız'],
    true, 'low', true
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'follow_up',
    'Takip / Belirsiz Bekleyis',
    ARRAY['ne zaman çözülecek','ne zaman halledilecek','ne zaman döneceksiniz','ne zaman haber vereceksiniz','haber bekliyorum','cevap bekliyorum','güncelleme bekliyorum','sonucu öğrenmek istiyorum','hala bekliyorum','kaç gündür bekliyorum','kimse dönmedi','sonuç ne oldu','çekim ne zaman onaylanacak','ne zaman yatar','kaç gün sürecek','takipteyim','bilgi bekliyorum','gelişme var mı','durum ne','neden bilgi verilmiyor','söz verdiniz yapmadınız','arayacaktınız aramadınız','işlem ne durumda','süreç nerede'],
    true, 'low', true
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'phone_number',
    'Telefon Numarasi Paylasimi',
    ARRAY[]::text[],
    true, 'low', false
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'dissatisfaction',
    'Memnuniyetsizlik / Sikayet',
    ARRAY['memnun değilim','mutsuzum','berbat','rezalet','saçmalık','kabul edilemez','skandal','iğrenç','berbat hizmet','kötü hizmet','beğenmedim','hoşnut değilim','pişmanım','keşke hiç','en kötü','berbat site','güvenilmez','sahte','scam','dolandırıcı','hırsız','sahtekarlık','batıl','fake','yazıklar olsun','utanın','vicdansız','boş site','çöp site','para tuzağı','kazandırmıyor','hep kaybediyorum','hileli','oyunlar hileli','adil değil','haksızlık','mağdurum'],
    true, 'low', true
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'urgency',
    'Acil / Onemli',
    ARRAY['acil','acilen','çok acil','ivedi','hemen','şimdi hemen','derhal','bekleyemem','çok önemli','kritik','son derece önemli','paramı şimdi istiyorum','hemen çekim','anında','bir an önce','vakit yok','sabrım kalmadı','patlayacağım','çıldıracağım','deli olacağım','dayanamıyorum','son kez söylüyorum','son uyarım','mahkemeye vereceğim','avukatımı arayacağım','şikayet edeceğim','sosyal medyaya yazacağım','herkese anlatacağım','forumlara yazacağım','şikayetvar','lisans kurumuna bildireceğim','yöneticiyle görüşmek istiyorum','yetkili birini bağlayın','müdürünüzü istiyorum'],
    true, 'low', true
  )
ON CONFLICT (brand_id, category) DO NOTHING;

-- ============================================================
-- 4. ADD ALL FOUNDER USERS AS BRAND MEMBERS
-- ============================================================
INSERT INTO brand_members (brand_id, user_id, is_active)
SELECT
  '00000000-0000-0000-0000-000000000003',
  id,
  true
FROM user_profiles
WHERE is_founder = true
ON CONFLICT (brand_id, user_id) DO UPDATE SET is_active = true;
