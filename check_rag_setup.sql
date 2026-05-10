-- RAG Sistemi Kurulum Kontrolü

-- 1. pgvector extension kontrol
SELECT 
  extname as "Extension",
  extversion as "Version"
FROM pg_extension 
WHERE extname = 'vector';

-- 2. objection_embeddings tablosu kontrol
SELECT 
  table_name,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'objection_embeddings'
ORDER BY ordinal_position;

-- 3. Fonksiyonlar kontrol
SELECT 
  routine_name as "Function Name",
  routine_type as "Type"
FROM information_schema.routines
WHERE routine_name IN ('match_similar_objections', 'increment_objection_usage')
  AND routine_schema = 'public';

-- 4. Index kontrol
SELECT 
  indexname as "Index Name",
  indexdef as "Definition"
FROM pg_indexes
WHERE tablename = 'objection_embeddings';

-- 5. RLS policy kontrol
SELECT 
  policyname as "Policy Name",
  cmd as "Command"
FROM pg_policies
WHERE tablename = 'objection_embeddings';
