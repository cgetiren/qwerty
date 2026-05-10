import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Get relevant objection context for chat analysis (RAG)
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { chatSummary, brandId } = await req.json();

    if (!chatSummary) {
      return new Response(
        JSON.stringify({ context: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create embedding for the chat summary
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscGd1d2l5bWNjanhmeXBjcGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODEyNjAsImV4cCI6MjA4Njg1NzI2MH0.tmP1cbQ3_SQFXpFqE5XWYlEfPdEBaBKaR-_SfD7B-J4';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const embedResponse = await fetch(
      supabaseUrl + '/functions/v1/embed-text',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: chatSummary }),
      }
    );

    if (!embedResponse.ok) {
      console.error('Embedding failed, returning empty context');
      return new Response(
        JSON.stringify({ context: [], fallback: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { embedding } = await embedResponse.json();

    // Find similar objections
    const { data: similarObjections, error } = await supabase.rpc(
      'match_similar_objections',
      {
        query_embedding: embedding,
        p_brand_id: brandId,
        match_threshold: 0.30, // 30% similarity threshold (pseudo-embedding needs lower threshold)
        match_count: 5, // Top 5 most relevant
      }
    );

    if (error) {
      console.error('Similarity search error:', error);
      return new Response(
        JSON.stringify({ context: [], error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update usage stats for matched embeddings
    if (similarObjections && similarObjections.length > 0) {
      const embeddingIds = similarObjections.map((o: any) => o.id);
      await supabase.rpc('increment_objection_usage', { embedding_ids: embeddingIds });
    }

    // Format context for Claude
    const formattedContext = (similarObjections || []).map((obj: any, idx: number) => ({
      index: idx + 1,
      reason: obj.objection_reason,
      scoreBefore: obj.original_score,
      scoreAfter: obj.corrected_score,
      correction: obj.correction_applied,
      severity: obj.severity,
      similarity: Math.round(obj.similarity * 100),
    }));

    console.log('Found ' + formattedContext.length + ' similar objections (threshold: 0.30)');

    return new Response(
      JSON.stringify({
        context: formattedContext,
        count: formattedContext.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ context: [], error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
