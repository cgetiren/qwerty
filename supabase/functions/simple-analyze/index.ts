import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get settings
    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings?.claude_api_key) {
      throw new Error("Claude API key not configured");
    }

    // Get one unanalyzed chat
    const { data: chats } = await supabase
      .from("chats")
      .select("*")
      .eq("analyzed", false)
      .eq("status", "archived")
      .limit(1);

    if (!chats || chats.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No chats found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chat = chats[0];

    // Get messages
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chat.id)
      .eq("is_system", false)
      .order("created_at", { ascending: true });

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No messages found", chat_id: chat.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conversationText = messages
      .map((m: any) => `${m.author_type === "agent" ? "Temsilci" : "Müşteri"}: ${m.text}`)
      .join("\n");

    // Call Claude API
    const claudeResponse = await fetch("https://jarvis.systemtest.store/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.claude_api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        temperature: 0.3,
        system: "Sen müşteri hizmetleri kalite kontrol uzmanısın. Sadece geçerli JSON döndür.",
        messages: [
          {
            role: "user",
            content: `Bu sohbeti analiz et ve JSON formatında yanıt ver:

${conversationText}

JSON formatı:
{
  "overall_score": 0-100,
  "ai_summary": "kısa özet"
}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      throw new Error(`Claude API error: ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const analysis = JSON.parse(claudeData.content[0].text);

    return new Response(
      JSON.stringify({
        success: true,
        chat_id: chat.id,
        agent: chat.agent_name,
        customer: chat.customer_name,
        message_count: messages.length,
        analysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
