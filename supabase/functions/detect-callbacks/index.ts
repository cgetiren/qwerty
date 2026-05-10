import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CallbackSetting {
  category: string;
  label: string;
  keywords: string[];
  send_telegram: boolean;
  min_urgency_for_alert: string;
  is_active: boolean;
  brand_id: string | null;
}

interface ChatMessage {
  chat_id: string;
  author_type: string;
  text: string;
  created_at: string;
}

interface Chat {
  id: string;
  agent_name: string;
  customer_name: string;
  created_at: string;
  brand_id: string | null;
}

interface Brand {
  id: string;
  name: string;
  telegram_callback_bot_token: string | null;
  telegram_callback_chat_id: string | null;
}

const PHONE_REGEX = /(?:\+90|0090|90)?[\s\-.]?(?:\(0?5\d{2}\)|0?5\d{2})[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}/g;

const URGENCY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function extractPhoneNumber(text: string): string | null {
  const matches = text.match(PHONE_REGEX);
  return matches ? matches[0].replace(/[\s\-.]/g, "") : null;
}

function computeUrgency(categories: string[], hasPhone: boolean): "low" | "medium" | "high" | "critical" {
  if (categories.includes("explicit_callback") && categories.includes("urgency")) return "critical";
  if (categories.includes("urgency") && hasPhone) return "critical";
  if (categories.includes("explicit_callback")) return "high";
  if (categories.includes("urgency")) return "high";
  if (categories.includes("dissatisfaction") && hasPhone) return "high";
  if (categories.includes("dissatisfaction")) return "medium";
  if (categories.includes("phone_number")) return "medium";
  if (categories.includes("follow_up")) return "low";
  return "low";
}

function meetsMinUrgency(urgency: string, minUrgency: string): boolean {
  return (URGENCY_ORDER[urgency] ?? 0) >= (URGENCY_ORDER[minUrgency] ?? 0);
}

