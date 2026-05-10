/*
  # Update RLS Policies for Brand Isolation

  ## Overview
  Updates all data table RLS policies to enforce brand-level data isolation.
  Users can only access data belonging to brands they are members of.
  Founders can access all brand data.

  ## Changes
  - Drops old permissive "authenticated users can do everything" policies
  - Adds new brand-scoped policies using user_belongs_to_brand() helper
  - Covers: chats, chat_analysis, personnel, personnel_daily_stats,
    bonus_rules, bonus_calculations, bonus_records, coaching_feedbacks,
    alerts, callback_requests, callback_settings, settings, system_config

  ## Security
  - All data access now requires brand membership
  - Founders bypass brand membership check
*/

-- ============================================================
-- CHATS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read chats" ON chats;
DROP POLICY IF EXISTS "Authenticated users can insert chats" ON chats;
DROP POLICY IF EXISTS "Authenticated users can update chats" ON chats;
DROP POLICY IF EXISTS "Authenticated users can delete chats" ON chats;
DROP POLICY IF EXISTS "Allow authenticated users to read chats" ON chats;
DROP POLICY IF EXISTS "Allow authenticated users to insert chats" ON chats;
DROP POLICY IF EXISTS "Allow authenticated users to update chats" ON chats;
DROP POLICY IF EXISTS "Allow authenticated users to delete chats" ON chats;

CREATE POLICY "Brand members can read chats"
  ON chats FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert chats"
  ON chats FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update chats"
  ON chats FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete chats"
  ON chats FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- CHAT_MESSAGES TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can insert chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can update chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated users can delete chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow authenticated users to read chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow authenticated users to insert chat_messages" ON chat_messages;

CREATE POLICY "Brand members can read chat_messages"
  ON chat_messages FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert chat_messages"
  ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update chat_messages"
  ON chat_messages FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete chat_messages"
  ON chat_messages FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- CHAT_ANALYSIS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Authenticated users can insert chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Authenticated users can update chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Authenticated users can delete chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Allow authenticated users to read chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Allow authenticated users to insert chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Allow authenticated users to update chat_analysis" ON chat_analysis;
DROP POLICY IF EXISTS "Allow authenticated users to delete chat_analysis" ON chat_analysis;

CREATE POLICY "Brand members can read chat_analysis"
  ON chat_analysis FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert chat_analysis"
  ON chat_analysis FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update chat_analysis"
  ON chat_analysis FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete chat_analysis"
  ON chat_analysis FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- PERSONNEL TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read personnel" ON personnel;
DROP POLICY IF EXISTS "Authenticated users can insert personnel" ON personnel;
DROP POLICY IF EXISTS "Authenticated users can update personnel" ON personnel;
DROP POLICY IF EXISTS "Authenticated users can delete personnel" ON personnel;
DROP POLICY IF EXISTS "Allow authenticated users to read personnel" ON personnel;
DROP POLICY IF EXISTS "Allow authenticated users to insert personnel" ON personnel;
DROP POLICY IF EXISTS "Allow authenticated users to update personnel" ON personnel;
DROP POLICY IF EXISTS "Allow authenticated users to delete personnel" ON personnel;

CREATE POLICY "Brand members can read personnel"
  ON personnel FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert personnel"
  ON personnel FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update personnel"
  ON personnel FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete personnel"
  ON personnel FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- PERSONNEL_DAILY_STATS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read personnel_daily_stats" ON personnel_daily_stats;
DROP POLICY IF EXISTS "Authenticated users can insert personnel_daily_stats" ON personnel_daily_stats;
DROP POLICY IF EXISTS "Authenticated users can update personnel_daily_stats" ON personnel_daily_stats;
DROP POLICY IF EXISTS "Allow authenticated users to read personnel_daily_stats" ON personnel_daily_stats;
DROP POLICY IF EXISTS "Allow authenticated users to insert personnel_daily_stats" ON personnel_daily_stats;
DROP POLICY IF EXISTS "Allow authenticated users to update personnel_daily_stats" ON personnel_daily_stats;

