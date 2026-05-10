import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SCORE_THRESHOLD = 70;

const FINANCE_KEYWORDS = [
  "para yatırma", "para çekme", "yatırma", "çekim", "ödeme", "transfer",
  "deposit", "withdrawal", "yatırım", "finans", "finance", "ödeme sorunu",
  "havale", "eft", "banka", "kart", "kredi", "bakiye", "para", "tutar",
  "hesap", "komisyon", "bonus para", "çekim talebi", "yatırım talebi",
];

function isFinanceTopic(topic: string | null | undefined): boolean {
  if (!topic) return false;
  const lower = topic.toLowerCase();
  return FINANCE_KEYWORDS.some(kw => lower.includes(kw));
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

    const { data: allBrands } = await supabase
      .from("brands")
      .select("id, name, telegram_finance_bot_token, telegram_finance_chat_id")
      .not("telegram_finance_bot_token", "is", null)
      .not("telegram_finance_chat_id", "is", null)
      .eq("is_active", true);

    if (!allBrands || allBrands.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No finance Telegram configurations found", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    let totalSkipped = 0;

    for (const brand of allBrands) {
      // ADIM 1: Pending kayıtların id'lerini çek
      const { data: pendingAnalyses } = await supabase
        .from("chat_analysis")
        .select("id, chat_id, overall_score, chat_topic, ai_summary, sentiment")
        .eq("finance_telegram_sent", false)
        .eq("brand_id", brand.id)
        .lt("overall_score", SCORE_THRESHOLD)
        .not("overall_score", "is", null)
        .order("analysis_date", { ascending: true })
        .limit(50);

      const analyses = pendingAnalyses || [];
      if (analyses.length === 0) continue;

      const allIds = analyses.map((a: { id: string }) => a.id);

      // ADIM 2: Tüm id'leri ATOMIK olarak hemen true'ya çek (claim et)
      // Bu sayede başka bir cron instance aynı kayıtları seçemez
      const { data: claimedRows } = await supabase
        .from("chat_analysis")
        .update({ finance_telegram_sent: true })
        .in("id", allIds)
        .eq("finance_telegram_sent", false) // sadece hâlâ false olanları güncelle
        .select("id");

      // Gerçekten claim edilen id'ler (race condition'da diğer instance önce aldıysa boş gelir)
      const claimedIds = new Set((claimedRows || []).map((r: { id: string }) => r.id));
      if (claimedIds.size === 0) continue;

      // ADIM 3: Claim edilen kayıtlar içinden finans olanları filtrele
      const claimedAnalyses = analyses.filter((a: { id: string }) => claimedIds.has(a.id));

      const financeAnalyses = claimedAnalyses.filter((a: { chat_topic: string | null }) =>
        isFinanceTopic(a.chat_topic)
      );
      const nonFinanceAnalyses = claimedAnalyses.filter((a: { chat_topic: string | null }) =>
        !isFinanceTopic(a.chat_topic)
      );

      // Finans konusu olmayanlar zaten true yapıldı (claim sırasında), skip say
      totalSkipped += nonFinanceAnalyses.length;

      // ADIM 4: Finans konulularını Telegram'a gönder
      for (const analysis of financeAnalyses.slice(0, 10)) {
        const { data: chatRow } = await supabase
          .from("chats")
          .select("agent_name, customer_name, created_at")
          .eq("id", analysis.chat_id)
          .maybeSingle();

        const score = analysis.overall_score;
        const topic = analysis.chat_topic ?? "Belirtilmemis";
        const agentName = chatRow?.agent_name ?? "Bilinmiyor";
        const customerName = chatRow?.customer_name ?? "Bilinmiyor";
        const summary = analysis.ai_summary ?? "";

        const scoreEmoji = score < 30 ? "\u{1F534}" : score < 50 ? "\u{1F7E0}" : "\u{1F7E1}";

        const chatDate = chatRow?.created_at
          ? new Date(chatRow.created_at).toLocaleString("tr-TR", {
              timeZone: "Europe/Istanbul",
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })
          : "";

        const lines = [
          `\u{1F4B0} <b>Finans Bildirimi — ${brand.name}</b>`,
          ``,
          `${scoreEmoji} <b>Puan: ${score}/100</b>`,
          `\u{1F4CC} <b>Konu:</b> ${topic}`,
          `\u{1F464} <b>Temsilci:</b> ${agentName}`,
          `\u{1F465} <b>Musteri:</b> ${customerName}`,
          chatDate ? `\u{1F553} <b>Tarih:</b> ${chatDate}` : "",
          `\u{1F194} <b>Chat ID:</b> <code>${analysis.chat_id}</code>`,
          summary ? `\n\u{1F4DD} <i>${summary.slice(0, 300)}${summary.length > 300 ? "..." : ""}</i>` : "",
          `\n\u{1F4AC} Konusmayi gormek icin: <code>/chat ${analysis.chat_id}</code>`,
          `\u{1F4CA} Analiz ozeti icin: <code>/ozet ${analysis.chat_id}</code>`,
        ].filter(Boolean).join("\n");

        const telegramUrl = `https://api.telegram.org/bot${brand.telegram_finance_bot_token}/sendMessage`;

        const telegramResponse = await fetch(telegramUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: brand.telegram_finance_chat_id,
            text: lines,
            parse_mode: "HTML",
          }),
        });

        if (telegramResponse.ok) {
          totalSent++;
        } else {
          const errText = await telegramResponse.text();
          console.error("Telegram finance API error:", errText);
          // Telegram'a gönderemedik — bu kaydı geri false'a çek ki tekrar denensin
          await supabase
            .from("chat_analysis")
            .update({ finance_telegram_sent: false })
            .eq("id", analysis.id);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // slice(0,10) sonrasında kalanlar claim edildi ama bu turda gönderilmeyecek
      // Onları geri false'a çek ki bir sonraki cron'da gönderilsin
      const unprocessedFinance = financeAnalyses.slice(10);
      if (unprocessedFinance.length > 0) {
        const unprocessedIds = unprocessedFinance.map((a: { id: string }) => a.id);
        await supabase
          .from("chat_analysis")
          .update({ finance_telegram_sent: false })
          .in("id", unprocessedIds);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        skipped: totalSkipped,
        threshold: SCORE_THRESHOLD,
        brands_processed: allBrands.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Finance alert error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