function scanMessages(
  messages: ChatMessage[],
  settings: CallbackSetting[]
): { matched_keywords: string[]; matched_categories: string[]; sample_message: string; phone_number: string | null } | null {
  const customerMessages = messages.filter((m) => m.author_type === "customer");

  if (customerMessages.length === 0) return null;

  const matchedKeywordsSet = new Set<string>();
  const matchedCategoriesSet = new Set<string>();
  let sampleMessage = "";
  let foundPhone: string | null = null;

  for (const msg of customerMessages) {
    const lower = msg.text.toLowerCase();

    for (const setting of settings) {
      if (!setting.is_active) continue;

      if (setting.category === "phone_number") {
        const phone = extractPhoneNumber(msg.text);
        if (phone) {
          foundPhone = phone;
          matchedCategoriesSet.add("phone_number");
          matchedKeywordsSet.add(phone);
          if (!sampleMessage) sampleMessage = msg.text;
        }
        continue;
      }

      for (const kw of setting.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          matchedKeywordsSet.add(kw);
          matchedCategoriesSet.add(setting.category);
          if (!sampleMessage) sampleMessage = msg.text;
        }
      }
    }
  }

  if (matchedCategoriesSet.size === 0) return null;

  return {
    matched_keywords: Array.from(matchedKeywordsSet),
    matched_categories: Array.from(matchedCategoriesSet),
    sample_message: sampleMessage.slice(0, 500),
    phone_number: foundPhone,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatIstanbulTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("tr-TR", {
      timeZone: "Europe/Istanbul",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  explicit_callback: "Açık Geri Arama İsteği",
  urgency: "Aciliyet",
  phone_number: "Telefon Numarası Paylaştı",
  dissatisfaction: "Memnuniyetsizlik",
  follow_up: "Takip Talebi",
};

async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  result: {
    chat_id: string; agent_name: string; customer_name: string;
    urgency: string; matched_categories: string[]; matched_keywords: string[];
    phone_number: string | null; sample_message: string; chat_started_at?: string;
  }
): Promise<{ messageId: string | null; error: string | null }> {
  const urgencyLabel: Record<string, string> = {
    critical: "🔴 KRİTİK",
    high: "🟠 YÜKSEK",
    medium: "🟡 ORTA",
    low: "🔵 DÜŞÜK",
  };
  const urgencyHeader: Record<string, string> = {
    critical: "🚨 ACİL GERİ ARAMA TALEBİ",
    high: "⚠️ GERİ ARAMA TALEBİ",
    medium: "📞 GERİ ARAMA TALEBİ",
    low: "ℹ️ GERİ ARAMA TALEBİ",
  };

  const header = urgencyHeader[result.urgency] ?? "📞 GERİ ARAMA TALEBİ";
  const urgency = urgencyLabel[result.urgency] ?? result.urgency.toUpperCase();

  const categoryLines = result.matched_categories
    .map((c) => CATEGORY_LABEL[c] ?? c)
    .join(", ");

  const customerName = escapeHtml(result.customer_name || "Bilinmiyor");
  const agentName = escapeHtml(result.agent_name || "Bilinmiyor");
  const chatTime = result.chat_started_at ? formatIstanbulTime(result.chat_started_at) : "—";

  const phoneBlock = result.phone_number
    ? `\n📱 <b>Telefon: ${escapeHtml(result.phone_number)}</b>`
    : "\n📵 <i>Telefon numarası paylaşılmadı</i>";

  const sampleBlock = result.sample_message
    ? `\n\n💬 <b>Müşteri Mesajı:</b>\n<i>"${escapeHtml(result.sample_message.slice(0, 300))}"</i>`
    : "";

  const keywordsBlock = result.matched_keywords.length > 0
    ? `\n🔑 <b>Tetikleyen Kelimeler:</b> ${escapeHtml(result.matched_keywords.slice(0, 5).join(", "))}`
    : "";

  const text =
    `<b>${header}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Müşteri:</b> ${customerName}\n` +
    `${phoneBlock}\n` +
    `⚡ <b>Aciliyet:</b> ${urgency}\n` +
    `🏷 <b>Sebep:</b> ${escapeHtml(categoryLines)}` +
    `${keywordsBlock}` +
    `${sampleBlock}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👨‍💼 <b>Temsilci:</b> ${agentName}\n` +
    `🕐 <b>Chat Saati:</b> ${chatTime}\n` +
    `🆔 <b>Chat ID:</b> <code>${escapeHtml(result.chat_id)}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <b>Bu müşteriyi lütfen en kısa sürede arayınız!</b>\n\n` +
    `💬 Konuşmayı görmek için: /chat ${escapeHtml(result.chat_id)}`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const data = await response.json();
    if (data.ok && data.result?.message_id) {
      return { messageId: String(data.result.message_id), error: null };
    }
    return { messageId: null, error: data.description ?? "Unknown Telegram error" };
  } catch (e) {
    return { messageId: null, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let lookbackHours = 6;
    let scanAll = false;
    let batchSize = 300;
    let testTelegram = false;
    let targetBrandId: string | null = null;

    try {
      if (req.method === "POST") {
        const body = await req.json();
        if (body?.test_telegram === true) {
          testTelegram = true;
        } else if (body?.scan_all === true) {
          scanAll = true;
        } else if (body?.lookback_hours && typeof body.lookback_hours === "number") {
          lookbackHours = Math.min(Math.max(body.lookback_hours, 1), 8760);
        }
        if (body?.batch_size && typeof body.batch_size === "number") {
          batchSize = Math.min(Math.max(body.batch_size, 50), 1000);
        }
        if (body?.brand_id && typeof body.brand_id === "string") {
          targetBrandId = body.brand_id;
        }
      }
    } catch (_) {}

    if (testTelegram) {
      const { data: cfg } = await supabase
        .from("system_config")
        .select("callback_telegram_bot_token, callback_telegram_chat_id")
        .maybeSingle();
      const token = cfg?.callback_telegram_bot_token?.trim() ?? null;
      const chatId = cfg?.callback_telegram_chat_id?.trim() ?? null;
      if (!token || !chatId) {
        return new Response(
          JSON.stringify({ success: false, error: "Bot token veya chat ID eksik" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: "Test: Geri Arama sistemi calisiyor." }),
        });
        let data: Record<string, unknown> = {};
        try { data = await resp.json(); } catch (_) { data = { ok: false, description: "Telegram yaniti JSON degil" }; }
        return new Response(
          JSON.stringify({ success: data.ok === true, telegram_response: data, token_prefix: token.slice(0, 10) + "...", chat_id: chatId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchErr) {
        return new Response(
          JSON.stringify({ success: false, error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch all active brands (or only the target brand)
    let brandsQuery = supabase
      .from("brands")
      .select("id, name, telegram_callback_bot_token, telegram_callback_chat_id")
      .eq("is_active", true);
    if (targetBrandId) brandsQuery = brandsQuery.eq("id", targetBrandId);
    const { data: brands, error: brandsError } = await brandsQuery;
    if (brandsError) throw brandsError;
    if (!brands || brands.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active brands found", detected: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all active callback settings (keyed by brand_id)
    const { data: allSettings, error: settingsError } = await supabase
      .from("callback_settings")
      .select("*")
      .eq("is_active", true);
    if (settingsError) throw settingsError;

    const settingsByBrand = new Map<string, CallbackSetting[]>();
    const globalSettings: CallbackSetting[] = [];
    for (const s of allSettings ?? []) {
      if (s.brand_id) {
        if (!settingsByBrand.has(s.brand_id)) settingsByBrand.set(s.brand_id, []);
        settingsByBrand.get(s.brand_id)!.push(s as CallbackSetting);
      } else {
        globalSettings.push(s as CallbackSetting);
      }
    }

    const sinceTime = scanAll ? null : new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    let totalScanned = 0;
    let totalSkipped = 0;
    let totalDetected = 0;
    let totalTelegramSent = 0;
    const allTelegramErrors: string[] = [];

    for (const brand of brands as Brand[]) {
      // Determine settings for this brand (brand-specific or global)
      const settings = settingsByBrand.get(brand.id) ?? globalSettings;
      if (settings.length === 0) continue;

      // Fetch chats for this brand
      let allChats: Chat[] = [];

      if (scanAll) {
        const PAGE = 1000;
        let offset = 0;
        while (true) {
          const { data, error } = await supabase
            .from("chats")
            .select("id, agent_name, customer_name, created_at, brand_id")
            .eq("status", "archived")
            .eq("brand_id", brand.id)
            .range(offset, offset + PAGE - 1);
          if (error || !data || data.length === 0) break;
          allChats.push(...(data as Chat[]));
          if (data.length < PAGE) break;
          offset += PAGE;
        }
      } else {
        const { data, error } = await supabase
          .from("chats")
          .select("id, agent_name, customer_name, created_at, brand_id")
          .eq("status", "archived")
          .eq("brand_id", brand.id)
          .gte("created_at", sinceTime!)
          .order("created_at", { ascending: false })
          .limit(batchSize);
        if (error) throw error;
        allChats = (data ?? []) as Chat[];
      }

      if (allChats.length === 0) continue;

      // Filter out already-processed chats
      const allChatIds = allChats.map((c) => c.id);
      const existingChatIds = new Set<string>();
      for (let i = 0; i < allChatIds.length; i += 500) {
        const chunk = allChatIds.slice(i, i + 500);
        const { data: existing } = await supabase
          .from("callback_requests")
          .select("chat_id")
          .in("chat_id", chunk);
        for (const r of existing ?? []) existingChatIds.add(r.chat_id);
      }

      const chatsToScan = allChats.filter((c) => !existingChatIds.has(c.id));
      totalSkipped += allChats.length - chatsToScan.length;

      if (chatsToScan.length === 0) continue;

      // Bulk fetch customer messages
      const MSG_BATCH = 200;
      const messagesByChat = new Map<string, ChatMessage[]>();

      for (let i = 0; i < chatsToScan.length; i += MSG_BATCH) {
        const batchIds = chatsToScan.slice(i, i + MSG_BATCH).map((c) => c.id);
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("chat_id, author_type, text, created_at")
          .in("chat_id", batchIds)
          .eq("author_type", "customer")
          .limit(MSG_BATCH * 50);

        for (const msg of msgs ?? []) {
          const key = msg.chat_id as string;
          if (!messagesByChat.has(key)) messagesByChat.set(key, []);
          messagesByChat.get(key)!.push(msg as ChatMessage);
        }
      }

      // Process chats
      const toInsert: Record<string, unknown>[] = [];
      const telegramQueue: { result: Record<string, unknown> }[] = [];

      for (const chat of chatsToScan) {
        const messages = messagesByChat.get(chat.id) ?? [];
        if (messages.length === 0) continue;

        const scanResult = scanMessages(messages, settings);
        if (!scanResult) continue;

        const urgency = computeUrgency(scanResult.matched_categories, !!scanResult.phone_number);

        const record: Record<string, unknown> = {
          chat_id: chat.id,
          agent_name: chat.agent_name ?? "",
          customer_name: chat.customer_name ?? "",
          detected_at: new Date().toISOString(),
          chat_started_at: chat.created_at,
          matched_keywords: scanResult.matched_keywords,
          matched_categories: scanResult.matched_categories,
          urgency,
          sample_message: scanResult.sample_message,
          phone_number: scanResult.phone_number,
          status: "pending",
          telegram_sent: false,
          telegram_message_id: null,
          brand_id: brand.id,
        };

        if (!scanAll && brand.telegram_callback_bot_token && brand.telegram_callback_chat_id) {
          let shouldSend = false;
          for (const setting of settings) {
            if (
              scanResult.matched_categories.includes(setting.category) &&
              setting.send_telegram &&
              meetsMinUrgency(urgency, setting.min_urgency_for_alert)
            ) {
              shouldSend = true;
              break;
            }
          }
          if (shouldSend) {
            telegramQueue.push({ result: { ...record } });
          }
        }

        toInsert.push(record);
      }

      // Send Telegram alerts
      const telegramToken = brand.telegram_callback_bot_token?.trim() || null;
      const telegramChatId = brand.telegram_callback_chat_id?.trim() || null;

      for (const item of telegramQueue) {
        if (!telegramToken || !telegramChatId) break;
        const { messageId, error } = await sendTelegramAlert(telegramToken, telegramChatId, item.result as Parameters<typeof sendTelegramAlert>[2]);
        if (messageId) {
          const rec = toInsert.find((r) => r.chat_id === item.result.chat_id);
          if (rec) { rec.telegram_sent = true; rec.telegram_message_id = messageId; }
          totalTelegramSent++;
        } else if (error) {
          allTelegramErrors.push(error);
        }
      }

      // Bulk upsert
      const INSERT_BATCH = 200;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const chunk = toInsert.slice(i, i + INSERT_BATCH);
        await supabase
          .from("callback_requests")
          .upsert(chunk, { onConflict: "chat_id", ignoreDuplicates: false });
      }

      totalScanned += chatsToScan.length;
      totalDetected += toInsert.length;

      // Retry pending telegram for this brand
      if (telegramToken && telegramChatId) {
        const { data: pendingTelegram } = await supabase
          .from("callback_requests")
          .select("id, chat_id, agent_name, customer_name, urgency, matched_categories, matched_keywords, phone_number, sample_message, chat_started_at")
          .eq("telegram_sent", false)
          .eq("status", "pending")
          .eq("brand_id", brand.id)
          .limit(50);

        for (const pending of pendingTelegram ?? []) {
          let shouldSend = false;
          for (const setting of settings) {
            if (
              (pending.matched_categories as string[]).includes(setting.category) &&
              setting.send_telegram &&
              meetsMinUrgency(pending.urgency as string, setting.min_urgency_for_alert)
            ) {
              shouldSend = true;
              break;
            }
          }
          if (!shouldSend) continue;

          const { messageId, error: tgError } = await sendTelegramAlert(telegramToken, telegramChatId, {
            chat_id: pending.chat_id,
            agent_name: pending.agent_name,
            customer_name: pending.customer_name,
            urgency: pending.urgency,
            matched_categories: pending.matched_categories,
            matched_keywords: pending.matched_keywords,
            phone_number: pending.phone_number,
            sample_message: pending.sample_message,
            chat_started_at: pending.chat_started_at,
          });
          if (messageId) {
            await supabase
              .from("callback_requests")
              .update({ telegram_sent: true, telegram_message_id: messageId })
              .eq("id", pending.id);
            totalTelegramSent++;
            await new Promise((r) => setTimeout(r, 2000));
          } else if (tgError) {
            allTelegramErrors.push(tgError);
            if (tgError.startsWith("Too Many Requests")) break;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: totalScanned,
        skipped: totalSkipped,
        detected: totalDetected,
        telegram_sent: totalTelegramSent,
        telegram_errors: allTelegramErrors,
        scan_all: scanAll,
        lookback_hours: scanAll ? null : lookbackHours,
        brands_processed: brands.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
