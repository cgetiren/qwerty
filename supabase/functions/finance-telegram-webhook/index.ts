import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TELEGRAM_MSG_LIMIT = 4000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripBotMention(text: string): string {
  return text.replace(/@\S+/g, "").trim();
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}

async function sendSplitMessages(botToken: string, chatId: string, header: string, lines: string[]) {
  let current = header;
  for (const line of lines) {
    if (current.length + line.length + 2 > TELEGRAM_MSG_LIMIT) {
      await sendTelegramMessage(botToken, chatId, current);
      current = line;
    } else {
      current += "\n" + line;
    }
  }
  if (current) {
    await sendTelegramMessage(botToken, chatId, current);
  }
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

    const url = new URL(req.url);
    const brandSlug = url.searchParams.get("brand");

    let botToken: string | null = null;
    let brandId: string | null = null;

    if (brandSlug) {
      const { data: brand } = await supabase
        .from("brands")
        .select("id, telegram_finance_bot_token")
        .eq("slug", brandSlug)
        .eq("is_active", true)
        .maybeSingle();

      botToken = brand?.telegram_finance_bot_token ?? null;
      brandId = brand?.id ?? null;
    }

    if (!botToken) {
      // Fallback: try all brands to find matching token
      const { data: allBrands } = await supabase
        .from("brands")
        .select("id, telegram_finance_bot_token")
        .not("telegram_finance_bot_token", "is", null)
        .eq("is_active", true);

      if (allBrands && allBrands.length > 0) {
        botToken = allBrands[0].telegram_finance_bot_token;
        brandId = allBrands[0].id;
      }
    }

    if (!botToken) {
      console.error("Finance Telegram bot token not configured");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const message = body?.message;

    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = message.chat.id.toString();
    const rawText = message.text.trim();

    // Sadece / ile baslayan komutlara cevap ver, normal mesajlari yoksay
    if (!rawText.startsWith("/")) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const withoutMention = stripBotMention(rawText);
    const withoutSlash = withoutMention.startsWith("/") ? withoutMention.slice(1) : withoutMention;
    const cleanedWithoutSlash = withoutSlash.trim().toLowerCase();

    console.log("Finance webhook received:", JSON.stringify({ rawText, cleanedWithoutSlash, brandSlug }));

    if (cleanedWithoutSlash === "start" || cleanedWithoutSlash === "help") {
      await sendTelegramMessage(
        botToken,
        chatId,
        `\u{1F4B0} <b>Finans Bildirim Botu</b>\n\n` +
        `Bu bot finans ile ilgili dusuk puanli chat bildirimlerini gonderir.\n\n` +
        `<b>Komutlar:</b>\n` +
        `- <code>/chat CHATID</code> - Chat konusmasini goruntule\n` +
        `- <code>/ozet CHATID</code> - Chat analiz ozetini goruntule\n` +
        `- <code>/help</code> - Bu yardim mesaji`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // /chat CHATID - Chat konusmasini goruntule
    const chatCmdMatch = withoutSlash.match(/^chat\s+(.+)/i);
    if (chatCmdMatch) {
      const rawInputId = chatCmdMatch[1]
        .normalize("NFC")
        .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00A0\u0000-\u001F]/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toUpperCase();

      console.log("Finance chat lookup for:", JSON.stringify(rawInputId));

      const { data: rpcResults } = await supabase
        .rpc("find_chat_by_id", { search_id: rawInputId });

      const chatInfo = rpcResults && rpcResults.length > 0 ? rpcResults[0] : null;

      if (!chatInfo) {
        await sendTelegramMessage(
          botToken,
          chatId,
          `Chat bulunamadi: <code>${escapeHtml(rawInputId)}</code>`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: messages } = await supabase
        .from("chat_messages")
        .select("text, author_type, created_at, is_system")
        .eq("chat_id", chatInfo.id)
        .order("created_at", { ascending: true })
        .limit(200);

      const chatDate = new Date(chatInfo.created_at).toLocaleString("tr-TR", {
        timeZone: "Europe/Istanbul",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

      // Analiz bilgisini de cek
      const { data: analysis } = await supabase
        .from("chat_analysis")
        .select("overall_score, sentiment, chat_topic, ai_summary")
        .eq("chat_id", chatInfo.id)
        .maybeSingle();

      let header =
        `\u{1F4AC} <b>Chat Detayi</b>\n\n` +
        `<b>Chat ID:</b> <code>${escapeHtml(chatInfo.id)}</code>\n` +
        `<b>Temsilci:</b> ${escapeHtml(chatInfo.agent_name || "Bilinmiyor")}\n` +
        `<b>Musteri:</b> ${escapeHtml(chatInfo.customer_name || "Bilinmiyor")}\n` +
        `<b>Tarih:</b> ${chatDate}\n` +
        `<b>Mesaj Sayisi:</b> ${chatInfo.message_count || messages?.length || 0}\n`;

      if (analysis) {
        const scoreEmoji = analysis.overall_score < 30 ? "\u{1F534}" : analysis.overall_score < 50 ? "\u{1F7E0}" : analysis.overall_score < 70 ? "\u{1F7E1}" : "\u{1F7E2}";
        header += `\n${scoreEmoji} <b>Puan:</b> ${analysis.overall_score}/100\n`;
        if (analysis.chat_topic) header += `\u{1F4CC} <b>Konu:</b> ${escapeHtml(analysis.chat_topic)}\n`;
        if (analysis.sentiment) header += `\u{1F3AF} <b>Duygu:</b> ${escapeHtml(analysis.sentiment)}\n`;
      }

      header += `\n<b>--- Konusma ---</b>\n`;

      if (!messages || messages.length === 0) {
        await sendTelegramMessage(botToken, chatId, header + "\nMesaj bulunamadi.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msgLines = messages.map(msg => {
        const time = new Date(msg.created_at).toLocaleTimeString("tr-TR", {
          timeZone: "Europe/Istanbul",
          hour: "2-digit",
          minute: "2-digit",
        });
        const safeText = escapeHtml((msg.text || "").trim());
        if (msg.is_system) {
          return `\u{2699}\u{FE0F} [${time}] <i>${safeText.substring(0, 200)}</i>`;
        }
        const role = msg.author_type === "agent" ? "\u{1F464}" : "\u{1F9D1}";
        const label = msg.author_type === "agent" ? "Temsilci" : "Musteri";
        return `${role} [${time}] <b>${label}:</b> ${safeText.substring(0, 300)}`;
      });

      await sendSplitMessages(botToken, chatId, header, msgLines);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // /ozet CHATID - Chat analiz ozetini goruntule
    const ozetCmdMatch = withoutSlash.match(/^ozet\s+(.+)/i);
    if (ozetCmdMatch) {
      const rawInputId = ozetCmdMatch[1]
        .normalize("NFC")
        .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00A0\u0000-\u001F]/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toUpperCase();

      const { data: rpcResults } = await supabase
        .rpc("find_chat_by_id", { search_id: rawInputId });

      const chatInfo = rpcResults && rpcResults.length > 0 ? rpcResults[0] : null;

      if (!chatInfo) {
        await sendTelegramMessage(botToken, chatId, `Chat bulunamadi: <code>${escapeHtml(rawInputId)}</code>`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: analysis } = await supabase
        .from("chat_analysis")
        .select("overall_score, sentiment, chat_topic, ai_summary, issues_detected, positive_aspects, recommendations")
        .eq("chat_id", chatInfo.id)
        .maybeSingle();

      if (!analysis) {
        await sendTelegramMessage(botToken, chatId, `Bu chat henuz analiz edilmemis: <code>${escapeHtml(rawInputId)}</code>`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const scoreEmoji = analysis.overall_score < 30 ? "\u{1F534}" : analysis.overall_score < 50 ? "\u{1F7E0}" : analysis.overall_score < 70 ? "\u{1F7E1}" : "\u{1F7E2}";

      let text =
        `\u{1F4CA} <b>Chat Analiz Ozeti</b>\n\n` +
        `<b>Chat ID:</b> <code>${escapeHtml(chatInfo.id)}</code>\n` +
        `<b>Temsilci:</b> ${escapeHtml(chatInfo.agent_name || "Bilinmiyor")}\n` +
        `<b>Musteri:</b> ${escapeHtml(chatInfo.customer_name || "Bilinmiyor")}\n\n` +
        `${scoreEmoji} <b>Puan: ${analysis.overall_score}/100</b>\n` +
        `\u{1F3AF} <b>Duygu:</b> ${escapeHtml(analysis.sentiment || "-")}\n` +
        `\u{1F4CC} <b>Konu:</b> ${escapeHtml(analysis.chat_topic || "-")}\n`;

      if (analysis.ai_summary) {
        text += `\n\u{1F4DD} <b>Ozet:</b>\n<i>${escapeHtml(analysis.ai_summary.slice(0, 500))}</i>\n`;
      }

      const issues = analysis.issues_detected;
      if (issues?.critical_errors?.length > 0) {
        text += `\n\u{1F6A8} <b>Kritik Hatalar:</b>\n`;
        issues.critical_errors.slice(0, 5).forEach((e: string) => { text += `  \u{2022} ${escapeHtml(e.slice(0, 150))}\n`; });
      }
      if (issues?.improvement_areas?.length > 0) {
        text += `\n\u{26A0}\u{FE0F} <b>Gelistirilmesi Gerekenler:</b>\n`;
        issues.improvement_areas.slice(0, 5).forEach((e: string) => { text += `  \u{2022} ${escapeHtml(e.slice(0, 150))}\n`; });
      }

      const positives = analysis.positive_aspects;
      if (positives?.strengths?.length > 0) {
        text += `\n\u{2705} <b>Guclu Yonler:</b>\n`;
        positives.strengths.slice(0, 3).forEach((s: string) => { text += `  \u{2022} ${escapeHtml(s.slice(0, 150))}\n`; });
      }

      if (analysis.recommendations) {
        text += `\n\u{1F4A1} <b>Oneriler:</b>\n<i>${escapeHtml(analysis.recommendations.slice(0, 300))}</i>\n`;
      }

      await sendTelegramMessage(botToken, chatId, text);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bilinmeyen komut
    await sendTelegramMessage(
      botToken,
      chatId,
      `\u{1F4B0} <b>Finans Botu Komutlari:</b>\n\n` +
      `<code>/chat CHATID</code> - Chat konusmasini goruntule\n` +
      `<code>/ozet CHATID</code> - Chat analiz ozetini gor\n` +
      `<code>/help</code> - Yardim`
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Finance telegram webhook error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
