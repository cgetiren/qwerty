-- Personnel Performance Reports System
-- Professional-grade async report generation with PDF/Word export

-- Reports table
CREATE TABLE IF NOT EXISTS personnel_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  personnel_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  generated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Report parameters
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'comprehensive', -- comprehensive, summary, comparison
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  progress INTEGER DEFAULT 0, -- 0-100
  error_message TEXT,
  
  -- Report data
  report_data JSONB, -- Full report content
  metrics JSONB, -- Performance metrics summary
  
  -- File exports
  pdf_url TEXT,
  word_url TEXT,
  excel_url TEXT,
  
  -- Metadata
  total_chats INTEGER,
  analysis_token_count INTEGER, -- Track API usage
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_personnel_reports_brand_id ON personnel_reports(brand_id);
CREATE INDEX idx_personnel_reports_personnel_id ON personnel_reports(personnel_id);
CREATE INDEX idx_personnel_reports_status ON personnel_reports(status);
CREATE INDEX idx_personnel_reports_created_at ON personnel_reports(created_at DESC);
CREATE INDEX idx_personnel_reports_generated_by ON personnel_reports(generated_by);

-- RLS policies
ALTER TABLE personnel_reports ENABLE ROW LEVEL SECURITY;

-- Managers can see reports for their brand
CREATE POLICY "Managers can view personnel reports"
  ON personnel_reports
  FOR SELECT
  USING (
    brand_id IN (
      SELECT id FROM brands WHERE manager_id = auth.uid()
    )
  );

-- Managers can create reports for their brand
CREATE POLICY "Managers can create personnel reports"
  ON personnel_reports
  FOR INSERT
  WITH CHECK (
    brand_id IN (
      SELECT id FROM brands WHERE manager_id = auth.uid()
    )
  );

