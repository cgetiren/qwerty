/**
 * Applies all files in supabase/migrations/*.sql to a remote Postgres (Supabase)
 * in filename order. Use when `supabase db push` is not available.
 *
 * .env:
 *   VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
 *   SUPABASE_DB_PASSWORD=your_database_password   (project creation password)
 *
 * Or set full URI (from Dashboard → Database → Connection string):
 *   DATABASE_URL=postgresql://postgres:PASSWORD@db.YOUR_REF.supabase.co:5432/postgres
 *
 * If direct host fails (IPv6 / DNS), set session pooler URI or:
 *   SUPABASE_POOLER_REGION=eu-central-1
 * (username becomes postgres.REF — see Supabase "Session mode" connection string.)
 *
 * Run: npm run db:apply-migrations
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { promises as dns } from 'dns';
import pg from 'pg';

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

function projectRefFromViteUrl(viteUrl: string): string | null {
  const host = viteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const ref = host.split('.')[0];
  return ref || null;
}

const POOLER_REGION_FALLBACKS = [
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-north-1',
  'us-east-1',
  'us-west-1',
  'ap-south-1',
  'ap-southeast-1',
];

async function connectClient(
  connectionString: string
): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/** When hostname only resolves to IPv6, some Node/OS combos fail; connect by resolved IP. */
async function connectDirectByDns(
  ref: string,
  password: string
): Promise<pg.Client | null> {
  const hostname = `db.${ref}.supabase.co`;
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    return null;
  }
  for (const r of records) {
    try {
      const client = new pg.Client({
        host: r.address,
        port: 5432,
        user: 'postgres',
        password,
        database: 'postgres',
        ssl: {
          rejectUnauthorized: false,
          servername: `db.${ref}.supabase.co`,
        },
      });
      await client.connect();
      return client;
    } catch {
      /* try next address */
    }
  }
  return null;
}

async function openMigrationClient(
  pass: string,
  viteUrl: string
): Promise<{ client: pg.Client; via: string }> {
  const ref = projectRefFromViteUrl(viteUrl);
  if (!ref) throw new Error('Could not parse project ref from VITE_SUPABASE_URL');

  const enc = encodeURIComponent(pass);
  const forcedRegion = process.env.SUPABASE_POOLER_REGION?.trim();
  if (forcedRegion) {
    const user = encodeURIComponent(`postgres.${ref}`);
    const pooler = `postgresql://${user}:${enc}@aws-0-${forcedRegion}.pooler.supabase.com:5432/postgres`;
    const c = await connectClient(pooler);
    return { client: c, via: `session pooler ${forcedRegion}:5432` };
  }

  const direct = `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`;
  const transactionPooler = `postgresql://postgres:${enc}@db.${ref}.supabase.co:6543/postgres`;

  const attempts: Array<{ label: string; connect: () => Promise<pg.Client> }> = [
    {
      label: 'direct (db.*:5432, IPv6)',
      connect: () => connectClient(direct),
    },
    {
      label: 'transaction pooler (db.*:6543, IPv4/IPv6)',
      connect: () => connectClient(transactionPooler),
    },
    {
      label: 'direct via resolved IP + TLS SNI',
      connect: async () => {
        const c = await connectDirectByDns(ref, pass);
        if (!c) throw new Error('DNS/IP connect skipped');
        return c;
      },
    },
    ...POOLER_REGION_FALLBACKS.map((region) => ({
      label: `session pooler aws-0-${region}:5432`,
      connect: () => {
        const user = encodeURIComponent(`postgres.${ref}`);
        return connectClient(
          `postgresql://${user}:${enc}@aws-0-${region}.pooler.supabase.com:5432/postgres`
        );
      },
    })),
  ];

  const errors: string[] = [];
  for (const { label, connect } of attempts) {
    try {
      const c = await connect();
      if (label.startsWith('session pooler')) {
        console.log(`Connected via ${label}\n`);
      }
      return { client: c, via: label };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${msg}`);
    }
  }

  console.error(
    'Could not connect to Postgres. Paste the exact URI from Supabase:\n' +
      '  Dashboard → Connect (top) → Session pooler or Transaction pooler\n' +
      'into .env as DATABASE_URL=... then run npm run db:apply-migrations again.\n'
  );
  throw new Error(errors.join('\n'));
}

async function main() {
  loadDotEnv();
  const dbUrl = process.env.DATABASE_URL?.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  const viteUrl = process.env.VITE_SUPABASE_URL?.trim();

  let client: pg.Client;

  if (dbUrl) {
    client = await connectClient(dbUrl);
    console.log('Connected (DATABASE_URL).\n');
  } else if (pass && viteUrl) {
    const opened = await openMigrationClient(pass, viteUrl);
    client = opened.client;
    console.log(`Connected (${opened.via}).\n`);
  } else {
    console.error(
      'Set DATABASE_URL or (VITE_SUPABASE_URL + SUPABASE_DB_PASSWORD) in .env.\n' +
        'Database password: Supabase Dashboard → Project Settings → Database → Database password.'
    );
    process.exit(1);
  }

  const migrationsDir = resolve(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log('Applying', files.length, 'migrations...\n');

  try {
    for (const file of files) {
      const full = resolve(migrationsDir, file);
      const sql = readFileSync(full, 'utf8');
      process.stdout.write(file + ' ... ');
      await client.query(sql);
      console.log('ok');
    }
  } finally {
    await client.end();
  }

  console.log('\nAll migrations applied.');
}

main().catch((e) => {
  console.error('\nMigration failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