CREATE POLICY "Brand members can read personnel_daily_stats"
  ON personnel_daily_stats FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert personnel_daily_stats"
  ON personnel_daily_stats FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update personnel_daily_stats"
  ON personnel_daily_stats FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete personnel_daily_stats"
  ON personnel_daily_stats FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- BONUS_RULES TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read bonus_rules" ON bonus_rules;
DROP POLICY IF EXISTS "Authenticated users can insert bonus_rules" ON bonus_rules;
DROP POLICY IF EXISTS "Authenticated users can update bonus_rules" ON bonus_rules;
DROP POLICY IF EXISTS "Authenticated users can delete bonus_rules" ON bonus_rules;
DROP POLICY IF EXISTS "Allow authenticated users to read bonus_rules" ON bonus_rules;

CREATE POLICY "Brand members can read bonus_rules"
  ON bonus_rules FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert bonus_rules"
  ON bonus_rules FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update bonus_rules"
  ON bonus_rules FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete bonus_rules"
  ON bonus_rules FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- BONUS_CALCULATIONS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read bonus_calculations" ON bonus_calculations;
DROP POLICY IF EXISTS "Authenticated users can insert bonus_calculations" ON bonus_calculations;
DROP POLICY IF EXISTS "Authenticated users can update bonus_calculations" ON bonus_calculations;
DROP POLICY IF EXISTS "Authenticated users can delete bonus_calculations" ON bonus_calculations;
DROP POLICY IF EXISTS "Allow authenticated users to read bonus_calculations" ON bonus_calculations;

CREATE POLICY "Brand members can read bonus_calculations"
  ON bonus_calculations FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert bonus_calculations"
  ON bonus_calculations FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update bonus_calculations"
  ON bonus_calculations FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete bonus_calculations"
  ON bonus_calculations FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- BONUS_RECORDS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read bonus_records" ON bonus_records;
DROP POLICY IF EXISTS "Authenticated users can insert bonus_records" ON bonus_records;
DROP POLICY IF EXISTS "Authenticated users can update bonus_records" ON bonus_records;
DROP POLICY IF EXISTS "Authenticated users can delete bonus_records" ON bonus_records;
DROP POLICY IF EXISTS "Allow authenticated users to read bonus_records" ON bonus_records;

CREATE POLICY "Brand members can read bonus_records"
  ON bonus_records FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert bonus_records"
  ON bonus_records FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update bonus_records"
  ON bonus_records FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete bonus_records"
  ON bonus_records FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- COACHING_FEEDBACKS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read coaching_feedbacks" ON coaching_feedbacks;
DROP POLICY IF EXISTS "Authenticated users can insert coaching_feedbacks" ON coaching_feedbacks;
DROP POLICY IF EXISTS "Authenticated users can update coaching_feedbacks" ON coaching_feedbacks;
DROP POLICY IF EXISTS "Authenticated users can delete coaching_feedbacks" ON coaching_feedbacks;
DROP POLICY IF EXISTS "Allow authenticated users to read coaching_feedbacks" ON coaching_feedbacks;
DROP POLICY IF EXISTS "Users can manage their own coaching feedbacks" ON coaching_feedbacks;

CREATE POLICY "Brand members can read coaching_feedbacks"
  ON coaching_feedbacks FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert coaching_feedbacks"
  ON coaching_feedbacks FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id) AND sent_by = auth.uid());

CREATE POLICY "Users can update own coaching_feedbacks"
  ON coaching_feedbacks FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id) AND sent_by = auth.uid())
  WITH CHECK (user_belongs_to_brand(brand_id) AND sent_by = auth.uid());

CREATE POLICY "Users can delete own coaching_feedbacks"
  ON coaching_feedbacks FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id) AND sent_by = auth.uid());

