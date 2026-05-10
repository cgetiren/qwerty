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

async function callerHasPermission(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  permissionKey: string
): Promise<boolean> {
  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("is_founder")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_founder) return true;

  const { data: permData } = await supabaseAdmin
    .from("permissions")
    .select("id")
    .eq("key", permissionKey)
    .maybeSingle();

  if (!permData) return false;

  const { data: userRoles } = await supabaseAdmin
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);

  const roleIds = (userRoles ?? []).map((r: { role_id: string }) => r.role_id);

  if (roleIds.length > 0) {
    const { count } = await supabaseAdmin
      .from("role_permissions")
      .select("*", { count: "exact", head: true })
      .in("role_id", roleIds)
      .eq("permission_id", permData.id)
      .eq("granted", true);

    if ((count ?? 0) > 0) return true;
  }

  const { data: override } = await supabaseAdmin
    .from("user_permission_overrides")
    .select("granted")
    .eq("user_id", userId)
    .eq("permission_id", permData.id)
    .eq("granted", true)
    .maybeSingle();

  return override?.granted === true;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return ok({ error: "Yetkisiz erisim" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return ok({ error: "Yetkisiz erisim: gecersiz oturum" });
    }

    const allowed = await callerHasPermission(supabaseAdmin, user.id, "admin.users.edit");
    if (!allowed) {
      return ok({ error: "Yetkisiz erisim: bu islemi yapmaya yetkiniz yok" });
    }

    const body = await req.json();
    const { target_user_id, new_password } = body;

    if (!target_user_id || !new_password) {
      return ok({ error: "Kullanici ID ve yeni sifre zorunludur" });
    }

    if (new_password.length < 6) {
      return ok({ error: "Sifre en az 6 karakter olmalidir" });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      target_user_id,
      { password: new_password }
    );

    if (updateError) {
      return ok({ error: `Sifre guncellenemedi: ${updateError.message}` });
    }

    return ok({ success: true });
  } catch (err: unknown) {
    return ok({ error: `Beklenmeyen hata: ${String(err)}` });
  }
});
