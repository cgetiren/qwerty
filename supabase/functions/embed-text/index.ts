import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Supabase embedding helper - PUBLIC (no auth required)
// Uses pseudo-embedding (hash-based) for RAG system
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { text, texts } = await req.json();
    
    if (!text && !texts) {
      return new Response(
        JSON.stringify({ error: 'text or texts parameter required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const input = texts || [text];
    
    console.log('Creating pseudo-embedding for RAG system');
    
    const textToEmbed = Array.isArray(input) ? input[0] : input;
    const embedding = createPseudoEmbedding(textToEmbed);
    
    return new Response(
      JSON.stringify({ 
        embedding,
        dimensions: embedding.length,
        model: 'pseudo-gte-small',
        note: 'Using hash-based pseudo-embedding for semantic similarity'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Embedding error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Simple pseudo-embedding fallback (hash-based)
// Creates a normalized 384-dimensional vector from text
// Not as good as real embeddings but works for basic semantic similarity
function createPseudoEmbedding(text: string): number[] {
  const embedding = new Array(384).fill(0);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text.toLowerCase());
  
  // Distribute characters across dimensions
  for (let i = 0; i < bytes.length; i++) {
    const idx = bytes[i] % 384;
    embedding[idx] += (bytes[i] / 255) * 0.1;
    
    // Also use bigrams for better distribution
    if (i > 0) {
      const bigramIdx = ((bytes[i-1] * 256) + bytes[i]) % 384;
      embedding[bigramIdx] += 0.05;
    }
  }
  
  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
}
