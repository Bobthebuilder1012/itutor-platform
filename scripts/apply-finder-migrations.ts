/**
 * Applies the Find Your iTutor migrations to staging.
 *
 * Run: npm run finder:migrate
 *
 * Modelled on scripts/apply-staging-migrations.ts — same .env.local parser, same
 * project-ref derivation from NEXT_PUBLIC_SUPABASE_URL, same password candidate
 * order. Safe to re-run: every statement in the three files uses
 * IF NOT EXISTS / DROP POLICY IF EXISTS, so a second run is a no-op.
 *
 * STAGING ONLY. The ref comes from .env.local, which points at
 * thjsdcbzlvjradczhgso (the persistent `staging` branch of the prod project).
 * It refuses to run against the production ref — staging is a *branch* of prod,
 * so the two refs live in the same Supabase project and a mistyped env var is
 * the whole distance between them.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';

// Tiny .env.local parser so we don't need dotenv as a dep.
function loadDotEnv(path: string) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* no-op */
  }
}
loadDotEnv(resolve(process.cwd(), '.env.local'));

const PROJECT_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/^https?:\/\//, '')
  .split('.')[0];

/** The production ref. Never a valid target for this script. */
const PRODUCTION_REF = 'nfkrfciozjxrodkusrhh';

/** Pooler region. Staging is a branch of the prod project, which is us-east-1. */
const POOLER_REGION = process.env.SUPABASE_POOLER_REGION ?? 'us-east-1';

const candidatePasswords = [
  process.env.STAGING_DB_PW,
  process.env.STAGING_DB_PASSWORD,
  process.env.SUPABASE_DB_PASSWORD,
].filter(Boolean) as string[];

if (!PROJECT_REF || candidatePasswords.length === 0) {
  console.error(
    'Missing project ref or DB password. Need NEXT_PUBLIC_SUPABASE_URL and at least one of STAGING_DB_PW / STAGING_DB_PASSWORD / SUPABASE_DB_PASSWORD.'
  );
  process.exit(1);
}

if (PROJECT_REF === PRODUCTION_REF) {
  console.error(
    `Refusing to run: NEXT_PUBLIC_SUPABASE_URL points at the PRODUCTION ref (${PRODUCTION_REF}).\n` +
      'These migrations are staging-only in this pass. Point .env.local at the staging branch first.'
  );
  process.exit(1);
}

const MIGRATIONS = [
  '238_attribution_and_events.sql',
  '239_product_events_dedupe.sql',
  '240_finder.sql',
  '241_finder_fallback_match_class.sql',
];

/** The proof that all three migrations landed. Shared by both transports. */
const VERIFY_SQL = `
  SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles'
        AND column_name IN ('first_touch','last_touch','signup_ref','finder_prompted_at','finder_completed_at')
    ) AS profile_columns_5,
    (SELECT to_regclass('public.product_events')  IS NOT NULL) AS product_events,
    (SELECT to_regclass('public.retention_marks') IS NOT NULL) AS retention_marks,
    (SELECT to_regclass('public.finder_requests') IS NOT NULL) AS finder_requests,
    (SELECT to_regclass('public.demand_signals')  IS NOT NULL) AS demand_signals,
    (SELECT EXISTS (SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='uq_events_once')) AS dedupe_index,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname='public'
        AND tablename IN ('product_events','retention_marks','finder_requests','demand_signals')
    ) AS rls_policies;
`;

/**
 * Candidate connection strings, tried in order.
 *
 * The direct host `db.<ref>.supabase.co` now resolves to an IPv6 address ONLY.
 * On any machine or CI runner without IPv6 egress that surfaces as ENOTFOUND —
 * which reads like a wrong hostname rather than a routing problem, and is why
 * the sibling script apply-staging-migrations.ts no longer connects either.
 *
 * The Supavisor pooler is dual-stack, so it is tried FIRST. Note its username
 * carries the project ref (`postgres.<ref>`) — that is how the pooler decides
 * which project to route to, and omitting it fails authentication with a
 * password error that sends you hunting for the wrong bug.
 *
 * Session mode (5432) rather than transaction mode (6543): these migrations use
 * multi-statement transactions and session-scoped DDL, which transaction pooling
 * does not support.
 */
