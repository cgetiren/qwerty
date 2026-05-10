import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function setWebhook(botToken: string, webhookUrl: string): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
  });
  return await res.json();
}

async function getWebhookInfo(botToken: string): Promise<{ url: string; pending_update_count: number }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const data = await res.json();
  return data.result ?? {};
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

    const baseUrl = Deno.env.get("SUPABASE_URL")!.replace("https://", "https://") + "/functions/v1";

    const { data: brands } = await supabase
      .from("brands")
      .select("id, name, slug, telegram_callback_bot_token, telegram_finance_bot_token")
      .eq("is_active", true);

    const { data: settings } = await supabase
      .from("settings")
      .select("brand_id, telegram_bot_token");

    const MARKBIA_BRAND_ID = "c1fbe05a-a1f0-4811-af59-6aa8c79032ba";
    const BENJA_BRAND_ID = "00000000-0000-0000-0000-000000000001";

    const results: Array<{ bot: string; url: string; result: any; current?: string }> = [];

    for (const brand of (brands ?? [])) {
      if (!brand.telegram_callback_bot_token) continue;

      const webhookUrl = `${baseUrl}/callback-telegram-webhook?brand=${brand.slug}`;
      const current = await getWebhookInfo(brand.telegram_callback_bot_token);
      const result = await setWebhook(brand.telegram_callback_bot_token, webhookUrl);

      results.push({
        bot: `${brand.name} callback botu`,
        url: webhookUrl,
        current: current.url || "(kayıtlı değil)",
        result,
      });
    }

    // Finance bot webhooks
    for (const brand of (brands ?? [])) {
      if (!brand.telegram_finance_bot_token) continue;

      const webhookUrl = `${baseUrl}/finance-telegram-webhook?brand=${brand.slug}`;
      const current = await getWebhookInfo(brand.telegram_finance_bot_token);
      const result = await setWebhook(brand.telegram_finance_bot_token, webhookUrl);

      results.push({
        bot: `${brand.name} finans botu`,
        url: webhookUrl,
        current: current.url || "(kayıtlı değil)",
        result,
      });
    }

    for (const s of (settings ?? [])) {
      if (!s.telegram_bot_token) continue;

      let functionName: string;
      if (s.brand_id === MARKBIA_BRAND_ID) {
        functionName = "telegram-webhook-markbia";
      } else if (s.brand_id === BENJA_BRAND_ID) {
        functionName = "telegram-webhook-benja";
      } else {
        functionName = "telegram-webhook";
      }

      const webhookUrl = `${baseUrl}/${functionName}`;
      const current = await getWebhookInfo(s.telegram_bot_token);
      const result = await setWebhook(s.telegram_bot_token, webhookUrl);

      const brand = brands?.find(b => b.id === s.brand_id);
      results.push({
        bot: `${brand?.name ?? s.brand_id} analiz botu`,
        url: webhookUrl,
        current: current.url || "(kayıtlı değil)",
        result,
      });
    }

    return new Response(JSON.stringify({ success: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("register-telegram-webhooks error:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
