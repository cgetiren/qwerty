/*
  # Add RAG System for Objection Learning

  ## What this does:
  - Enables pgvector extension for semantic search
  - Creates objection_embeddings table for vector storage
  - Creates semantic similarity search function
  - Stores successful objections with embeddings
  - Allows AI to learn from past corrections

  ## Impact:
  - AI learns from manager feedback
  - Similar mistakes won't repeat
  - Quality improves over time
*/

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Objection embeddings table (RAG memory)
CREATE TABLE IF NOT EXISTS public.objection_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  
  -- Original data
  objection_reason text NOT NULL,
  chat_summary text,
  original_score numeric,
  corrected_score numeric,
  score_difference numeric GENERATED ALWAYS AS (corrected_score - original_score) STORED,
  
  -- Vector embedding (384 dimensions for Supabase gte-small)
  embedding vector(384),
  
  -- Context for learning
  agent_mistakes jsonb, -- What the agent did wrong
  correction_applied text, -- What was fixed
  severity text CHECK (severity IN ('minor', 'moderate', 'severe', 'critical')),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  usage_count integer DEFAULT 0, -- How many times this was used as context
  last_used_at timestamptz,
  
  -- Tags for categorization
  tags text[]
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_objection_embeddings_brand ON public.objection_embeddings(brand_id);
CREATE INDEX IF NOT EXISTS idx_objection_embeddings_severity ON public.objection_embeddings(severity);
CREATE INDEX IF NOT EXISTS idx_objection_embeddings_created ON public.objection_embeddings(created_at DESC);

-- Vector similarity index (HNSW for fast approximate search)
-- Using cosine distance for semantic similarity
CREATE INDEX IF NOT EXISTS idx_objection_embeddings_vector 
  ON public.objection_embeddings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS policies
ALTER TABLE public.objection_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "objection_embeddings_select" ON public.objection_embeddings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "objection_embeddings_insert" ON public.objection_embeddings
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Semantic similarity search function
CREATE OR REPLACE FUNCTION public.match_similar_objections(
  query_embedding vector(384),
  p_brand_id uuid DEFAULT NULL,
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  objection_reason text,
  chat_summary text,
  original_score numeric,
  corrected_score numeric,
  score_difference numeric,
  agent_mistakes jsonb,
  correction_applied text,
  severity text,
  similarity float,
  usage_count integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    oe.id,
    oe.objection_reason,
    oe.chat_summary,
    oe.original_score,
    oe.corrected_score,
    oe.score_difference,
    oe.agent_mistakes,
    oe.correction_applied,
    oe.severity,
    1 - (oe.embedding <=> query_embedding) AS similarity,
    oe.usage_count
  FROM public.objection_embeddings oe
  WHERE 
    (p_brand_id IS NULL OR oe.brand_id = p_brand_id)
    AND (1 - (oe.embedding <=> query_embedding)) > match_threshold
  ORDER BY oe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to update usage stats when embedding is used
CREATE OR REPLACE FUNCTION public.increment_objection_usage(embedding_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.objection_embeddings
  SET 
    usage_count = usage_count + 1,
    last_used_at = now()
  WHERE id = ANY(embedding_ids);
END;
$$;

-- Add embedding column to objection_logs for tracking
ALTER TABLE public.objection_logs 
  ADD COLUMN IF NOT EXISTS embedding_id uuid REFERENCES public.objection_embeddings(id);

CREATE INDEX IF NOT EXISTS idx_objection_logs_embedding 
  ON public.objection_logs(embedding_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.objection_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_similar_objections TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_objection_usage TO authenticated;

-- Add comment
COMMENT ON TABLE public.objection_embeddings IS 
  'RAG memory: Stores objection learnings with vector embeddings for semantic similarity search. AI uses this to learn from past corrections.';
