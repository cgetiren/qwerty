-- Tek sorguda tüm kontrolü yap

-- Extension kontrolü
DO $$
BEGIN
  RAISE NOTICE '=== 1. PGVECTOR EXTENSION ===';
END $$;

SELECT 
  extname as extension,
  extversion as version
FROM pg_extension 
WHERE extname = 'vector';

-- Tablo kontrolü
DO $$
BEGIN
  RAISE NOTICE '=== 2. OBJECTION_EMBEDDINGS TABLOSU ===';
END $$;

SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'objection_embeddings'
) as table_exists;

-- Kolon sayısı
SELECT COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'objection_embeddings';

-- Fonksiyon kontrolü
DO $$
BEGIN
  RAISE NOTICE '=== 3. FONKSIYONLAR ===';
END $$;

SELECT 
  routine_name as function_name
FROM information_schema.routines
WHERE routine_name IN ('match_similar_objections', 'increment_objection_usage')
  AND routine_schema = 'public';

-- Index kontrolü
DO $$
BEGIN
  RAISE NOTICE '=== 4. VECTOR INDEX ===';
END $$;

SELECT 
  indexname
FROM pg_indexes
WHERE tablename = 'objection_embeddings'
  AND indexname LIKE '%vector%';

-- Basit test - boş tablo kontrolü
DO $$
BEGIN
  RAISE NOTICE '=== 5. TABLO TEST ===';
END $$;

SELECT COUNT(*) as embedding_count
FROM public.objection_embeddings;

-- ÖZET
DO $$
DECLARE
  ext_exists BOOLEAN;
  tbl_exists BOOLEAN;
  fn_count INTEGER;
  idx_count INTEGER;
BEGIN
  RAISE NOTICE '=== ÖZET ===';
  
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') INTO ext_exists;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'objection_embeddings') INTO tbl_exists;
  SELECT COUNT(*) INTO fn_count FROM information_schema.routines WHERE routine_name IN ('match_similar_objections', 'increment_objection_usage');
  SELECT COUNT(*) INTO idx_count FROM pg_indexes WHERE tablename = 'objection_embeddings';
  
  RAISE NOTICE 'pgvector extension: %', CASE WHEN ext_exists THEN '✅ OK' ELSE '❌ MISSING' END;
  RAISE NOTICE 'objection_embeddings table: %', CASE WHEN tbl_exists THEN '✅ OK' ELSE '❌ MISSING' END;
  RAISE NOTICE 'Functions (2 expected): % %', fn_count, CASE WHEN fn_count = 2 THEN '✅ OK' ELSE '❌ MISSING' END;
  RAISE NOTICE 'Indexes: % %', idx_count, CASE WHEN idx_count >= 4 THEN '✅ OK' ELSE '⚠️ CHECK' END;
  
  IF ext_exists AND tbl_exists AND fn_count = 2 THEN
    RAISE NOTICE '🎉 RAG SYSTEM READY!';
  ELSE
    RAISE NOTICE '❌ RAG SYSTEM INCOMPLETE - Check errors above';
  END IF;
END $$;
