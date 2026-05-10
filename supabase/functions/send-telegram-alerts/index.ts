import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SCORE_THRESHOLD = 60;

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
      .select("id, telegram_alert_bot_token, telegram_alert_chat_id")
      .not("telegram_alert_bot_token", "is", null)
      .not("telegram_alert_chat_id", "is", null)
      .eq("is_active", true);

    if (!allBrands || allBrands.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No Telegram configurations found", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    let totalSkipped = 0;

    for (const brand of allBrands) {
      const chatIds = brand.telegram_alert_chat_id
        .split(",")
        .map((id: string) => id.trim())
        .filter(Boolean);

      if (chatIds.length === 0) continue;

      const { data: brandAlerts } = await supabase
        .from("alerts")
        .select("*, chat_analysis(overall_score, sentiment, chat_topic)")
        .eq("sent_to_telegram", false)
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: true })
        .limit(50);

      const unsentAlerts = brandAlerts || [];
      if (unsentAlerts.length === 0) continue;

      const allAlertIds = unsentAlerts.map((a: any) => a.id);

      // ATOMIC CLAIM: hepsini hemen true yap, race condition'ı önle
      const { data: claimedRows } = await supabase
        .from("alerts")
        .update({ sent_to_telegram: true })
        .in("id", allAlertIds)
        .eq("sent_to_telegram", false)
        .select("id");

      const claimedIds = new Set((claimedRows || []).map((r: any) => r.id));
      if (claimedIds.size === 0) continue;

      const claimedAlerts = unsentAlerts.filter((a: any) => claimedIds.has(a.id));

      const shouldSendAlert = (alert: any) => {
        if (alert.alert_type === "missed_chat") return true;
        const score = alert.chat_analysis?.overall_score;
        const sentiment = alert.chat_analysis?.sentiment;
        return (typeof score === "number" && score < SCORE_THRESHOLD) || sentiment === "negative";
      };

      const filteredAlerts = claimedAlerts.filter(shouldSendAlert);
      const skippedAlerts = claimedAlerts.filter((alert: any) => !shouldSendAlert(alert));

      // Skipped'lar zaten true yapıldı (claim sırasında)
      totalSkipped += skippedAlerts.length;

      for (const alert of filteredAlerts.slice(0, 10)) {
        const score = alert.chat_analysis?.overall_score ?? "?";
        const topic = alert.chat_analysis?.chat_topic;
        const telegramUrl = `https://api.telegram.org/bot${brand.telegram_alert_bot_token}/sendMessage`;
        const scoreEmoji = score < 30 ? "\u{1F534}" : score < 40 ? "\u{1F7E0}" : "\u{1F7E1}";
        const topicHeader = topic ? `📌 <b>Konu: ${topic}</b>\n\n` : "";
        const messageText = `${topicHeader}${scoreEmoji} <b>Puan: ${score}/100</b>\n\n${alert.message}`;

        let atLeastOneSent = false;
        let lastMessageId: string | undefined;

        for (const chatId of chatIds) {
          const telegramResponse = await fetch(telegramUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: messageText,
              parse_mode: "HTML",
            }),
          });

          if (telegramResponse.ok) {
            const telegramData = await telegramResponse.json();
            atLeastOneSent = true;
            lastMessageId = telegramData.result?.message_id?.toString();
          } else {
            console.error(`Telegram API error for chat_id ${chatId}:`, await telegramResponse.text());
          }

          if (chatIds.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        if (atLeastOneSent) {
          // sent_to_telegram zaten claim sırasında true yapıldı, sadece message_id güncelle
          await supabase
            .from("alerts")
            .update({ telegram_message_id: lastMessageId })
            .eq("id", alert.id);
          totalSent++;
        } else {
          // Tüm chat_id'lere gönderemedik — geri false'a çek ki tekrar denensin
          await supabase
            .from("alerts")
            .update({ sent_to_telegram: false })
            .eq("id", alert.id);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
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
    console.error("Telegram alert error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