-- Managers can update their own reports
CREATE POLICY "Managers can update their reports"
  ON personnel_reports
  FOR UPDATE
  USING (generated_by = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_personnel_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_personnel_reports_updated_at
  BEFORE UPDATE ON personnel_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_personnel_reports_updated_at();

-- Function to get personnel performance summary (optimized for API cost)
CREATE OR REPLACE FUNCTION get_personnel_performance_summary(
  p_personnel_id UUID,
  p_brand_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_chats INTEGER;
  v_avg_score NUMERIC;
  v_team_avg NUMERIC;
  v_rank INTEGER;
  v_total_agents INTEGER;
BEGIN
  -- Get basic stats
  SELECT 
    COUNT(*)::INTEGER,
    ROUND(AVG(ca.overall_score), 1)
  INTO v_total_chats, v_avg_score
  FROM chats c
  JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.personnel_id = p_personnel_id
    AND c.brand_id = p_brand_id
    AND c.created_at >= p_start_date
    AND c.created_at <= p_end_date;
  
  -- Get team average
  SELECT ROUND(AVG(ca.overall_score), 1)
  INTO v_team_avg
  FROM chats c
  JOIN chat_analysis ca ON ca.chat_id = c.id
  WHERE c.brand_id = p_brand_id
    AND c.created_at >= p_start_date
    AND c.created_at <= p_end_date;
  
  -- Get ranking
  WITH agent_scores AS (
    SELECT 
      c.personnel_id,
      AVG(ca.overall_score) as avg_score
    FROM chats c
    JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.brand_id = p_brand_id
      AND c.created_at >= p_start_date
      AND c.created_at <= p_end_date
    GROUP BY c.personnel_id
  ),
  ranked AS (
    SELECT 
      personnel_id,
      ROW_NUMBER() OVER (ORDER BY avg_score DESC) as rank
    FROM agent_scores
  )
  SELECT rank INTO v_rank
  FROM ranked
  WHERE personnel_id = p_personnel_id;
  
  -- Get total agents count
  SELECT COUNT(DISTINCT personnel_id)::INTEGER
  INTO v_total_agents
  FROM chats
  WHERE brand_id = p_brand_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
  
  -- Build result
  v_result := jsonb_build_object(
    'total_chats', COALESCE(v_total_chats, 0),
    'avg_score', COALESCE(v_avg_score, 0),
    'team_avg', COALESCE(v_team_avg, 0),
    'rank', COALESCE(v_rank, 0),
    'total_agents', COALESCE(v_total_agents, 0),
    'performance_vs_team', ROUND(((COALESCE(v_avg_score, 0) - COALESCE(v_team_avg, 0)) / NULLIF(COALESCE(v_team_avg, 1), 0)) * 100, 1)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get category breakdown (optimized)
CREATE OR REPLACE FUNCTION get_personnel_category_breakdown(
  p_personnel_id UUID,
  p_brand_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH personnel_scores AS (
    SELECT 
      ROUND(AVG((ca.detailed_scores->>'language_and_tone')::NUMERIC), 1) as language_tone,
      ROUND(AVG((ca.detailed_scores->>'first_response_time')::NUMERIC), 1) as response_time,
      ROUND(AVG((ca.detailed_scores->>'relevance_and_accuracy')::NUMERIC), 1) as relevance,
      ROUND(AVG((ca.detailed_scores->>'solution_focused')::NUMERIC), 1) as solution_focused,
      ROUND(AVG((ca.detailed_scores->>'communication_clarity')::NUMERIC), 1) as communication,
      ROUND(AVG((ca.detailed_scores->>'solution_result')::NUMERIC), 1) as solution_result
    FROM chats c
    JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.personnel_id = p_personnel_id
      AND c.brand_id = p_brand_id
      AND c.created_at >= p_start_date
      AND c.created_at <= p_end_date
  ),
  team_scores AS (
    SELECT 
      ROUND(AVG((ca.detailed_scores->>'language_and_tone')::NUMERIC), 1) as language_tone,
      ROUND(AVG((ca.detailed_scores->>'first_response_time')::NUMERIC), 1) as response_time,
      ROUND(AVG((ca.detailed_scores->>'relevance_and_accuracy')::NUMERIC), 1) as relevance,
      ROUND(AVG((ca.detailed_scores->>'solution_focused')::NUMERIC), 1) as solution_focused,
      ROUND(AVG((ca.detailed_scores->>'communication_clarity')::NUMERIC), 1) as communication,
      ROUND(AVG((ca.detailed_scores->>'solution_result')::NUMERIC), 1) as solution_result
    FROM chats c
    JOIN chat_analysis ca ON ca.chat_id = c.id
    WHERE c.brand_id = p_brand_id
      AND c.created_at >= p_start_date
      AND c.created_at <= p_end_date
  )
  SELECT jsonb_build_object(
    'language_tone', jsonb_build_object(
      'personnel', COALESCE(p.language_tone, 0),
      'team', COALESCE(t.language_tone, 0),
      'diff', ROUND(COALESCE(p.language_tone, 0) - COALESCE(t.language_tone, 0), 1)
    ),
    'response_time', jsonb_build_object(
      'personnel', COALESCE(p.response_time, 0),
      'team', COALESCE(t.response_time, 0),
      'diff', ROUND(COALESCE(p.response_time, 0) - COALESCE(t.response_time, 0), 1)
    ),
    'relevance', jsonb_build_object(
      'personnel', COALESCE(p.relevance, 0),
      'team', COALESCE(t.relevance, 0),
      'diff', ROUND(COALESCE(p.relevance, 0) - COALESCE(t.relevance, 0), 1)
    ),
    'solution_focused', jsonb_build_object(
      'personnel', COALESCE(p.solution_focused, 0),
      'team', COALESCE(t.solution_focused, 0),
      'diff', ROUND(COALESCE(p.solution_focused, 0) - COALESCE(t.solution_focused, 0), 1)
    ),
    'communication', jsonb_build_object(
      'personnel', COALESCE(p.communication, 0),
      'team', COALESCE(t.communication, 0),
      'diff', ROUND(COALESCE(p.communication, 0) - COALESCE(t.communication, 0), 1)
    ),
    'solution_result', jsonb_build_object(
      'personnel', COALESCE(p.solution_result, 0),
      'team', COALESCE(t.solution_result, 0),
      'diff', ROUND(COALESCE(p.solution_result, 0) - COALESCE(t.solution_result, 0), 1)
    )
  ) INTO v_result
  FROM personnel_scores p, team_scores t;
  
  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE personnel_reports IS 'Async personnel performance report generation with PDF/Word export';
COMMENT ON FUNCTION get_personnel_performance_summary IS 'Optimized summary for AI report generation (reduces API tokens)';
COMMENT ON FUNCTION get_personnel_category_breakdown IS 'Category-level performance comparison (personnel vs team)';
