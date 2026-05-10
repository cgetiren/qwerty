import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, delayMs = 1000): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      console.log(`Attempt ${attempt}/${maxRetries}: Fetching ${url}`);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) return response;

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error as Error;
      const isTimeout = lastError.name === "AbortError";
      console.error(`Attempt ${attempt} failed${isTimeout ? " (timeout after 30s)" : ""}:`, lastError.message);

      if (attempt < maxRetries) {
        const waitTime = delayMs * attempt;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

const BATCH_UPSERT_SIZE = 200;
const MAX_PAGES_PER_RUN = 20;

async function batchUpsert(supabase: any, table: string, records: any[], conflictColumn: string, ignoreDuplicates = false) {
  if (records.length === 0) return { error: null };
  for (let i = 0; i < records.length; i += BATCH_UPSERT_SIZE) {
    const batch = records.slice(i, i + BATCH_UPSERT_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictColumn, ignoreDuplicates });
    if (error) {
      console.error(`Batch upsert error on ${table} (batch ${Math.floor(i / BATCH_UPSERT_SIZE) + 1}):`, error.message);
    }
  }
  return { error: null };
}

const isAutoWelcomeMessage = (text: string, isFirstAgentMsg: boolean): boolean => {
  if (!isFirstAgentMsg) return false;
  const lowerText = text.toLowerCase();
  const welcomePhrases = ['hoş geldiniz', 'merhaba', 'nasıl yardımcı', 'size nasıl', 'yardımcı olabilirim'];
  return welcomePhrases.some(phrase => lowerText.includes(phrase)) && text.length < 150;
};

function fixTimestamp(ts: string | null | undefined, apiSendsUtc: boolean): string | null {
  if (!ts) return null;
  if (apiSendsUtc) return ts;
  if (typeof ts === 'string' && ts.endsWith('Z') && !ts.includes('+')) {
    return ts.replace('Z', '+03:00');
  }
  return ts;
}

