import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tlpguwiymccjxfypcpkd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscGd1d2l5bWNjanhmeXBjcGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODEyNjAsImV4cCI6MjA4Njg1NzI2MH0.tmP1cbQ3_SQFXpFqE5XWYlEfPdEBaBKaR-_SfD7B-J4';

async function testRAGRetrieval() {
  console.log('🔍 Testing RAG retrieval system...\n');

  const testQuery = "Müşteri çekim işlemi hakkında şikayet ediyor ve beklemek istemiyor. Agent yeterli bilgilendirme yapmamış.";
  
  console.log('Test query:', testQuery);
  console.log('Calling get-objection-context edge function...\n');

  const response = await fetch(
    SUPABASE_URL + '/functions/v1/get-objection-context',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatSummary: testQuery,
        brandId: 'c1fbe05a-a1f0-4811-af59-6aa8c79032ba', // CORRECT brand ID (177 embeddings)
      }),
    }
  );

  if (!response.ok) {
    console.error('❌ Error:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  
  console.log('✅ RAG retrieval successful!\n');
  console.log('Found ' + (data.context?.length || 0) + ' similar past objections:\n');

  data.context?.forEach((obj: any) => {
    console.log(obj.index + '. [' + obj.severity + '] Similarity: ' + obj.similarity + '%');
    console.log('   Reason: ' + obj.reason.substring(0, 70) + '...');
    console.log('   Score change: ' + obj.scoreBefore + ' → ' + obj.scoreAfter + ' (' + (obj.scoreAfter - obj.scoreBefore > 0 ? '+' : '') + (obj.scoreAfter - obj.scoreBefore) + ')');
    if (obj.correction) {
      console.log('   Correction: ' + obj.correction.substring(0, 70) + '...');
    }
    console.log('');
  });

  if (data.context?.length > 0) {
    console.log('🎉 RAG system is working perfectly!');
    console.log('✅ AI now has access to past objection corrections!');
  } else {
    console.log('⚠️  No similar objections found');
  }
}

testRAGRetrieval();