function connectionUrls(password: string): { label: string; url: string }[] {
  const pw = encodeURIComponent(password);
  return [
    {
      label: `pooler ${POOLER_REGION} (session)`,
      url: `postgresql://postgres.${PROJECT_REF}:${pw}@aws-0-${POOLER_REGION}.pooler.supabase.com:5432/postgres`,
    },
    {
      label: 'direct (IPv6 only)',
      url: `postgresql://postgres:${pw}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
    },
  ];
}

async function tryConnect(password: string): Promise<Client | null> {
  for (const { label, url } of connectionUrls(password)) {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      console.log(`  connected via ${label}`);
      return client;
    } catch (err: any) {
      console.warn(`  ${label} failed: ${err?.code ?? ""} ${err?.message ?? ""}`.trim());
      try {
        await client.end();
      } catch {
        /* no-op */
      }
    }
  }
  return null;
}

/**
 * Fallback transport: the Supabase Management API.
 *
 * WHY THIS EXISTS. Neither Postgres route reaches a *branch* database from a
 * normal workstation:
 *   - `db.<ref>.supabase.co` resolves to IPv6 only, so no-IPv6 egress gives
 *     ENOTFOUND (which misleadingly looks like a typo'd hostname);
 *   - the Supavisor pooler answers `tenant/user postgres.<ref> not found`,
 *     because a persistent branch is not registered as its own pooler tenant.
 *
 * The Management API does accept the branch ref, so it is the only transport
 * that works here. Needs SUPABASE_ACCESS_TOKEN (an sbp_… personal token) in the
 * environment — deliberately read from the environment and never written to a
 * file, so it cannot end up committed.
 */
async function applyViaManagementApi(): Promise<boolean> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      'No SUPABASE_ACCESS_TOKEN set, and no Postgres route reached the branch.\n' +
        'Re-run as:  SUPABASE_ACCESS_TOKEN=sbp_... npm run finder:migrate'
    );
    return false;
  }

  const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

  const runSql = async (label: string, sql: string): Promise<boolean> => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`FAILED ${label}: HTTP ${res.status} ${detail.slice(0, 600)}`);
      return false;
    }
    console.log(`OK  ${label} applied.`);
    return true;
  };

  console.log(`Applying via Management API to ${PROJECT_REF}.`);

  for (const file of MIGRATIONS) {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations', file), 'utf8');
    console.log(`\n=== Applying ${file} (${sql.length} bytes) ===`);
    if (!(await runSql(file, sql))) return false;
  }

  // Same verification as the Postgres path — the point of the script is to prove
  // the objects exist, not merely that the statements were accepted.
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: VERIFY_SQL }),
  });
  if (!res.ok) {
    console.error(`Verification query failed: HTTP ${res.status}`);
    return false;
  }
  const rows = (await res.json()) as Record<string, unknown>[];
  console.log('\n=== Verification ===');
  console.table(rows);

  const row = rows?.[0] ?? {};
  return (
    Number(row.profile_columns_5) === 5 &&
    Boolean(row.product_events) &&
    Boolean(row.retention_marks) &&
    Boolean(row.finder_requests) &&
    Boolean(row.demand_signals) &&
    Boolean(row.dedupe_index)
  );
}

async function main() {
  console.log(`Target ref ${PROJECT_REF} — trying ${candidatePasswords.length} password(s)...`);

  let client: Client | null = null;
  for (const pw of candidatePasswords) {
    client = await tryConnect(pw);
    if (client) break;
  }
  if (!client) {
    // No Postgres route reached the branch. Fall back to the Management API,
    // which is the only transport that accepts a branch ref from here.
    const ok = await applyViaManagementApi();
    process.exit(ok ? 0 : 1);
  }
  console.log('Connected.');

  for (const file of MIGRATIONS) {
    const path = resolve(process.cwd(), 'supabase/migrations', file);
    const sql = readFileSync(path, 'utf8');
    console.log(`\n=== Applying ${file} (${sql.length} bytes) ===`);
    try {
      await client.query(sql);
      console.log(`OK  ${file} applied.`);
    } catch (err: any) {
      console.error(`FAILED ${file}:\n${err?.message ?? err}`);
      await client.end();
      process.exit(1);
    }
  }

  // Verification: every object the three migrations are supposed to create.
  const probe = await client.query(VERIFY_SQL);

  console.log('\n=== Verification ===');
  console.table(probe.rows);

  const row = probe.rows[0] as Record<string, unknown>;
  const ok =
    Number(row.profile_columns_5) === 5 &&
    row.product_events === true &&
    row.retention_marks === true &&
    row.finder_requests === true &&
    row.demand_signals === true &&
    row.dedupe_index === true;

  await client.end();

  if (!ok) {
    console.error('\nVerification FAILED — something did not land. Do not deploy the Finder UI.');
    process.exit(1);
  }
  console.log('\nDone. All objects present.');
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
