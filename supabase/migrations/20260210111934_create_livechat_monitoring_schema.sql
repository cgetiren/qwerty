/*
  # LiveChat Quality Monitoring System Schema

  ## Overview
  Complete database schema for LiveChat quality control and analysis system with personnel tracking, AI analysis, and alerting.

  ## New Tables

  ### 1. `settings`
  Configuration and API keys storage
  - `id` (uuid, primary key)
  - `chatgpt_api_key` (text) - ChatGPT API key for analysis
  - `livechat_api_key` (text) - LiveChat API key
  - `telegram_bot_token` (text) - Telegram bot token
  - `telegram_chat_id` (text) - Telegram group ID
  - `polling_interval` (integer) - Polling interval in seconds
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. `personnel`
  Personnel/agent information and statistics
  - `id` (uuid, primary key)
  - `name` (text) - Agent name
  - `email` (text) - Agent email
  - `total_chats` (integer) - Total number of chats handled
  - `average_score` (numeric) - Average quality score
  - `warning_count` (integer) - Number of warnings received
  - `strong_topics` (jsonb) - Topics where agent performs well
  - `weak_topics` (jsonb) - Topics where agent needs improvement
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. `chats`
  Chat records from LiveChat
  - `id` (text, primary key) - Chat ID from LiveChat
  - `agent_name` (text) - Agent handling the chat
  - `customer_name` (text) - Customer name
  - `created_at` (timestamptz) - Chat creation time
  - `ended_at` (timestamptz) - Chat end time
  - `duration_seconds` (integer) - Chat duration
  - `first_response_time` (integer) - Time to first response in seconds
  - `message_count` (integer) - Number of messages
  - `chat_data` (jsonb) - Full chat data from API
  - `status` (text) - Chat status (active, archived, etc.)
  - `analyzed` (boolean) - Whether chat has been analyzed
  - `synced_at` (timestamptz) - When chat was synced from API

  ### 4. `chat_messages`
  Individual messages from chats
  - `id` (uuid, primary key)
  - `chat_id` (text, foreign key) - Reference to chats table
  - `message_id` (text) - Message ID from LiveChat
  - `author_id` (text) - Author ID
  - `author_type` (text) - customer or agent
  - `text` (text) - Message content
  - `created_at` (timestamptz) - Message timestamp
  - `is_system` (boolean) - System message flag

  ### 5. `chat_analysis`
  AI analysis results for chats
  - `id` (uuid, primary key)
  - `chat_id` (text, foreign key) - Reference to chats table
  - `analysis_date` (timestamptz) - When analysis was performed
  - `overall_score` (numeric) - Overall quality score (0-100)
  - `language_compliance` (jsonb) - Language and tone analysis
  - `quality_metrics` (jsonb) - Quality assessment
  - `performance_metrics` (jsonb) - Performance measurements
  - `issues_detected` (jsonb) - Detected problems
  - `positive_aspects` (jsonb) - Positive findings
  - `recommendations` (text) - Improvement suggestions
  - `sentiment` (text) - positive, neutral, negative
  - `requires_attention` (boolean) - Flag for manager review
  - `ai_summary` (text) - AI-generated summary

  ### 6. `alerts`
  Alerts sent to Telegram
  - `id` (uuid, primary key)
  - `chat_id` (text, foreign key) - Reference to chats table
  - `analysis_id` (uuid, foreign key) - Reference to chat_analysis table
  - `alert_type` (text) - Type of alert (quality_issue, sla_violation, etc.)
  - `severity` (text) - low, medium, high, critical
  - `message` (text) - Alert message
  - `sent_to_telegram` (boolean) - Whether sent to Telegram
  - `telegram_message_id` (text) - Telegram message ID
  - `created_at` (timestamptz)

  ### 7. `personnel_daily_stats`
  Daily statistics per personnel
  - `id` (uuid, primary key)
  - `personnel_name` (text)
  - `date` (date) - Statistics date
  - `total_chats` (integer)
  - `average_score` (numeric)
  - `total_issues` (integer)
  - `average_response_time` (integer)
  - `average_resolution_time` (integer)

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated access
*/

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatgpt_api_key text,
  livechat_api_key text DEFAULT 'EdU7bHw1HaSw05dfRj8jnCc7N4lGZhnUu0w8NMHt8oA',
  telegram_bot_token text DEFAULT '7578705822:AAEF7N3j9XKVBJxa1fS6Xfs_yInY_30yIp0',
  telegram_chat_id text DEFAULT '-1003791941564',
  polling_interval integer DEFAULT 60,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create personnel table
CREATE TABLE IF NOT EXISTS personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  email text,
  total_chats integer DEFAULT 0,
  average_score numeric DEFAULT 0,
  warning_count integer DEFAULT 0,
  strong_topics jsonb DEFAULT '[]'::jsonb,
  weak_topics jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id text PRIMARY KEY,
  agent_name text,
  customer_name text,
  created_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  first_response_time integer,
  message_count integer DEFAULT 0,
  chat_data jsonb,
  status text DEFAULT 'active',
  analyzed boolean DEFAULT false,
  synced_at timestamptz DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text REFERENCES chats(id) ON DELETE CASCADE,
  message_id text,
  author_id text,
  author_type text,
  text text,
  created_at timestamptz,
  is_system boolean DEFAULT false
);

-- Create chat_analysis table
CREATE TABLE IF NOT EXISTS chat_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text REFERENCES chats(id) ON DELETE CASCADE,
  analysis_date timestamptz DEFAULT now(),
  overall_score numeric,
  language_compliance jsonb,
  quality_metrics jsonb,
  performance_metrics jsonb,
  issues_detected jsonb,
  positive_aspects jsonb,
  recommendations text,
  sentiment text,
  requires_attention boolean DEFAULT false,
  ai_summary text
);

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text REFERENCES chats(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES chat_analysis(id) ON DELETE CASCADE,
  alert_type text,
  severity text,
  message text,
  sent_to_telegram boolean DEFAULT false,
  telegram_message_id text,
  created_at timestamptz DEFAULT now()
);

-- Create personnel_daily_stats table
CREATE TABLE IF NOT EXISTS personnel_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_name text,
  date date DEFAULT CURRENT_DATE,
  total_chats integer DEFAULT 0,
  average_score numeric DEFAULT 0,
  total_issues integer DEFAULT 0,
  average_response_time integer DEFAULT 0,
  average_resolution_time integer DEFAULT 0,
  UNIQUE(personnel_name, date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chats_agent ON chats(agent_name);
CREATE INDEX IF NOT EXISTS idx_chats_analyzed ON chats(analyzed);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_analysis_chat_id ON chat_analysis(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_analysis_requires_attention ON chat_analysis(requires_attention);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personnel_daily_stats_date ON personnel_daily_stats(date DESC);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel_daily_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is an internal monitoring tool)
CREATE POLICY "Allow all access to settings"
  ON settings FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to personnel"
  ON personnel FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to chats"
  ON chats FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to chat_messages"
  ON chat_messages FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to chat_analysis"
  ON chat_analysis FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to alerts"
  ON alerts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to personnel_daily_stats"
  ON personnel_daily_stats FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default settings
INSERT INTO settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;