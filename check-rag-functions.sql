-- Check if RPC functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('match_similar_objections', 'increment_objection_usage')
ORDER BY routine_name;

-- Check embedding count
SELECT COUNT(*) as total_embeddings FROM objection_embeddings;

-- Sample embeddings (pgvector uses vector_dims function)
SELECT 
  id,
  substring(objection_reason, 1, 60) as reason_preview,
  severity,
  original_score,
  corrected_score,
  vector_dims(embedding) as embedding_dim,
  created_at
FROM objection_embeddings
ORDER BY created_at DESC
LIMIT 5;
