import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callerIsAdmin(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("is_founder")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_founder) return true;

  const { data: permData } = await supabaseAdmin
    .rpc("get_user_permissions", { p_user_id: userId });

  return permData?.["admin.users.edit"] === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get caller from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Yetkisiz erisim", 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) return err("Yetkisiz erisim: gecersiz oturum", 401);

    const isAdmin = await callerIsAdmin(supabaseAdmin, caller.id);
    if (!isAdmin) return err("Yetkiniz yok", 403);

    const body = await req.json();
    const { action, target_user_id } = body;

    if (action === "list") {
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) return err(listError.message);

      // listUsers doesn't return factors - fetch each user individually
      const mfaStatuses = await Promise.all(users.map(async (u) => {
        const { data: { user: fullUser } } = await supabaseAdmin.auth.admin.getUserById(u.id);
        const factors = fullUser?.factors || [];
        return {
          id: u.id,
          email: u.email,
          mfa_enabled: factors.some((f: any) => f.status === "verified" && f.factor_type === "totp"),
          factors_count: factors.filter((f: any) => f.factor_type === "totp").length,
        };
      }));

      return ok({ users: mfaStatuses });
    }

    if (action === "reset" && target_user_id) {
      const { data: { user: targetUser }, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(target_user_id);
      if (getUserError || !targetUser) return err("Kullanici bulunamadi");

      const totpFactors = (targetUser.factors || []).filter((f: any) => f.factor_type === "totp");

      if (totpFactors.length === 0) {
        return ok({ success: true, message: "Bu kullanicinin 2FA ayari yok" });
      }

      for (const factor of totpFactors) {
        const { error: unenrollError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
          userId: target_user_id,
          factorId: factor.id,
        });
        if (unenrollError) {
          console.error("Factor delete error:", unenrollError);
          return err("2FA sifirlanamadi: " + unenrollError.message);
        }
      }

      return ok({ success: true, message: `${totpFactors.length} 2FA faktoru sifirlandi` });
    }

    return err("Gecersiz action. Kullanilabilir: list, reset");
  } catch (e) {
    console.error("manage-mfa error:", e);
    return err(String(e), 500);
  }
});
