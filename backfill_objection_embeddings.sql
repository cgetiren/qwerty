-- Backfill: Geçmiş tüm itirazları RAG sistemine aktar
-- Bu script mevcut objection_logs kayıtlarını objection_embeddings'e dönüştürür

-- 1. Önce kaç itiraz var kontrol et
SELECT 
  COUNT(*) as total_objections,
  COUNT(CASE WHEN new_score IS NOT NULL THEN 1 END) as completed_objections,
  COUNT(CASE WHEN embedding_id IS NULL AND new_score IS NOT NULL THEN 1 END) as needs_embedding
FROM objection_logs;

-- 2. Embedding'e çevrilecek itirazları göster
SELECT 
  id,
  objection_reason,
  original_score,
  new_score,
  ABS(new_score - original_score) as score_diff,
  brand_id,
  created_at
FROM objection_logs
WHERE new_score IS NOT NULL 
  AND embedding_id IS NULL
ORDER BY created_at DESC
LIMIT 10;

-- NOT: Aşağıdaki SQL direkt embedding oluşturamaz çünkü
-- pgvector embedding oluşturmak için external API gerekir (Hugging Face)
-- Bu yüzden iki yöntem var:

-- YÖNTEM 1: Edge Function Loop (Önerilen)
-- Bunu Supabase SQL Editor'da ÇALIŞTIRMA!
-- Bunun yerine aşağıdaki JavaScript/TypeScript script'i kullan

-- YÖNTEM 2: Manuel Insert (Pseudo-embedding ile - test için)
-- Gerçek embedding yerine basit hash-based vector
-- SADECE TEST İÇİN - production'da kullanma!

/*
DO $$
DECLARE
  objection_record RECORD;
  pseudo_embedding vector(384);
BEGIN
  FOR objection_record IN 
    SELECT * FROM objection_logs 
    WHERE new_score IS NOT NULL 
      AND embedding_id IS NULL
    LIMIT 100 -- İlk 100 kayıt
  LOOP
    -- Pseudo-embedding oluştur (gerçek değil, sadece placeholder)
    -- Gerçek embedding için edge function kullan!
    
    RAISE NOTICE 'Processing objection: %', objection_record.id;
    
    -- Bu kısım çalışmaz çünkü SQL'de embedding API çağrısı yapamayız
    -- Edge function gerekli!
    
  END LOOP;
END $$;
*/

-- ÖZET:
-- ✅ Yukarıdaki SELECT'ler ile kaç itiraz var gör
-- ❌ SQL ile direkt embedding oluşturulamaz
-- ✅ Backfill için TypeScript script gerekli (aşağıda)
