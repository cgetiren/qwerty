/*
  # Callback Detection System

  ## Overview
  Adds a completely isolated callback/geri arama detection system that scans customer messages
  for callback requests. This system is fully independent from sync-livechat, analyze-chat,
  and all existing tables.

  ## New Tables

  ### 1. callback_settings
  Stores per-keyword-category configuration for callback detection.
  - `id` (uuid, primary key)
  - `category` (text) - e.g. 'explicit_callback', 'urgency', 'phone_number', 'dissatisfaction', 'follow_up'
  - `label` (text) - Human readable label in Turkish
  - `keywords` (text[]) - Array of trigger keywords/phrases
  - `send_telegram` (boolean) - Whether to send Telegram alert for this category
  - `min_urgency_for_alert` (text) - 'low' | 'medium' | 'high' | 'critical'
  - `is_active` (boolean) - Whether this category is enabled
  - `created_at` / `updated_at` (timestamptz)

  ### 2. callback_requests
  Stores detected callback requests from scanned chat messages.
  - `id` (uuid, primary key)
  - `chat_id` (text) - References chats.id (read-only relation, no FK constraint)
  - `agent_name` (text)
  - `customer_name` (text)
  - `detected_at` (timestamptz)
  - `chat_started_at` (timestamptz)
  - `matched_keywords` (text[])
  - `matched_categories` (text[])
  - `urgency` (text) - 'low' | 'medium' | 'high' | 'critical'
  - `sample_message` (text)
  - `phone_number` (text, nullable)
  - `status` (text) - 'pending' | 'in_progress' | 'resolved' | 'dismissed'
  - `telegram_sent` (boolean)
  - `created_at` / `updated_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Authenticated users can read/write callback_requests
  - Authenticated users can read/update callback_settings

  ## Notes
  - No existing tables are modified
  - No existing Edge Functions are modified
  - This is a fully additive, isolated feature
*/

-- ============================================================
-- TABLE: callback_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS callback_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  label text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  send_telegram boolean NOT NULL DEFAULT true,
  min_urgency_for_alert text NOT NULL DEFAULT 'high',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE callback_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read callback_settings"
  ON callback_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update callback_settings"
  ON callback_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- TABLE: callback_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE,
  agent_name text NOT NULL DEFAULT '',
  customer_name text NOT NULL DEFAULT '',
  detected_at timestamptz NOT NULL DEFAULT now(),
  chat_started_at timestamptz,
  matched_keywords text[] NOT NULL DEFAULT '{}',
  matched_categories text[] NOT NULL DEFAULT '{}',
  urgency text NOT NULL DEFAULT 'low',
  sample_message text NOT NULL DEFAULT '',
  phone_number text,
  status text NOT NULL DEFAULT 'pending',
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text,
  telegram_sent boolean NOT NULL DEFAULT false,
  telegram_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS callback_requests_status_idx ON callback_requests (status);
CREATE INDEX IF NOT EXISTS callback_requests_urgency_idx ON callback_requests (urgency);
CREATE INDEX IF NOT EXISTS callback_requests_detected_at_idx ON callback_requests (detected_at DESC);

ALTER TABLE callback_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read callback_requests"
  ON callback_requests FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert callback_requests"
  ON callback_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update callback_requests"
  ON callback_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- SEED: Default callback_settings categories
-- ============================================================
INSERT INTO callback_settings (category, label, keywords, send_telegram, min_urgency_for_alert, is_active)
VALUES
  (
    'explicit_callback',
    'Acik Geri Arama Istegi',
    ARRAY[
      'geri ara', 'geri arar misiniz', 'geri arayin', 'geri arayabilir misiniz',
      'telefon eder misiniz', 'telefon edin', 'arayabilir misiniz', 'beni arayin',
      'call back', 'callback', 'aramanizi istiyorum', 'telefon bekleyecegim'
    ],
    true,
    'medium',
    true
  ),
  (
    'urgency',
    'Acil / Onemli',
    ARRAY[
      'acil', 'acilen', 'ivedilikle', 'hemen', 'derhal', 'bir an once',
      'cok onemli', 'kritik', 'urgent', 'asap', 'bekleyemiyorum',
      'bekleyemem', 'zaman kaybi', 'hizli olmasi lazim'
    ],
    true,
    'high',
    true
  ),
  (
    'dissatisfaction',
    'Memnuniyetsizlik / Sikayet',
    ARRAY[
      'cok kotu', 'berbat', 'rezalet', 'skandal', 'inanilmaz',
      'bu nasil bir hizmet', 'bu kabul edilemez', 'yetersiz',
      'sikayetci olacagim', 'sikayetimi bildireyim',
      'yoneticiye bagla', 'yoneticinizi istiyorum', 'sorumluya bagla',
      'tatmin olmadim', 'memnun degilim', 'hayal kirikligi'
    ],
    true,
    'high',
    true
  ),
  (
    'follow_up',
    'Takip / Belirsiz Bekleyis',
    ARRAY[
      'ne zaman aranarsiniz', 'ne zaman doneceksiniz', 'ne zaman haber vereceksiniz',
      'haber bekliyorum', 'cevap bekliyorum', 'geri donus bekliyorum',
      'takip edecek misiniz', 'takip eder misiniz', 'kontrol eder misiniz',
      'guncelleme bekliyorum', 'sonucu ogrenmek istiyorum'
    ],
    true,
    'medium',
    true
  ),
  (
    'phone_number',
    'Telefon Numarasi Paylasimi',
    ARRAY[]::text[],
    true,
    'high',
    true
  )
ON CONFLICT (category) DO NOTHING;

-- ============================================================
-- FUNCTION: update updated_at on row change
-- ============================================================
CREATE OR REPLACE FUNCTION update_callback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS callback_settings_updated_at ON callback_settings;
CREATE TRIGGER callback_settings_updated_at
  BEFORE UPDATE ON callback_settings
  FOR EACH ROW EXECUTE FUNCTION update_callback_updated_at();

DROP TRIGGER IF EXISTS callback_requests_updated_at ON callback_requests;
CREATE TRIGGER callback_requests_updated_at
  BEFORE UPDATE ON callback_requests
  FOR EACH ROW EXECUTE FUNCTION update_callback_updated_at();
