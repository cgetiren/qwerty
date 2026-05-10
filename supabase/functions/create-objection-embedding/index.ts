import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface EmbeddingRequest {
  objectionId: string; // objection_logs id
  objectionReason: string;
  chatSummary?: string;
  originalScore: number;
  correctedScore: number;
  agentMistakes?: string[];
  correctionApplied?: string;
  severity?: 'minor' | 'moderate' | 'severe' | 'critical';
  tags?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: EmbeddingRequest = await req.json();
    const { objectionReason, chatSummary, originalScore, correctedScore } = body;

    // Combine objection reason and chat summary for rich context
    const textToEmbed = [objectionReason, chatSummary || ''].filter(Boolean).join('\n\n').trim();

    // Create embedding using our embed-text edge function (pseudo-embedding)
    console.log('Creating embedding for objection using embed-text function...');
    
    // Use anon key for embed-text (public function)
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscGd1d2l5bWNjanhmeXBjcGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODEyNjAsImV4cCI6MjA4Njg1NzI2MH0.tmP1cbQ3_SQFXpFqE5XWYlEfPdEBaBKaR-_SfD7B-J4';
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const embeddingResponse = await fetch(
      supabaseUrl + '/functions/v1/embed-text',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: textToEmbed }),
      }
    );

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('embed-text function error:', errorText);
      throw new Error('Embedding function error: ' + embeddingResponse.status);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding response from embed-text');
    }

    console.log('Embedding created: ' + embedding.length + ' dimensions');

    // Auto-determine severity based on score difference
    let severity = body.severity;
    if (!severity) {
      const diff = Math.abs(correctedScore - originalScore);
      severity = diff >= 40 ? 'critical'
        : diff >= 25 ? 'severe'
        : diff >= 15 ? 'moderate'
        : 'minor';
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    // Get brand_id from objection_logs
    const { data: objectionLog, error: logError } = await supabase
      .from('objection_logs')
      .select('brand_id')
      .eq('id', body.objectionId)
      .single();
    
    if (logError) {
      console.error('Failed to fetch objection_log:', logError);
      throw new Error('Objection log not found: ' + body.objectionId);
    }

    // Insert into objection_embeddings
    const { data: embeddingRecord, error: insertError } = await supabase
      .from('objection_embeddings')
      .insert({
        brand_id: objectionLog?.brand_id,
        objection_reason: objectionReason,
        chat_summary: chatSummary,
        original_score: originalScore,
        corrected_score: correctedScore,
        embedding: embedding,
        agent_mistakes: body.agentMistakes || [],
        correction_applied: body.correctionApplied,
        severity: severity,
        created_by: userId,
        tags: body.tags || [],
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    // Link embedding to objection_logs
    await supabase
      .from('objection_logs')
      .update({ embedding_id: embeddingRecord.id })
      .eq('id', body.objectionId);

    console.log('Objection embedding created: ' + embeddingRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        embedding_id: embeddingRecord.id,
        severity: severity,
        score_difference: correctedScore - originalScore,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
