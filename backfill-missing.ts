import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tlpguwiymccjxfypcpkd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscGd1d2l5bWNjanhmeXBjcGtkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI4MTI2MCwiZXhwIjoyMDg2ODU3MjYwfQ.52_08FMpm4R-v0ceANvnak2wq9hyowCFpNdFkO36n24';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const MISSING_IDS = [
  'f07ac176-0b22-443e-82c2-53a2a04fbb9f',
  '92d8ff93-fde5-461f-9adf-ac1e2818c992',
  '935318cc-8919-4f8f-89c2-8e1eb8278104',
  'a65cf17d-01d0-44c0-970a-93c64f222845',
  '1d99aacc-02d2-4604-8343-8a734e5774d6',
  '3335095f-0eef-4680-b5c7-28359567def7',
];

async function backfillMissing() {
  console.log('🔧 Backfilling ' + MISSING_IDS.length + ' missing embeddings...\n');

  for (const id of MISSING_IDS) {
    const { data: objection } = await supabase
      .from('objection_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (!objection) {
      console.log('❌ Not found: ' + id);
      continue;
    }

    console.log('Processing: ' + objection.objection_reason.substring(0, 50) + '...');

    const response = await fetch(
      SUPABASE_URL + '/functions/v1/create-objection-embedding',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          objectionId: objection.id,
          objectionReason: objection.objection_reason,
          originalScore: objection.original_score || 0,
          correctedScore: objection.corrected_score || 0,
        }),
      }
    );

    if (response.ok) {
      console.log('✅ Embedded!\n');
    } else {
      const error = await response.text();
      console.log('❌ Error: ' + error + '\n');
    }
  }

  console.log('🎉 Done!');
}

backfillMissing();
