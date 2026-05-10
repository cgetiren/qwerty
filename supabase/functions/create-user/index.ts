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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return ok({ error: "Yetkisiz erisim" });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return ok({ error: "Yetkisiz erisim: gecersiz oturum" });
    }

    const allowed = await callerHasPermission(supabaseAdmin, user.id, "admin.users.create");
    if (!allowed) {
      return ok({ error: "Yetkisiz erisim: bu islemi yapmaya yetkiniz yok" });
    }

    const body = await req.json();
    const { password, full_name, username, role_ids, brand_ids, is_active, avatar_color } = body;

    if (!username || !password) {
      return ok({ error: "kullanici adi ve password zorunludur" });
    }

    const safeUsername = username
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "user";
    const email = `${safeUsername}@takip.local`;

    if (username) {
      const { data: existing } = await supabaseAdmin
        .from("user_profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (existing) {
        return ok({ error: `"${username}" kullanici adi zaten kullaniliyor` });
      }
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name ?? '',
        username: username ?? '',
        avatar_color: avatar_color ?? '#0891b2',
      },
    });

    if (error) {
      return ok({ error: error.message });
    }

    const userId = data.user.id;

    const { error: upsertError } = await supabaseAdmin.from("user_profiles").upsert({
      id: userId,
      full_name: full_name ?? '',
      username: username ?? null,
      is_active: is_active ?? true,
      avatar_color: avatar_color ?? '#0891b2',
    }, { onConflict: 'id' });

    if (upsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return ok({ error: `Profil olusturulamadi: ${upsertError.message}` });
    }

    if (Array.isArray(role_ids) && role_ids.length > 0) {
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert(
        role_ids.map((rid: string) => ({
          user_id: userId,
          role_id: rid,
          assigned_at: new Date().toISOString(),
        }))
      );

      if (roleError) {
        return ok({ error: `Kullanici olusturuldu fakat rol atanamazdi: ${roleError.message}` });
      }
    }

    if (Array.isArray(brand_ids) && brand_ids.length > 0) {
      await supabaseAdmin.from("brand_members").insert(
        brand_ids.map((bid: string) => ({
          brand_id: bid,
          user_id: userId,
          joined_at: new Date().toISOString(),
          is_active: true,
        }))
      );
    }

    return ok({ success: true, user_id: userId });
  } catch (err: unknown) {
    return ok({ error: `Beklenmeyen hata: ${String(err)}` });
  }
});
