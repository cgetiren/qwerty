const SUPABASE_URL = 'https://tlpguwiymccjxfypcpkd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscGd1d2l5bWNjanhmeXBjcGtkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI4MTI2MCwiZXhwIjoyMDg2ODU3MjYwfQ.52_08FMpm4R-v0ceANvnak2wq9hyowCFpNdFkO36n24';

async function testRAGAnalysis() {
  console.log('🧪 Testing RAG-enhanced analysis...\n');
  
  // Pick any chat ID for test (you'll need to provide one)
  const testChatId = 'YOUR_CHAT_ID_HERE'; // Replace with actual chat ID
  
  console.log('Re-analyzing chat:', testChatId);
  console.log('RAG system will provide past objection context to Claude...\n');
  
  const response = await fetch(
    SUPABASE_URL + '/functions/v1/analyze-chat',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: testChatId,
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Analysis failed:', error);
    return;
  }
  
  const result = await response.json();
  console.log('✅ Analysis complete!');
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\n📊 Check edge function logs to see RAG context retrieval!');
}

// testRAGAnalysis();
console.log('⚠️  Edit this file and add a chat ID, then run: npx tsx test-rag-analysis.ts');
