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
        .select("id, telegram_callback_bot_token")
        .eq("slug", brandSlug)
        .eq("is_active", true)
        .maybeSingle();

      botToken = brand?.telegram_callback_bot_token ?? null;
      brandId = brand?.id ?? null;
    }

    if (!botToken) {
      const { data: settings } = await supabase
        .from("system_config")
        .select("callback_telegram_bot_token, brand_id")
        .maybeSingle();
      botToken = settings?.callback_telegram_bot_token ?? null;
      if (!brandId) brandId = settings?.brand_id ?? null;
    }

    if (!botToken) {
      console.error("Callback Telegram bot token not configured");
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
    const withoutMention = stripBotMention(rawText);
    const withoutSlash = withoutMention.startsWith("/") ? withoutMention.slice(1) : withoutMention;
    const cleanedWithoutSlash = withoutSlash.trim().toLowerCase();

    console.log("Callback webhook received:", JSON.stringify({ rawText, cleanedWithoutSlash, brandSlug }));

    if (cleanedWithoutSlash === "start" || cleanedWithoutSlash === "help") {
      await sendTelegramMessage(
        botToken,
        chatId,
        `\u{1F4DE} <b>Geri Arama Botu</b>\n\n` +
        `Bu bot geri arama taleplerini takip eder.\n\n` +
        `<b>Komutlar:</b>\n` +
        `- <code>/chat CHATID</code> - Chat konusmasini goruntule\n` +
        `- <code>/help</code> - Bu yardim mesaji`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatCmdMatch = withoutSlash.match(/^chat\s+(.+)/i);
    if (chatCmdMatch) {
      const rawInputId = chatCmdMatch[1]
        .normalize("NFC")
        .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00A0\u0000-\u001F]/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toUpperCase();

      console.log("Callback chat lookup for:", JSON.stringify(rawInputId), "length:", rawInputId.length);

      const { data: rpcResults, error: rpcError } = await supabase
        .rpc("find_chat_by_id", { search_id: rawInputId });

      console.log("RPC result:", JSON.stringify(rpcResults), "error:", JSON.stringify(rpcError));

      const chatInfo = rpcResults && rpcResults.length > 0 ? rpcResults[0] : null;

      if (!chatInfo || (brandId && chatInfo.brand_id !== brandId)) {
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
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const header =
        `\u{1F4AC} <b>Chat Detayi</b>\n\n` +
        `<b>Chat ID:</b> <code>${escapeHtml(chatInfo.id)}</code>\n` +
        `<b>Temsilci:</b> ${escapeHtml(chatInfo.agent_name || "Bilinmiyor")}\n` +
        `<b>Musteri:</b> ${escapeHtml(chatInfo.customer_name || "Bilinmiyor")}\n` +
        `<b>Tarih:</b> ${chatDate}\n` +
        `<b>Mesaj Sayisi:</b> ${chatInfo.message_count || messages?.length || 0}\n\n` +
        `<b>--- Konusma ---</b>\n`;

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

    await sendTelegramMessage(
      botToken,
      chatId,
      `Chat goruntule: <code>/chat CHATID</code>\nYardim icin /help yazin.`
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Callback telegram webhook error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
