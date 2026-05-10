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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_founder")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_founder) {
      return new Response(JSON.stringify({ success: false, error: "Sadece kurucular marka yonetebilir" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      action, id, name, slug, color, logo_url,
      livechat_api_key, claude_api_key,
      livechat_url,
      telegram_alert_bot_token, telegram_alert_chat_id,
      telegram_callback_bot_token, telegram_callback_chat_id,
      telegram_finance_bot_token, telegram_finance_chat_id,
      polling_interval,
    } = body;

    if (action === "create") {
      if (!name || !slug) {
        return new Response(JSON.stringify({ success: false, error: "Marka adi ve slug zorunludur" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newBrand, error: insertError } = await supabase
        .from("brands")
        .insert({
          name, slug,
          color: color ?? "#3B82F6",
          logo_url: logo_url ?? "",
          created_by: user.id,
          livechat_api_key: livechat_api_key ?? null,
          claude_api_key: claude_api_key ?? null,
          livechat_url: livechat_url?.trim() || null,
          telegram_alert_bot_token: telegram_alert_bot_token ?? null,
          telegram_alert_chat_id: telegram_alert_chat_id ?? null,
          telegram_callback_bot_token: telegram_callback_bot_token ?? null,
          telegram_callback_chat_id: telegram_callback_chat_id ?? null,
          telegram_finance_bot_token: telegram_finance_bot_token ?? null,
          telegram_finance_chat_id: telegram_finance_chat_id ?? null,
          polling_interval: polling_interval ?? 5,
        })
        .select()
        .single();

      if (insertError) {
        const msg = insertError.code === "23505"
          ? "Bu slug zaten kullaniliyor. Farkli bir slug deneyin."
          : insertError.message;
        return new Response(JSON.stringify({ success: false, error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("brand_members").insert({
        brand_id: newBrand.id,
        user_id: user.id,
      }).catch(() => {});

      await supabase.from("settings").upsert({
        brand_id: newBrand.id,
        livechat_api_key: livechat_api_key ?? null,
        claude_api_key: claude_api_key ?? null,
        telegram_bot_token: telegram_alert_bot_token ?? null,
        telegram_chat_id: telegram_alert_chat_id ?? null,
        polling_interval: polling_interval ?? 5,
      }, { onConflict: "brand_id" }).catch((e: Error) => {
        console.warn("settings upsert warning:", e.message);
      });

      return new Response(JSON.stringify({ success: true, brand: newBrand }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      if (!id) {
        return new Response(JSON.stringify({ success: false, error: "Marka ID zorunludur" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (slug !== undefined) updateData.slug = slug;
      if (color !== undefined) updateData.color = color;
      if (logo_url !== undefined) updateData.logo_url = logo_url;
      if (livechat_api_key !== undefined) updateData.livechat_api_key = livechat_api_key || null;
      if (claude_api_key !== undefined) updateData.claude_api_key = claude_api_key || null;
      if (livechat_url !== undefined) updateData.livechat_url = livechat_url?.trim() || null;
      if (telegram_alert_bot_token !== undefined) updateData.telegram_alert_bot_token = telegram_alert_bot_token || null;
      if (telegram_alert_chat_id !== undefined) updateData.telegram_alert_chat_id = telegram_alert_chat_id || null;
      if (telegram_callback_bot_token !== undefined) updateData.telegram_callback_bot_token = telegram_callback_bot_token || null;
      if (telegram_callback_chat_id !== undefined) updateData.telegram_callback_chat_id = telegram_callback_chat_id || null;
      if (telegram_finance_bot_token !== undefined) updateData.telegram_finance_bot_token = telegram_finance_bot_token || null;
      if (telegram_finance_chat_id !== undefined) updateData.telegram_finance_chat_id = telegram_finance_chat_id || null;
      if (polling_interval !== undefined) updateData.polling_interval = polling_interval;

      const { data: updated, error: updateError } = await supabase
        .from("brands")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        const msg = updateError.code === "23505"
          ? "Bu slug zaten kullaniliyor."
          : updateError.message;
        return new Response(JSON.stringify({ success: false, error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const settingsUpdate: Record<string, unknown> = { brand_id: id };
      if (livechat_api_key !== undefined) settingsUpdate.livechat_api_key = livechat_api_key || null;
      if (claude_api_key !== undefined) settingsUpdate.claude_api_key = claude_api_key || null;
      if (telegram_alert_bot_token !== undefined) settingsUpdate.telegram_bot_token = telegram_alert_bot_token || null;
      if (telegram_alert_chat_id !== undefined) settingsUpdate.telegram_chat_id = telegram_alert_chat_id || null;
      if (polling_interval !== undefined) settingsUpdate.polling_interval = polling_interval;

      await supabase.from("settings").upsert(settingsUpdate, { onConflict: "brand_id" }).catch((e: Error) => {
        console.warn("settings update warning:", e.message);
      });

      return new Response(JSON.stringify({ success: true, brand: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Gecersiz islem" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("manage-brands error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Sunucu hatasi" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