-- ============================================================
-- ALERTS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read alerts" ON alerts;
DROP POLICY IF EXISTS "Authenticated users can insert alerts" ON alerts;
DROP POLICY IF EXISTS "Authenticated users can update alerts" ON alerts;
DROP POLICY IF EXISTS "Allow authenticated users to read alerts" ON alerts;

CREATE POLICY "Brand members can read alerts"
  ON alerts FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert alerts"
  ON alerts FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update alerts"
  ON alerts FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

-- ============================================================
-- CALLBACK_REQUESTS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read callback_requests" ON callback_requests;
DROP POLICY IF EXISTS "Authenticated users can insert callback_requests" ON callback_requests;
DROP POLICY IF EXISTS "Authenticated users can update callback_requests" ON callback_requests;
DROP POLICY IF EXISTS "Authenticated users can delete callback_requests" ON callback_requests;
DROP POLICY IF EXISTS "Allow authenticated users to read callback_requests" ON callback_requests;

CREATE POLICY "Brand members can read callback_requests"
  ON callback_requests FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert callback_requests"
  ON callback_requests FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update callback_requests"
  ON callback_requests FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete callback_requests"
  ON callback_requests FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- CALLBACK_SETTINGS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read callback_settings" ON callback_settings;
DROP POLICY IF EXISTS "Authenticated users can insert callback_settings" ON callback_settings;
DROP POLICY IF EXISTS "Authenticated users can update callback_settings" ON callback_settings;
DROP POLICY IF EXISTS "Authenticated users can delete callback_settings" ON callback_settings;
DROP POLICY IF EXISTS "Allow authenticated users to read callback_settings" ON callback_settings;

CREATE POLICY "Brand members can read callback_settings"
  ON callback_settings FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert callback_settings"
  ON callback_settings FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update callback_settings"
  ON callback_settings FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can delete callback_settings"
  ON callback_settings FOR DELETE TO authenticated
  USING (user_belongs_to_brand(brand_id));

-- ============================================================
-- SETTINGS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read settings" ON settings;
DROP POLICY IF EXISTS "Authenticated users can insert settings" ON settings;
DROP POLICY IF EXISTS "Authenticated users can update settings" ON settings;
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON settings;
DROP POLICY IF EXISTS "Allow authenticated users to update settings" ON settings;

CREATE POLICY "Brand members can read settings"
  ON settings FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert settings"
  ON settings FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update settings"
  ON settings FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

-- ============================================================
-- SYSTEM_CONFIG TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read system_config" ON system_config;
DROP POLICY IF EXISTS "Authenticated users can insert system_config" ON system_config;
DROP POLICY IF EXISTS "Authenticated users can update system_config" ON system_config;
DROP POLICY IF EXISTS "Allow authenticated users to read system_config" ON system_config;
DROP POLICY IF EXISTS "Allow authenticated users to update system_config" ON system_config;

CREATE POLICY "Brand members can read system_config"
  ON system_config FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert system_config"
  ON system_config FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update system_config"
  ON system_config FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));

-- ============================================================
-- SYNC_JOBS TABLE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read sync_jobs" ON sync_jobs;
DROP POLICY IF EXISTS "Authenticated users can insert sync_jobs" ON sync_jobs;
DROP POLICY IF EXISTS "Authenticated users can update sync_jobs" ON sync_jobs;
DROP POLICY IF EXISTS "Allow authenticated users to read sync_jobs" ON sync_jobs;

CREATE POLICY "Brand members can read sync_jobs"
  ON sync_jobs FOR SELECT TO authenticated
  USING (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can insert sync_jobs"
  ON sync_jobs FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_brand(brand_id));

CREATE POLICY "Brand members can update sync_jobs"
  ON sync_jobs FOR UPDATE TO authenticated
  USING (user_belongs_to_brand(brand_id))
  WITH CHECK (user_belongs_to_brand(brand_id));