function processPageChats(pageChats: any[], brandId: string | null, existingAnalyzedSet: Set<string>, apiSendsUtc: boolean = true) {
  const chatRecords: any[] = [];
  const messages: any[] = [];
  const personnelMap = new Map<string, any>();
  const missedChatIds: string[] = [];

  for (const chat of pageChats) {
    const fullChatData = chat.properties?.full_chat_data || {};
    const rawChatData = chat.properties?.raw_chat_data || {};
    const lastThreadSummary = fullChatData.last_thread_summary || {};

    const parentChatId = chat.id;
    const threadId = lastThreadSummary.id || chat.id;
    const rawAgentName = chat.agent_name || "Unknown";
    const agentName = rawAgentName.includes(",") ? rawAgentName.split(",").pop()!.trim() : rawAgentName;
    const customerName = chat.customer_name || "Unknown";
    const createdAt = fixTimestamp(lastThreadSummary.created_at || chat.created_at, apiSendsUtc);

    const chatMessages = fullChatData.all_messages || [];
    const lastEventPerType = fullChatData.last_event_per_type || {};

    let messageCount = 0;
    let agentMessageCount = 0;
    let customerMessageCount = 0;
    let firstAgentMsgSeen = false;

    const processEvents = (eventList: any[]) => {
      for (const event of eventList) {
        if (event && event.text) {
          if (event.type === "message") {
            const authorType = (event.author_id.includes("@") || event.author_id.startsWith("agent")) ? "agent" : "customer";
            const isWelcomeByFlag = event.properties?.lc2?.welcome_message === true;
            const isFirstAgentMessage = authorType === "agent" && !firstAgentMsgSeen;
            const isWelcomeByContent = isAutoWelcomeMessage(event.text, isFirstAgentMessage);
            const isWelcomeMessage = isWelcomeByFlag || isWelcomeByContent;

            if (authorType === "agent") firstAgentMsgSeen = true;
            messageCount++;
            if (authorType === "agent" && !isWelcomeMessage) agentMessageCount++;
            if (authorType === "customer") customerMessageCount++;

            messages.push({
              chat_id: threadId,
              message_id: event.id,
              author_id: event.author_id,
              author_type: authorType,
              text: event.text,
              created_at: fixTimestamp(event.created_at, apiSendsUtc),
              is_system: false,
              ...(brandId ? { brand_id: brandId } : {}),
            });
          } else if (event.type === "system_message") {
            messages.push({
              chat_id: threadId,
              message_id: event.id,
              author_id: "system",
              author_type: "system",
              text: event.text,
              created_at: fixTimestamp(event.created_at, apiSendsUtc),
              is_system: true,
              ...(brandId ? { brand_id: brandId } : {}),
            });
          }
        }
      }
    };

    if (chatMessages.length > 0) {
      processEvents(chatMessages);
    } else {
      const fallbackEvents = Object.values(lastEventPerType).map((e: any) => e?.event).filter(Boolean);
      processEvents(fallbackEvents);
    }

    const status = lastThreadSummary.active === false ? "archived" : "active";
    const endedAt = fixTimestamp(rawChatData.ended_at, apiSendsUtc);
    const durationSeconds = rawChatData.chat_duration_seconds || null;

    let firstResponseTime = rawChatData.first_response_time_seconds || null;
    if (!firstResponseTime && messages.length > 0) {
      const firstCustomerMsg = messages.find(m => m.author_type === 'customer' && !m.is_system);
      if (firstCustomerMsg) {
        const firstCustomerTime = new Date(firstCustomerMsg.created_at).getTime();
        for (const msg of messages) {
          if (msg.author_type === 'agent' && !msg.is_system) {
            const msgTime = new Date(msg.created_at).getTime();
            if (msgTime > firstCustomerTime && !isAutoWelcomeMessage(msg.text, true)) {
              firstResponseTime = Math.round((msgTime - firstCustomerTime) / 1000);
              break;
            }
          }
        }
      }
    }

    // Kaçan chat kuralları:
    // Müşteri yazdı + Agent hiç cevap vermedi (oto-karşılama hariç) + Süre >= 60sn = MISSED
    const hasCustomerMsg = customerMessageCount > 0;
    const hasAgentReply = agentMessageCount > 0;
    const isMissed = hasCustomerMsg && !hasAgentReply && (durationSeconds || 0) >= 60;

    chatRecords.push({
      id: threadId,
      chat_id: parentChatId,
      agent_name: agentName,
      customer_name: customerName,
      created_at: createdAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      message_count: messageCount,
      chat_data: chat,
      status,
      analyzed: existingAnalyzedSet.has(threadId) || false,
      synced_at: new Date().toISOString(),
      first_response_time: firstResponseTime,
      rating_score: rawChatData.rating_score != null && rawChatData.rating_score !== 0 ? rawChatData.rating_score : null,
      rating_status: rawChatData.rating_status || 'not_rated',
      rating_comment: rawChatData.rating_comment ?? null,
      has_rating_comment: rawChatData.has_rating_comment === true,
      complaint_flag: rawChatData.complaint_flag || false,
      is_missed: isMissed,
      ...(brandId ? { brand_id: brandId } : {}),
    });

    if (agentName !== "Unknown") {
      personnelMap.set(agentName, {
        name: agentName,
        updated_at: new Date().toISOString(),
        ...(brandId ? { brand_id: brandId } : {}),
      });
    }

    if (isMissed) {
      missedChatIds.push(threadId);
    }
  }

  return { chatRecords, messages, personnelMap, missedChatIds };
}

