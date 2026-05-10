/**
 * Creates or updates a local dev user:
 *   Username (login): admin  → email admin@takip.local
 *   Password: admin123
 *
 * Requires in .env (or environment):
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Dashboard → Project Settings → API → service_role)
 *
 * Run: npm run seed:local-admin
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const USERNAME = 'admin';
const EMAIL = `${USERNAME}@takip.local`;
const PASSWORD = 'admin123';

function loadDotEnv() {
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  loadDotEnv();

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      'Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY in .env'
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId: string;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: USERNAME,
      full_name: 'Local Admin',
      avatar_color: '#0891b2',
    },
  });

  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? '';
    if (
      msg.includes('already') ||
      msg.includes('registered') ||
      (createErr as { status?: number }).status === 422
    ) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (listErr) {
        console.error('Could not list users:', listErr.message);
        process.exit(1);
      }
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
      if (!existing) {
        console.error('User exists but could not find by email:', EMAIL);
        process.exit(1);
      }
      userId = existing.id;
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: {
          username: USERNAME,
          full_name: 'Local Admin',
          avatar_color: '#0891b2',
        },
      });
      if (updErr) {
        console.error('Failed to reset password:', updErr.message);
        process.exit(1);
      }
      console.log('Updated existing auth user:', EMAIL);
    } else {
      console.error('createUser failed:', createErr.message);
      process.exit(1);
    }
  } else if (created.user) {
    userId = created.user.id;
    console.log('Created auth user:', EMAIL);
  } else {
    console.error('createUser returned no user');
    process.exit(1);
  }

  const { error: profileErr } = await admin.from('user_profiles').upsert(
    {
      id: userId,
      full_name: 'Local Admin',
      username: USERNAME,
      is_active: true,
      avatar_color: '#0891b2',
      is_founder: true,
    },
    { onConflict: 'id' }
  );

  if (profileErr) {
    console.error('user_profiles upsert failed:', profileErr.message);
    process.exit(1);
  }

  const { data: adminRole, error: roleErr } = await admin
    .from('roles')
    .select('id')
    .eq('name', 'Admin')
    .maybeSingle();

  if (roleErr || !adminRole?.id) {
    console.error(
      'Could not load Admin role. Apply supabase migrations first.',
      roleErr?.message
    );
    process.exit(1);
  }

  await admin.from('user_roles').delete().eq('user_id', userId);

  const { error: insertRoleErr } = await admin.from('user_roles').insert({
    user_id: userId,
    role_id: adminRole.id,
    assigned_at: new Date().toISOString(),
  });

  if (insertRoleErr) {
    console.error('user_roles insert failed:', insertRoleErr.message);
    process.exit(1);
  }

  console.log('');
  console.log('Done. Local login:');
  console.log('  Kullanici adi: admin');
  console.log('  Sifre:        admin123');
  console.log('');
  console.log('Then: npm run dev → sign in on the login page.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
