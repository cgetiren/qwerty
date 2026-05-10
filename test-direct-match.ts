import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tlpguwiymccjxfypcpkd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscGd1d2l5bWNjanhmeXBjcGtkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI4MTI2MCwiZXhwIjoyMDg2ODU3MjYwfQ.52_08FMpm4R-v0ceANvnak2wq9hyowCFpNdFkO36n24';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function testDirectMatch() {
  console.log('🔍 Direct database test...\n');

  // Get a sample embedding
  const { data: samples, error: selectError } = await supabase
    .from('objection_embeddings')
    .select('id, embedding, objection_reason, brand_id')
    .limit(1);

  if (selectError) {
    console.error('❌ Select Error:', selectError);
    return;
  }

  if (!samples || samples.length === 0) {
    console.error('❌ No embeddings found!');
    return;
  }

  const sample = samples[0];

  console.log('Sample embedding ID:', sample.id);
  console.log('Brand ID:', sample.brand_id);
  console.log('Reason:', sample.objection_reason.substring(0, 60) + '...\n');

  // Try to match with itself (should work)
  console.log('Testing match_similar_objections RPC...\n');
  
  const { data, error } = await supabase.rpc('match_similar_objections', {
    query_embedding: sample.embedding,
    p_brand_id: sample.brand_id,
    match_threshold: 0.30,
    match_count: 5,
  });

  if (error) {
    console.error('❌ RPC Error:', error);
    return;
  }

  console.log('✅ RPC Success!');
  console.log('Found ' + (data?.length || 0) + ' matches:\n');

  data?.forEach((match: any, idx: number) => {
    console.log((idx + 1) + '. Similarity: ' + (match.similarity * 100).toFixed(1) + '%');
    console.log('   ' + match.objection_reason.substring(0, 70) + '...\n');
  });
}

testDirectMatch();