async function runSyncWork(supabase: any, jobId: string, startDate: string, endDate: string, brandId: string | null, pageLimit: number = MAX_PAGES_PER_RUN): Promise<object> {
  console.log(`[runSyncWork] Starting job ${jobId}: ${startDate} → ${endDate}`);

  await supabase.from("sync_jobs").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", jobId);

  let settingsQuery = supabase.from("settings").select("*");
  if (brandId) {
    settingsQuery = settingsQuery.eq("brand_id", brandId);
  } else {
    settingsQuery = settingsQuery.limit(1);
  }
  const { data: settings, error: settingsError } = await settingsQuery.maybeSingle();

  if (settingsError) throw new Error(`Failed to fetch settings: ${settingsError.message}`);
  if (!settings?.livechat_api_key) throw new Error("LiveChat API key not configured");

  let livechatBaseUrl = "https://livechat.systemtest.store";
  if (brandId) {
    const { data: brandData } = await supabase.from("brands").select("livechat_url").eq("id", brandId).maybeSingle();
    if (brandData?.livechat_url) {
      livechatBaseUrl = brandData.livechat_url.replace(/\/$/, "");
    }
  }

  const limitLabel = pageLimit > 0 ? (pageLimit + " pages, max " + (pageLimit * 100) + " chats") : "UNLIMITED (manual sync)";
  console.log("Page limit per run: " + limitLabel);

  const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
  const istanbulNow = new Date(Date.now() + ISTANBUL_OFFSET_MS);

  let apiTreatsZAsIstanbul = false;
  try {
    const probeUrl = livechatBaseUrl + "/api/v1/chats?page=1&per_page=1&sort_by=created_at&sort_order=desc";
    const probeRes = await fetchWithRetry(probeUrl, { headers: { "X-API-Key": settings.livechat_api_key } }, 2, 1000);
    if (probeRes.ok) {
      const probeData = await probeRes.json();
      const probeChats = probeData.data || [];
      if (probeChats.length > 0) {
        const sampleTs = probeChats[0].created_at || "";
        apiTreatsZAsIstanbul = typeof sampleTs === "string" && sampleTs.includes("+");
        console.log(apiTreatsZAsIstanbul
          ? "🔍 API sends +03:00 timestamps → Z in query params is treated as Istanbul, will offset dates"
          : "🔍 API sends Z timestamps → Z in query params is treated as UTC, no offset needed");
      }
    }
  } catch (e) {
    console.log("Probe failed, assuming UTC:", (e as Error).message);
  }

  const apiStartDate = apiTreatsZAsIstanbul
    ? new Date(new Date(startDate).getTime() + ISTANBUL_OFFSET_MS).toISOString()
    : new Date(startDate).toISOString();
  const apiEndDate = apiTreatsZAsIstanbul
    ? new Date(new Date(endDate).getTime() + ISTANBUL_OFFSET_MS).toISOString()
    : new Date(endDate).toISOString();

  console.log(`Fetching chats: UTC ${startDate} → ${endDate} | API query: ${apiStartDate} → ${apiEndDate}`);

  const executionStartTime = Date.now();
  let currentPage = 1;
  let hasMorePages = true;
  const perPage = 100;

  let totalSynced = 0;
  let totalMessages = 0;
  let totalMissedAlerts = 0;
  let totalAlertsSent = 0;
  const allMissedChatIds: string[] = [];
  let pageLimitReached = false;
  let newestChatDate: string | null = null;

  // Detayli rapor metrikleri
  let newChats = 0;
  let updatedChats = 0;
  let ratingChanged = 0;
  let ratingNewlyAdded = 0;
  let ratingRemoved = 0;
  let missedStatusChanged = 0;
  const ratingChanges: Array<{ chat_id: string; agent: string; old_score: number | null; new_score: number | null; old_status: string | null; new_status: string | null }> = [];

  while (hasMorePages) {
    if (pageLimit > 0 && currentPage > pageLimit) {
      pageLimitReached = true;
      console.log("Page limit (" + pageLimit + ") reached - stopping. Next cron run will continue from last_sync_at.");
      break;
    }
    console.log(`Fetching page ${currentPage}...`);

    const chatApiUrl = livechatBaseUrl + "/api/v1/chats"
      + "?page=" + currentPage
      + "&per_page=" + perPage
      + "&start_date=" + apiStartDate
      + "&end_date=" + apiEndDate
      + "&sort_by=created_at&sort_order=asc";
    const livechatResponse = await fetchWithRetry(
      chatApiUrl,
      { headers: { "X-API-Key": settings.livechat_api_key } },
      3, 2000
    );

    if (!livechatResponse.ok) {
      throw new Error(`LiveChat API error: ${livechatResponse.statusText}`);
    }

    const livechatData = await livechatResponse.json();
    const pageChats = livechatData.data || [];

    if (pageChats.length === 0) {
      hasMorePages = false;
      break;
    }

    if (currentPage === 1) {
      if (!apiTreatsZAsIstanbul) {
        console.log("⚠️ API sends Istanbul time as Z - will fix timestamps to +03:00");
      }
      (globalThis as any).__apiSendsUtc = apiTreatsZAsIstanbul;
    }

    console.log(`Page ${currentPage}: ${pageChats.length} chats — processing immediately...`);

    const pageThreadIds = pageChats.map((chat: any) => {
      const lastThreadSummary = chat.properties?.full_chat_data?.last_thread_summary || {};
      return lastThreadSummary.id || chat.id;
    });

    const existingAnalyzedSet = new Set<string>();
    // Mevcut chat'leri cek (rating karsilastirmasi icin)
    const existingChatsMap = new Map<string, any>();
    for (let i = 0; i < pageThreadIds.length; i += 500) {
      const batchIds = pageThreadIds.slice(i, i + 500);
      const { data: existingChats } = await supabase
        .from("chats")
        .select("id, analyzed, rating_score, rating_status, is_missed")
        .in("id", batchIds);
      if (existingChats) {
        existingChats.forEach((c: any) => {
          existingChatsMap.set(c.id, c);
          if (c.analyzed) existingAnalyzedSet.add(c.id);
        });
      }
    }

    const apiSendsUtc = (globalThis as any).__apiSendsUtc !== false;
    const { chatRecords, messages, personnelMap, missedChatIds } = processPageChats(pageChats, brandId, existingAnalyzedSet, apiSendsUtc);

    // Yeni vs guncellenen chat'leri ve rating degisikliklerini takip et
    for (const chat of chatRecords) {
      const existing = existingChatsMap.get(chat.id);
      if (!existing) {
        newChats++;
      } else {
        updatedChats++;
        const oldScore = existing.rating_score;
        const newScore = chat.rating_score;
        const oldStatus = existing.rating_status;
        const newStatus = chat.rating_status;

        if (oldScore !== newScore || oldStatus !== newStatus) {
          ratingChanged++;
          if (!oldScore && newScore) ratingNewlyAdded++;
          if (oldScore && !newScore) ratingRemoved++;
          if (ratingChanges.length < 50) {
            ratingChanges.push({ chat_id: chat.id, agent: chat.agent_name, old_score: oldScore, new_score: newScore, old_status: oldStatus, new_status: newStatus });
          }
        }
        if (existing.is_missed !== chat.is_missed) {
          missedStatusChanged++;
        }
      }
    }

    await batchUpsert(supabase, "chats", chatRecords, "id");
    console.log(`  ✓ ${chatRecords.length} chats upserted (${chatRecords.length - updatedChats} new, ${updatedChats} updated)`);

    if (messages.length > 0) {
      await batchUpsert(supabase, "chat_messages", messages, "message_id", true);
      console.log(`  ✓ ${messages.length} messages upserted`);
      totalMessages += messages.length;
    }

    const personnelRecords = Array.from(personnelMap.values());
    if (personnelRecords.length > 0) {
      await batchUpsert(supabase, "personnel", personnelRecords, "name,brand_id", true);
    }

    totalSynced += chatRecords.length;
    allMissedChatIds.push(...missedChatIds);

    for (const chat of chatRecords) {
      if (chat.created_at && (!newestChatDate || chat.created_at > newestChatDate)) {
        newestChatDate = chat.created_at;
      }
    }

    await supabase.from("sync_jobs").update({
      result: { pages_done: currentPage, chats_synced: totalSynced, messages_synced: totalMessages }
    }).eq("id", jobId);

    currentPage++;

    if (livechatData.pagination) {
      const { page, total_pages, total } = livechatData.pagination;
      console.log(`Pagination: Page ${page}/${total_pages}, Total: ${total}`);
      hasMorePages = page < total_pages;
    } else {
      if (pageChats.length < perPage) hasMorePages = false;
    }

    if (hasMorePages) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  if (allMissedChatIds.length > 0) {
    const { data: existingAlerts } = await supabase
      .from("alerts")
      .select("chat_id")
      .in("chat_id", allMissedChatIds)
      .eq("alert_type", "missed_chat");

    const existingAlertChatIds = new Set((existingAlerts || []).map((a: any) => a.chat_id));

    const { data: missedChatRecords } = await supabase
      .from("chats")
      .select("id, chat_id, agent_name, customer_name, created_at")
      .in("id", allMissedChatIds);

    const missedChatMap = new Map((missedChatRecords || []).map((c: any) => [c.id, c]));

    const missedAlerts = allMissedChatIds
      .filter(tid => !existingAlertChatIds.has(tid))
      .map(tid => {
        const chat = missedChatMap.get(tid);
        const chatDate = new Date(chat?.created_at || Date.now()).toLocaleString('tr-TR', {
          year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        return {
          chat_id: tid,
          analysis_id: null,
          alert_type: "missed_chat",
          severity: "high",
          message: `⚠️ KAÇIRILMIŞ CHAT\n\nChat ID: ${chat?.chat_id}\nThread ID: ${tid}\nTarih: ${chatDate}\nTemsilci: ${chat?.agent_name}\nMüşteri: ${chat?.customer_name}\n\nBu chat müşteri tarafından başlatıldı ancak hiç yanıt alınamadı.`,
          sent_to_telegram: false,
          ...(brandId ? { brand_id: brandId } : {}),
        };
      });

    if (missedAlerts.length > 0) {
      await supabase.from("alerts").insert(missedAlerts);
      totalMissedAlerts = missedAlerts.length;
      console.log(`✓ ${missedAlerts.length} missed chat alerts created`);

      if (settings.telegram_bot_token && settings.telegram_chat_id) {
        for (const alert of missedAlerts.slice(0, 10)) {
          try {
            const tgResponse = await fetch(
              `https://api.telegram.org/bot${settings.telegram_bot_token}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: settings.telegram_chat_id, text: alert.message }),
              }
            );
            if (tgResponse.ok) totalAlertsSent++;
          } catch (_e) { }
        }
      }
    }
  }

  const { count: totalChats } = await supabase.from("chats").select("*", { count: "exact", head: true });
  const totalExecutionTime = Date.now() - executionStartTime;

  const result = {
    success: true,
    synced: totalSynced,
    messages_synced: totalMessages,
    pages_fetched: currentPage - 1,
    alerts_created: totalMissedAlerts,
    alerts_sent: totalAlertsSent,
    total_chats: totalChats,
    page_limit_reached: pageLimitReached,
    timestamp: new Date().toISOString(),
    timestamp_istanbul: istanbulNow.toISOString().replace('T', ' ').substring(0, 19),
    execution_time_seconds: Math.floor(totalExecutionTime / 1000),
    // Detayli rapor
    new_chats: newChats,
    updated_chats: updatedChats,
    rating_changes: {
      total: ratingChanged,
      newly_added: ratingNewlyAdded,
      removed: ratingRemoved,
      details: ratingChanges,
    },
    missed_status_changed: missedStatusChanged,
  };

  console.log(`\n✅ Sync complete in ${result.execution_time_seconds}s:`);
  console.log(`  📊 ${result.synced} chat islendi (${newChats} yeni, ${updatedChats} guncellendi)`);
  console.log(`  💬 ${result.messages_synced} mesaj`);
  if (ratingChanged > 0) {
    console.log(`  ⭐ ${ratingChanged} chatte rating degisti (${ratingNewlyAdded} yeni eklendi, ${ratingRemoved} kaldirildi)`);
    for (const rc of ratingChanges.slice(0, 10)) {
      console.log(`    → ${rc.agent} | ${rc.chat_id} | ${rc.old_score ?? '-'}→${rc.new_score ?? '-'} | ${rc.old_status ?? '-'}→${rc.new_status ?? '-'}`);
    }
  }
  if (missedStatusChanged > 0) console.log(`  ⚠️ ${missedStatusChanged} chatte kacirma durumu degisti`);
  if (pageLimitReached) console.log(`  📄 Page limit reached, daha fazla veri bekliyor`);

  await supabase.from("sync_jobs").update({ status: "completed", completed_at: new Date().toISOString(), result }).eq("id", jobId);

  if (brandId) {
    const now = new Date();
    const nowStr = now.toISOString();
    let nextSyncAt: string;
    // API gecikmeli chat'leri yakalamak icin last_sync_at 15dk geride kalir
    const overlapBack = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    if (pageLimitReached && newestChatDate) {
      // Page limit'e takildi - en eski pozisyondan devam et
      nextSyncAt = new Date(new Date(newestChatDate).getTime() + 1000).toISOString();
    } else {
      // Normal sync - 15dk overlap birak
      nextSyncAt = overlapBack;
    }
    if (nextSyncAt > nowStr) nextSyncAt = nowStr;
    await supabase.from("brands").update({ last_sync_at: nextSyncAt }).eq("id", brandId);
    console.log("Updated brands.last_sync_at to " + nextSyncAt + " for brand " + brandId);
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  console.log("=== Sync LiveChat Function Started ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase environment variables not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase
      .from("sync_jobs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error: "Job timeout - exceeded 10 minutes" })
      .eq("status", "processing")
      .lt("started_at", tenMinutesAgo);

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from("sync_jobs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error: "Job stuck in pending - async trigger failed, please retry" })
      .eq("status", "pending")
      .lt("created_at", fiveMinutesAgo);

    const url = new URL(req.url);
    const brandId = url.searchParams.get("brand_id") || null;
    const backgroundMode = url.searchParams.get("background") === "true";
    const jobId = url.searchParams.get("job_id");

    if (!jobId) {
      let runningJobsQuery = supabase
        .from("sync_jobs")
        .select("id, started_at")
        .eq("status", "processing");

      if (brandId) {
        runningJobsQuery = runningJobsQuery.eq("brand_id", brandId);
      } else {
        runningJobsQuery = runningJobsQuery.is("brand_id", null);
      }

      const { data: runningJobs } = await runningJobsQuery
        .order("started_at", { ascending: false })
        .limit(1);

      if (runningJobs && runningJobs.length > 0) {
        const runningJob = runningJobs[0];
        const runningDuration = Date.now() - new Date(runningJob.started_at).getTime();
        if (runningDuration < 10 * 60 * 1000) {
          console.log(`Another job is already running: ${runningJob.id}`);
          return new Response(
            JSON.stringify({ success: false, error: "Another sync job is already running.", running_job_id: runningJob.id }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const startParam = url.searchParams.get("start_date");
    const endParam = url.searchParams.get("end_date");
    const daysParam = url.searchParams.get("days");

    let startDate: string;
    let endDate: string;
    let days: number | null = null;
    const isManualSync = !!(startParam || daysParam);
    const MANUAL_PAGE_LIMIT = 50;

    if (startParam && endParam) {
      startDate = new Date(startParam).toISOString();
      endDate = new Date(endParam).toISOString();
    } else if (daysParam) {
      days = parseInt(daysParam, 10);
      const now = new Date();
      startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)).toISOString();
      endDate = now.toISOString();
    } else if (brandId) {
      const { data: brandRow } = await supabase
        .from("brands")
        .select("last_sync_at")
        .eq("id", brandId)
        .maybeSingle();
      const now = new Date();
      const lastSync = brandRow?.last_sync_at ? new Date(brandRow.last_sync_at) : new Date(now.getTime() - 20 * 60 * 1000);
      const gapMs = now.getTime() - lastSync.getTime();
      const chunkMs = gapMs > 24 * 60 * 60 * 1000
        ? 24 * 60 * 60 * 1000
        : 10 * 60 * 1000;
      startDate = lastSync.toISOString();
      endDate = new Date(Math.min(now.getTime(), lastSync.getTime() + chunkMs)).toISOString();
      console.log(`Auto-computed date range from last_sync_at: ${startDate} → ${endDate} (gap: ${Math.round(gapMs / 3600000)}h, chunk: ${chunkMs / 60000}min)`);
    } else {
      const now = new Date();
      startDate = new Date(now.getTime() - (20 * 60 * 1000)).toISOString();
      endDate = now.toISOString();
    }

    if (jobId) {
      const { data: existingJob } = await supabase
        .from("sync_jobs")
        .select("start_date, end_date, days")
        .eq("id", jobId)
        .maybeSingle();

      if (existingJob) {
        startDate = existingJob.start_date;
        endDate = existingJob.end_date;
        days = existingJob.days;
      }

      const manualLimit = isManualSync ? MANUAL_PAGE_LIMIT : MAX_PAGES_PER_RUN;
      const result = await runSyncWork(supabase, jobId, startDate, endDate, brandId, manualLimit);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: newJob, error: jobError } = await supabase
      .from("sync_jobs")
      .insert({ status: "pending", start_date: startDate, end_date: endDate, days, brand_id: brandId })
      .select()
      .single();

    if (jobError || !newJob) {
      throw new Error(`Failed to create job: ${jobError?.message}`);
    }

    const syncPageLimit = isManualSync ? MANUAL_PAGE_LIMIT : MAX_PAGES_PER_RUN;

    if (backgroundMode) {
      const workPromise = runSyncWork(supabase, newJob.id, startDate, endDate, brandId, syncPageLimit).catch(async (err) => {
        console.error(`[runSyncWork] Background job ${newJob.id} failed:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err || "Unknown error");
        await supabase.from("sync_jobs").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: errorMessage,
        }).eq("id", newJob.id);
      });

      try {
        EdgeRuntime.waitUntil(workPromise);
      } catch (_e) {
        workPromise;
      }

      return new Response(
        JSON.stringify({ success: true, job_id: newJob.id, status: "processing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await runSyncWork(supabase, newJob.id, startDate, endDate, brandId, syncPageLimit);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Pipeline error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error");

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
