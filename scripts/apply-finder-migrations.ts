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
];

async function tryConnect(password: string): Promise<Client | null> {
  const url = `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    return client;
  } catch (err: any) {
    console.warn(`  password ending in …${password.slice(-3)} failed: ${err?.code ?? err?.message}`);
    try {
      await client.end();
    } catch {
      /* no-op */
    }
    return null;
  }
}

async function main() {
  console.log(`Connecting to db.${PROJECT_REF}.supabase.co (trying ${candidatePasswords.length} password(s))...`);

  let client: Client | null = null;
  for (const pw of candidatePasswords) {
    client = await tryConnect(pw);
    if (client) break;
  }
  if (!client) {
    console.error('All candidate passwords failed authentication.');
    process.exit(1);
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
  const probe = await client.query(`
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
  `);

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
