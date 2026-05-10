-- Fix: callback_call_logs tablosuna brand_id ekle ve RLS policy'lerini güncelle
-- Bu tablo multi-brand desteği sırasında atlanmıştı

-- 1. brand_id sütunu ekle
ALTER TABLE callback_call_logs
ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;

-- 2. Mevcut kayıtları callback_requests üzerinden brand_id ile doldur
UPDATE callback_call_logs cl
SET brand_id = cr.brand_id
FROM callback_requests cr
WHERE cl.callback_request_id = cr.id
  AND cl.brand_id IS NULL;

-- 3. brand_id index ekle
CREATE INDEX IF NOT EXISTS idx_callback_call_logs_brand_id
ON callback_call_logs(brand_id);

-- 4. Mevcut zayıf RLS policy'lerini kaldır ve yenilerini oluştur
DROP POLICY IF EXISTS "Authenticated users can read call logs" ON callback_call_logs;
DROP POLICY IF EXISTS "Authenticated users can insert call logs" ON callback_call_logs;
DROP POLICY IF EXISTS "Users can update their own call logs" ON callback_call_logs;
DROP POLICY IF EXISTS "Users can delete their own call logs" ON callback_call_logs;

-- Brand-scoped RLS policy'leri
CREATE POLICY "Brand members can read call logs"
ON callback_call_logs FOR SELECT
TO authenticated
USING (
  brand_id IS NULL
  OR EXISTS (
    SELECT 1 FROM brand_members bm
    WHERE bm.brand_id = callback_call_logs.brand_id
      AND bm.user_id = auth.uid()
  )
);

CREATE POLICY "Brand members can insert call logs"
ON callback_call_logs FOR INSERT
TO authenticated
WITH CHECK (
  brand_id IS NULL
  OR EXISTS (
    SELECT 1 FROM brand_members bm
    WHERE bm.brand_id = callback_call_logs.brand_id
      AND bm.user_id = auth.uid()
  )
);

CREATE POLICY "Brand members can update call logs"
ON callback_call_logs FOR UPDATE
TO authenticated
USING (
  agent_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.is_founder = true
  )
);

CREATE POLICY "Brand members can delete call logs"
ON callback_call_logs FOR DELETE
TO authenticated
USING (
  agent_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.is_founder = true
  )
);

-- Service role full access
CREATE POLICY "Service role full access to callback_call_logs"
ON callback_call_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Eksik indexler ekle
CREATE INDEX IF NOT EXISTS idx_callback_requests_assigned_to
ON callback_requests(assigned_to_user_id);

CREATE INDEX IF NOT EXISTS idx_callback_requests_brand_id
ON callback_requests(brand_id);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_brand_id
ON sync_jobs(brand_id);

CREATE INDEX IF NOT EXISTS idx_coaching_feedbacks_sent_by
ON coaching_feedbacks(sent_by);
