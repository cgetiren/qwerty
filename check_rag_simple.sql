-- Basit RAG Kontrol (sadece SELECT'ler)

-- 1. Extension var mı?
SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') 
    THEN '✅ pgvector extension KURULU'
    ELSE '❌ pgvector extension YOK'
  END as status_1;

-- 2. Tablo var mı?
SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'objection_embeddings') 
    THEN '✅ objection_embeddings tablosu OLUŞTURULDU'
    ELSE '❌ objection_embeddings tablosu YOK'
  END as status_2;

-- 3. Fonksiyonlar var mı?
SELECT 
  COUNT(*) as fonksiyon_sayisi,
  CASE 
    WHEN COUNT(*) = 2 
    THEN '✅ Her iki fonksiyon HAZIR'
    ELSE '❌ Fonksiyonlar eksik'
  END as status_3
FROM information_schema.routines
WHERE routine_name IN ('match_similar_objections', 'increment_objection_usage')
  AND routine_schema = 'public';

-- 4. Vector index var mı?
SELECT 
  COUNT(*) as vector_index_sayisi,
  CASE 
    WHEN COUNT(*) > 0 
    THEN '✅ Vector index OLUŞTURULDU'
    ELSE '❌ Vector index YOK'
  END as status_4
FROM pg_indexes
WHERE tablename = 'objection_embeddings'
  AND indexname LIKE '%vector%';

-- 5. Embedding kolonu doğru tipte mi?
SELECT 
  column_name,
  udt_name,
  CASE 
    WHEN udt_name = 'vector' 
    THEN '✅ Vector kolonu DOĞRU tipte'
    ELSE '❌ Vector kolonu YANLIŞ tip'
  END as status_5
FROM information_schema.columns
WHERE table_name = 'objection_embeddings'
  AND column_name = 'embedding';

-- FINAL ÖZET
SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector') > 0
     AND (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'objection_embeddings') > 0
     AND (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name IN ('match_similar_objections', 'increment_objection_usage')) = 2
    THEN '🎉 RAG SİSTEM TAMAMEN HAZIR - Edge function deploy yapabilirsin!'
    ELSE '⚠️ RAG sistem eksik - yukarıdaki hataları kontrol et'
  END as FINAL_DURUM;
