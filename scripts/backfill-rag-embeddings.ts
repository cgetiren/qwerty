/**
 * RAG Backfill Script
 * Geçmiş tüm objection_logs kayıtlarını embedding'e çevirir
 * 
 * Kullanım:
 * npx tsx scripts/backfill-rag-embeddings.ts
 * 
 * Veya:
 * npx tsx scripts/backfill-rag-embeddings.ts --limit 50 --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://anfpgiaaobvmnqboqwdw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable required!');
  console.log('\nUsage:');
  console.log('  export SUPABASE_SERVICE_ROLE_KEY=your_key_here');
  console.log('  npx tsx scripts/backfill-rag-embeddings.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

interface ObjectionLog {
  id: string;
  objection_reason: string;
  original_score: number;
  new_score: number;
  original_summary: string;
  new_summary: string;
  brand_id: string;
  embedding_id: string | null;
}

async function backfillEmbeddings() {
  console.log('🚀 RAG Backfill Script Started\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '✅ LIVE (will create embeddings)'}`);
  console.log(`Limit: ${limit} objections\n`);

  // 1. Fetch objections that need embedding
  console.log('📊 Fetching objections from database...');
  const { data: objections, error } = await supabase
    .from('objection_logs')
    .select('*')
    .not('new_score', 'is', null) // Only completed reanalyses
    .is('embedding_id', null) // Not yet embedded
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }

  if (!objections || objections.length === 0) {
    console.log('✅ No objections need embedding. All caught up!');
    return;
  }

  console.log(`\n📋 Found ${objections.length} objections to process:\n`);

  // Stats
  const scoreDiffs = objections.map((o: ObjectionLog) => Math.abs(o.new_score - o.original_score));
  const avgDiff = scoreDiffs.reduce((a, b) => a + b, 0) / scoreDiffs.length;
  const maxDiff = Math.max(...scoreDiffs);

  console.log(`   Average score change: ${avgDiff.toFixed(1)} points`);
  console.log(`   Maximum score change: ${maxDiff} points`);
  console.log(`   Total learning value: ${objections.length} new examples\n`);

  if (dryRun) {
    console.log('🔍 DRY RUN - Preview (first 5):');
    objections.slice(0, 5).forEach((o: ObjectionLog, idx: number) => {
      console.log(`\n${idx + 1}. ${o.objection_reason.substring(0, 60)}...`);
      console.log(`   Score: ${o.original_score} → ${o.new_score} (${o.new_score - o.original_score >= 0 ? '+' : ''}${o.new_score - o.original_score})`);
      console.log(`   ID: ${o.id}`);
    });
    console.log(`\n... and ${objections.length - 5} more`);
    console.log('\n✅ Dry run complete. Run without --dry-run to actually create embeddings.');
    return;
  }

  // 2. Process each objection
  console.log('🔄 Creating embeddings...\n');
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < objections.length; i++) {
    const objection = objections[i] as ObjectionLog;
    const progress = `[${i + 1}/${objections.length}]`;

    try {
      console.log(`${progress} Processing: ${objection.objection_reason.substring(0, 50)}...`);

      // Call create-objection-embedding edge function
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-objection-embedding`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            objectionId: objection.id,
            objectionReason: objection.objection_reason,
            chatSummary: objection.new_summary || objection.original_summary,
            originalScore: objection.original_score,
            correctedScore: objection.new_score,
            tags: [], // Could extract from summary if available
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`   ✅ Embedded (severity: ${result.severity}, diff: ${result.score_difference})`);
      successCount++;

      // Rate limiting - wait 100ms between requests
      if (i < objections.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (err: any) {
      console.error(`   ❌ Failed: ${err.message}`);
      failCount++;
    }
  }

  // 3. Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 BACKFILL SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total processed: ${objections.length}`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`Success rate: ${((successCount / objections.length) * 100).toFixed(1)}%`);
  console.log('\n🎉 AI has learned from these past objections!');
  console.log('   Future analyses will be more accurate.\n');

  // 4. Verify results
  console.log('🔍 Verifying results...');
  const { data: embeddingsCreated } = await supabase
    .from('objection_embeddings')
    .select('id, objection_reason, severity, usage_count')
    .order('created_at', { ascending: false })
    .limit(5);

  if (embeddingsCreated && embeddingsCreated.length > 0) {
    console.log('\n📚 Latest embeddings in RAG system:');
    embeddingsCreated.forEach((e: any, idx: number) => {
      console.log(`   ${idx + 1}. [${e.severity}] ${e.objection_reason.substring(0, 50)}...`);
    });
  }

  console.log('\n✅ Backfill complete!');
}

// Run
backfillEmbeddings().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
