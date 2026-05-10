import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BENJA_BRAND_ID = "00000000-0000-0000-0000-000000000001";
const TELEGRAM_MSG_LIMIT = 4000;

function sanitizeText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00A0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

// Reliable Istanbul timezone formatting (no toLocaleString dependency)
function toIstanbul(dateStr: string | Date): Date {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return new Date(d.getTime() + 3 * 60 * 60 * 1000);
}

function fmtDate(dateStr: string): string {
  const d = toIstanbul(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}.${mon}.${year}`;
}

function fmtTime(dateStr: string): string {
  const d = toIstanbul(dateStr);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function fmtDateTime(dateStr: string): string {
  return `${fmtDate(dateStr)} ${fmtTime(dateStr)}`;
}

function parseDate(text: string): { start: string; end: string; label: string } | null {
  const cleaned = sanitizeText(text);

  const fullDateMatch = cleaned.match(/^(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](\d{4})$/);
  if (fullDateMatch) {
    const day = fullDateMatch[1].padStart(2, "0");
    const month = fullDateMatch[2].padStart(2, "0");
    const year = fullDateMatch[3];
    return {
      start: `${year}-${month}-${day}T00:00:00+03:00`,
      end: `${year}-${month}-${day}T23:59:59+03:00`,
      label: `${day}.${month}.${year}`,
    };
  }

  const dayMonthMatch = cleaned.match(/^(\d{1,2})[.\-/\s](\d{1,2})\.?$/);
  if (dayMonthMatch) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const day = dayMonthMatch[1].padStart(2, "0");
    const month = dayMonthMatch[2].padStart(2, "0");
    const year = now.getFullYear();
    return {
      start: `${year}-${month}-${day}T00:00:00+03:00`,
      end: `${year}-${month}-${day}T23:59:59+03:00`,
      label: `${day}.${month}.${year}`,
    };
  }

  const dayOnlyMatch = cleaned.match(/^(\d{1,2})\.?$/);
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1]);
    if (day < 1 || day > 31) return null;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const dayStr = String(day).padStart(2, "0");
    return {
      start: `${year}-${month}-${dayStr}T00:00:00+03:00`,
      end: `${year}-${month}-${dayStr}T23:59:59+03:00`,
      label: `${dayStr}.${month}.${year}`,
    };
  }

  if (/^b[uü]g[uü]n$/i.test(cleaned)) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return {
      start: `${year}-${month}-${day}T00:00:00+03:00`,
      end: `${year}-${month}-${day}T23:59:59+03:00`,
      label: `${day}.${month}.${year} (Bugun)`,
    };
  }

  if (/^d[uü]n$/i.test(cleaned)) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    now.setDate(now.getDate() - 1);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return {
      start: `${year}-${month}-${day}T00:00:00+03:00`,
      end: `${year}-${month}-${day}T23:59:59+03:00`,
      label: `${day}.${month}.${year} (Dun)`,
    };
  }

  return null;
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

    const { data: settings } = await supabase
      .from("settings")
      .select("telegram_bot_token, telegram_chat_id")
      .eq("brand_id", BENJA_BRAND_ID)
      .maybeSingle();

    if (!settings?.telegram_bot_token) {
      throw new Error("Benja Telegram not configured");
    }

    const body = await req.json();
    const message = body?.message;

    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const incomingChatId = message.chat.id.toString();

    if (!settings.telegram_chat_id) {
      await supabase
        .from("settings")
        .update({ telegram_chat_id: incomingChatId })
        .eq("brand_id", BENJA_BRAND_ID);
      settings.telegram_chat_id = incomingChatId;
      console.log(`Auto-configured Benja telegram_chat_id: ${incomingChatId}`);
    }

    const rawText = message.text.trim();
    const withoutMention = stripBotMention(rawText);
    const withoutSlash = withoutMention.startsWith("/") ? withoutMention.slice(1) : withoutMention;
    const cleanedWithoutSlash = sanitizeText(withoutSlash);
    const isGroupChat = message.chat.type === "group" || message.chat.type === "supergroup";

    console.log("Benja webhook received:", JSON.stringify({ rawText, cleanedWithoutSlash, chatType: message.chat.type }));

    if (isGroupChat) {
      const isCommand = rawText.startsWith("/");
      const cleanedText = sanitizeText(withoutMention);
      const looksLikeDate = /^(\d{1,2}([.\-/]\d{1,2}([.\-/]\d{4})?)?\.?|b[uü]g[uü]n|d[uü]n)$/i.test(cleanedText);
      if (!isCommand && !looksLikeDate) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (cleanedWithoutSlash === "start" || cleanedWithoutSlash === "help") {
      if (isGroupChat && cleanedWithoutSlash === "start") {
        const { data: brand } = await supabase
          .from("brands")
          .select("id, telegram_alert_chat_id")
          .eq("id", BENJA_BRAND_ID)
          .maybeSingle();

        if (brand) {
          const existingIds = brand.telegram_alert_chat_id
            ? brand.telegram_alert_chat_id.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [];
          if (!existingIds.includes(incomingChatId)) {
            existingIds.push(incomingChatId);
            await supabase
              .from("brands")
              .update({ telegram_alert_chat_id: existingIds.join(",") })
              .eq("id", BENJA_BRAND_ID);
            await sendTelegramMessage(
              settings.telegram_bot_token,
              incomingChatId,
              `<b>Grup kaydedildi!</b>\n\nBu gruba artik dusuk puanli chat uyarilari ve kacirilan chat bildirimleri gonderilecek.`
            );
            return new Response(JSON.stringify({ ok: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      await sendTelegramMessage(
        settings.telegram_bot_token,
        incomingChatId,
        `<b>LiveBenja LiveChat Analiz Botu</b>\n\n` +
        `Tarih girerek o gune ait uyarilari gorebilirsiniz.\n\n` +
        `<b>Kullanim:</b>\n` +
        `- <code>12</code> - Bu ayin 12'si\n` +
        `- <code>12.02</code> - 12 Subat\n` +
        `- <code>12.02.2026</code> - Tam tarih\n` +
        `- <code>bugun</code> - Bugunun uyarilari\n` +
        `- <code>dun</code> - Dunun uyarilari\n` +
        `- <code>/ozet</code> - Bugunun ozeti\n` +
        `- <code>/chat CHATID</code> - Chat konusmasini goruntule\n` +
        `- <code>/egitim CHATID</code> - O chat icin egitici ornek diyalog uret\n` +
        `- <code>/geriara</code> - Bekleyen geri arama talepleri\n` +
        `- <code>/help</code> - Bu yardim mesaji`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (cleanedWithoutSlash === "ozet") {
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const todayStart = `${year}-${month}-${day}T00:00:00+03:00`;
      const todayEnd = `${year}-${month}-${day}T23:59:59+03:00`;

      const { data: todayAnalysis } = await supabase
        .from("chat_analysis")
        .select("overall_score, sentiment")
        .eq("brand_id", BENJA_BRAND_ID)
        .gte("analysis_date", todayStart)
        .lte("analysis_date", todayEnd);

      const { count: totalChats } = await supabase
        .from("chats")
        .select("*", { count: "exact", head: true })
        .eq("brand_id", BENJA_BRAND_ID)
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd);

      if (!todayAnalysis || todayAnalysis.length === 0) {
        await sendTelegramMessage(
          settings.telegram_bot_token,
          incomingChatId,
          `\u{1F4CA} <b>Bugunun Ozeti (${day}.${month}.${year})</b>\n\nHenuz analiz edilmis sohbet yok.`
        );
      } else {
        const scores = todayAnalysis.map(a => a.overall_score);
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const below60 = scores.filter(s => s < 60).length;
        const negativeCount = todayAnalysis.filter(a => a.sentiment === "negative").length;
        const positiveCount = todayAnalysis.filter(a => a.sentiment === "positive").length;

        await sendTelegramMessage(
          settings.telegram_bot_token,
          incomingChatId,
          `\u{1F4CA} <b>Bugunun Ozeti (${day}.${month}.${year})</b>\n\n` +
          `\u{1F4AC} Toplam Sohbet: <b>${totalChats || 0}</b>\n` +
          `\u{2705} Analiz Edilen: <b>${todayAnalysis.length}</b>\n` +
          `\u{1F4AF} Ortalama Puan: <b>${avg}/100</b>\n` +
          `\u{1F534} 60 Alti: <b>${below60}</b>\n` +
          `\u{1F7E2} Pozitif: <b>${positiveCount}</b>\n` +
          `\u{1F534} Negatif: <b>${negativeCount}</b>`
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (cleanedWithoutSlash === "geriara") {
      const { data: callbacks } = await supabase
        .from("callback_requests")
        .select("chat_id, customer_name, agent_name, urgency, matched_categories, phone_number, detected_at, status")
        .eq("brand_id", BENJA_BRAND_ID)
        .in("status", ["pending", "in_progress"])
        .order("detected_at", { ascending: false })
        .limit(20);

      if (!callbacks || callbacks.length === 0) {
        await sendTelegramMessage(
          settings.telegram_bot_token,
          incomingChatId,
          `\u{1F4DE} <b>Geri Arama Kuyruğu</b>\n\nBekleyen geri arama talebi yok.`
        );
      } else {
        const urgencyLabel: Record<string, string> = {
          critical: "\u{1F534} KRİTİK",
          high: "\u{1F7E0} YÜKSEK",
          medium: "\u{1F7E1} ORTA",
          low: "\u{1F535} DÜŞÜK",
        };
        const statusLabel: Record<string, string> = {
          pending: "Bekliyor",
          in_progress: "İşleniyor",
        };

        const header = `\u{1F4DE} <b>Geri Arama Kuyruğu (${callbacks.length} talep)</b>\n\n`;
        const lines = callbacks.map((cb: any, i: number) => {
          const urg = urgencyLabel[cb.urgency] ?? cb.urgency;
          const st = statusLabel[cb.status] ?? cb.status;
          const phone = cb.phone_number ? `\n   \u{1F4F1} ${escapeHtml(cb.phone_number)}` : "";
          const time = fmtTime(cb.detected_at);
          return (
            `<b>#${i + 1}</b> ${urg} | ${st}\n` +
            `   \u{1F464} ${escapeHtml(cb.customer_name || "Bilinmiyor")} → ${escapeHtml(cb.agent_name || "?")}${phone}\n` +
            `   \u{1F552} ${time} | \u{1F4AC} /chat ${escapeHtml(cb.chat_id)}\n`
          );
        });

        await sendSplitMessages(settings.telegram_bot_token, incomingChatId, header, lines);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const egitimCmdMatch = withoutSlash.match(/^egitim\s+(.+)/i);
    if (egitimCmdMatch) {
      const rawInputId = egitimCmdMatch[1]
        .normalize("NFC")
        .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00A0\u0000-\u001F]/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toUpperCase();

      await sendTelegramMessage(
        settings.telegram_bot_token,
        incomingChatId,
        `\u{1F50D} Chat aranıyor: <code>${escapeHtml(rawInputId)}</code>...`
      );

      const { data: rpcResults } = await supabase.rpc("find_chat_by_id", { search_id: rawInputId });
      const chatInfo = rpcResults && rpcResults.length > 0 ? rpcResults[0] : null;

      if (!chatInfo || chatInfo.brand_id !== BENJA_BRAND_ID) {
        await sendTelegramMessage(
          settings.telegram_bot_token,
          incomingChatId,
          `Chat bulunamadi: <code>${escapeHtml(rawInputId)}</code>`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: analysis } = await supabase
        .from("chat_analysis")
        .select("id, overall_score, chat_topic, coaching_suggestion, issues_detected, recommendations, sentiment, ai_summary")
        .eq("chat_id", chatInfo.id)
        .maybeSingle();

      if (!analysis) {
        await sendTelegramMessage(
          settings.telegram_bot_token,
          incomingChatId,
          `\u{26A0}\u{FE0F} Bu chat henuz analiz edilmemis. Once analiz tamamlanmali.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let coachingText = analysis.coaching_suggestion;

      if (!coachingText) {
        await sendTelegramMessage(
          settings.telegram_bot_token,
          incomingChatId,
          `\u{1F916} Casino ko\u00e7luk sistemi \u00e7al\u0131\u015ft\u0131r\u0131l\u0131yor, l\u00fctfen bekleyin...`
        );

        // Call get-coaching edge function (casino-specific coaching)
        try {
          const { data: messages } = await supabase
            .from("chat_messages")
            .select("author, text")
            .eq("chat_id", chatInfo.id)
            .eq("is_system", false)
            .order("created_at", { ascending: true })
            .limit(50);

          const formattedMessages = (messages ?? []).map((m: any) => ({
            author: { name: m.author?.name || "Unknown", type: m.author?.type || "unknown" },
            text: m.text
          }));

          const supabaseUrl = Deno.env.get("SUPABASE_URL");
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

          const coachingResp = await fetch(`${supabaseUrl}/functions/v1/get-coaching`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chatId: chatInfo.id,
              chatAnalysisId: analysis.id,
              customerName: chatInfo.customer_name,
              messages: formattedMessages,
              analysis: {
                sentiment: analysis.sentiment,
                score: analysis.overall_score,
                issues: [
                  ...(analysis.issues_detected?.critical_errors ?? []),
                  ...(analysis.issues_detected?.improvement_areas ?? [])
                ],
                summary: analysis.ai_summary
              },
              brand_id: BENJA_BRAND_ID
            })
          });

          if (coachingResp.ok) {
            const coachingData = await coachingResp.json();
            coachingText = coachingData.suggestion;
          } else {
            const errorText = await coachingResp.text();
            console.error("get-coaching error:", errorText);
          }
        } catch (coachingErr) {
          console.error("get-coaching failed:", coachingErr);
        }

        if (!coachingText) {
          await sendTelegramMessage(
            settings.telegram_bot_token,
            incomingChatId,
            `\u{274C} Ko\u00e7luk \u00f6nerisi olu\u015fturulamad\u0131. L\u00fctfen tekrar deneyin.`
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const rptSections: Record<string, string> = {};
      const sRx = /== (.+?) ==\n([\s\S]*?)(?=\n== |\s*$)/g;
      let sm;
      while ((sm = sRx.exec(coachingText)) !== null) {
        rptSections[sm[1].trim()] = sm[2].trim();
      }
      const hasSections = Object.keys(rptSections).length > 0;

      const msgHeader =
        `\u{1F4DA} <b>Egitici Rapor</b> | <code>${escapeHtml(rawInputId)}</code>\n` +
        (analysis.chat_topic ? `\u{1F4CC} <b>${escapeHtml(analysis.chat_topic)}</b>\n` : "") +
        (analysis.overall_score != null ? `\u{1F4CA} Puan: <b>${analysis.overall_score}/100</b>` : "");

      const msgLines: string[] = [""];
      if (hasSections) {
        const order = ["ANA SORUN", "YAPILMASI GEREKENLER", "ORNEK YANIT", "ORNEK DIYALOG"];
        const icons: Record<string, string> = {
          "ANA SORUN": "\u{1F534}",
          "YAPILMASI GEREKENLER": "\u{26A1}",
          "ORNEK YANIT": "\u{1F4AC}",
          "ORNEK DIYALOG": "\u{1F4CB}",
        };
        for (const key of order) {
          if (!rptSections[key]) continue;
          msgLines.push(`${icons[key] ?? "\u{2022}"} <b>${escapeHtml(key)}</b>`);
          if (key === "ORNEK DIYALOG") {
            for (const line of rptSections[key].split("\n")) {
              const t = line.trim();
              if (!t) { msgLines.push(""); continue; }
              if (/^(Uye|Üye):/i.test(t)) {
                msgLines.push(`\u{1F9D1} <b>Uye:</b> ${escapeHtml(t.replace(/^[^:]+:\s*/, ""))}`);
              } else if (/^Temsilci:/i.test(t)) {
                msgLines.push(`\u{1F3A7} <b>Temsilci:</b> ${escapeHtml(t.replace(/^[^:]+:\s*/, ""))}`);
              } else {
                msgLines.push(escapeHtml(t));
              }
            }
          } else if (key === "YAPILMASI GEREKENLER") {
            for (const line of rptSections[key].split("\n")) {
              const t = line.trim();
              if (t) msgLines.push(escapeHtml(t));
            }
          } else {
            msgLines.push(escapeHtml(rptSections[key]));
          }
          msgLines.push("");
        }
      } else {
        msgLines.push(
          ...coachingText
            .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
            .replace(/DIYALOG_BASLANGIC/g, "\n\u{1F4CB} <b>ORNEK DIYALOG</b>")
            .replace(/DIYALOG_BITIS/g, "")
            .replace(/^(Uye|Üye):/gm, "\u{1F9D1} <b>Uye:</b>")
            .replace(/^Temsilci:/gm, "\u{1F3A7} <b>Temsilci:</b>")
            .split("\n")
        );
      }

      await sendSplitMessages(settings.telegram_bot_token, incomingChatId, msgHeader, msgLines);

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

      console.log("Benja chat lookup for:", JSON.stringify(rawInputId), "length:", rawInputId.length);

      const { data: rpcResults, error: rpcError } = await supabase
        .rpc("find_chat_by_id", { search_id: rawInputId });

      console.log("RPC result:", JSON.stringify(rpcResults), "error:", JSON.stringify(rpcError));

      const chatInfo = rpcResults && rpcResults.length > 0 ? rpcResults[0] : null;

      if (!chatInfo || chatInfo.brand_id !== BENJA_BRAND_ID) {
        await sendTelegramMessage(
          settings.telegram_bot_token,
          incomingChatId,
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

      const chatDate = fmtDateTime(chatInfo.created_at);

      const header =
        `\u{1F4AC} <b>Chat Detayi</b>\n\n` +
        `<b>Chat ID:</b> <code>${escapeHtml(chatInfo.id)}</code>\n` +
        `<b>Temsilci:</b> ${escapeHtml(chatInfo.agent_name || "Bilinmiyor")}\n` +
        `<b>Musteri:</b> ${escapeHtml(chatInfo.customer_name || "Bilinmiyor")}\n` +
        `<b>Tarih:</b> ${chatDate}\n` +
        `<b>Mesaj Sayisi:</b> ${chatInfo.message_count || messages?.length || 0}\n\n` +
        `<b>--- Konusma ---</b>\n`;

      if (!messages || messages.length === 0) {
        await sendTelegramMessage(settings.telegram_bot_token, incomingChatId, header + "\nMesaj bulunamadi.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const msgLines = messages.map(msg => {
        const time = fmtTime(msg.created_at);
        const safeText = escapeHtml((msg.text || "").trim());
        if (msg.is_system) {
          return `\u{2699}\u{FE0F} [${time}] <i>${safeText.substring(0, 200)}</i>`;
        }
        const role = msg.author_type === "agent" ? "\u{1F464}" : "\u{1F9D1}";
        const label = msg.author_type === "agent" ? "Temsilci" : "Musteri";
        return `${role} [${time}] <b>${label}:</b> ${safeText.substring(0, 300)}`;
      });

      await sendSplitMessages(settings.telegram_bot_token, incomingChatId, header, msgLines);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateRange = parseDate(withoutSlash);

    if (!dateRange) {
      await sendTelegramMessage(
        settings.telegram_bot_token,
        incomingChatId,
        `Gecersiz format. Tarih girin:\n<code>12</code>, <code>12.02</code>, <code>bugun</code>, <code>dun</code>\n\n` +
        `Chat goruntule: <code>/chat CHATID</code>\n` +
        `Yardim icin /help yazin.`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: dateAnalysis } = await supabase
      .from("chat_analysis")
      .select("id, chat_id, overall_score, sentiment, ai_summary, analysis_date, chats(agent_name)")
      .eq("brand_id", BENJA_BRAND_ID)
      .gte("analysis_date", dateRange.start)
      .lte("analysis_date", dateRange.end)
      .order("analysis_date", { ascending: false });

    if (!dateAnalysis || dateAnalysis.length === 0) {
      await sendTelegramMessage(
        settings.telegram_bot_token,
        incomingChatId,
        `\u{1F4C5} <b>${dateRange.label}</b>\n\nBu tarihte analiz bulunamadi.`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allScores = dateAnalysis.map(a => a.overall_score).filter(Boolean);
    const avgScore = allScores.length > 0
      ? Math.round(allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length)
      : 0;
    const below60 = allScores.filter((s: number) => s < 60).length;
    const failedAnalyses = dateAnalysis.filter(a => a.overall_score !== null && a.overall_score < 60);

    if (failedAnalyses.length === 0) {
      await sendTelegramMessage(
        settings.telegram_bot_token,
        incomingChatId,
        `\u{1F4C5} <b>${dateRange.label} - Rapor</b>\n\n` +
        `\u{1F4CA} Toplam Analiz: <b>${allScores.length}</b>\n` +
        `\u{1F4AF} Ort. Puan: <b>${avgScore}/100</b>\n` +
        `\u{2705} 60 alti uyari yok!`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const header =
      `\u{1F4C5} <b>${dateRange.label} - Uyari Raporu</b>\n\n` +
      `\u{1F4CA} Toplam Analiz: <b>${allScores.length}</b>\n` +
      `\u{1F4AF} Ort. Puan: <b>${avgScore}/100</b>\n` +
      `\u{1F534} 60 Alti: <b>${below60}</b>\n\n` +
      `<b>--- Olumsuz Chatler (60 Alti) ---</b>\n`;

    const alertLines = failedAnalyses.map((analysis: any, i: number) => {
      const score = analysis.overall_score ?? "?";
      const summary = analysis.ai_summary || "";
      const agentName = (analysis.chats as any)?.agent_name || "?";
      const time = fmtTime(analysis.analysis_date);
      const sevIcon = score < 30 ? "\u{1F534}" : score < 40 ? "\u{1F7E0}" : "\u{1F7E1}";

      return (
        `${sevIcon} <b>#${i + 1}</b> [${time}] Puan: <b>${score}/100</b>\n` +
        `\u{1F464} ${agentName} | \u{1F4AC} <code>${analysis.chat_id || "?"}</code>\n` +
        `${summary ? summary.substring(0, 120) : "Detay yok"}\n`
      );
    });

    await sendSplitMessages(settings.telegram_bot_token, incomingChatId, header, alertLines);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Benja Telegram webhook error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
