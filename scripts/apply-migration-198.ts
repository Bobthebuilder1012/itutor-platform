/**
 * Migration runner for 198_materialize_paid_booking_stripe.sql (staging).
 *
 * Adds the Stripe counterpart of materialize_paid_booking against the
 * Supabase Postgres pointed to by NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * SAFE TO RE-RUN: 198 is a single CREATE OR REPLACE FUNCTION plus a
 * GRANT, wrapped in BEGIN/COMMIT.
 *
 * Requires migration 197 first — the function writes the stripe_*
 * columns it adds to `payments`.
 *
 * Run: npx ts-node scripts/apply-migration-198.ts
 *      npx ts-node scripts/apply-migration-198.ts --dry-run   (probe only)
 *
 * Credentials, in precedence order:
 *   STAGING_DB_PW / STAGING_DB_PASSWORD / SUPABASE_DB_PASSWORD  (.env.local)
 * Get a fresh one from:
 *   Supabase Dashboard > Project Settings > Database > Database password
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';

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

const DRY_RUN = process.argv.includes('--dry-run');

const PROJECT_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/^https?:\/\//, '')
  .split('.')[0];

const candidatePasswords = [
  process.env.STAGING_DB_PW,
  process.env.STAGING_DB_PASSWORD,
  process.env.SUPABASE_DB_PASSWORD,
].filter(Boolean) as string[];

// Guard: never let this point at production by accident.
const PROD_REFS = ['nfkrfciozjxrodkusrhh'];
if (PROD_REFS.includes(PROJECT_REF)) {
  console.error(
    `REFUSING TO RUN: NEXT_PUBLIC_SUPABASE_URL points at production (${PROJECT_REF}).`
  );
  process.exit(1);
}

if (!PROJECT_REF || candidatePasswords.length === 0) {
  console.error(
    'Missing project ref or DB password. Need NEXT_PUBLIC_SUPABASE_URL and one of ' +
      'STAGING_DB_PW / STAGING_DB_PASSWORD / SUPABASE_DB_PASSWORD in .env.local.'
  );
  process.exit(1);
}

const MIGRATION = '198_materialize_paid_booking_stripe.sql';

/** Read-only state probe — tells us what's already there before we touch anything. */
const PROBE = `
  SELECT
    (SELECT EXISTS(SELECT 1 FROM pg_proc
       WHERE proname='materialize_paid_booking_stripe'))  AS stripe_materialize_rpc,
    (SELECT EXISTS(SELECT 1 FROM pg_proc
       WHERE proname='materialize_paid_booking'))         AS lunipay_materialize_rpc,
    (SELECT EXISTS(SELECT 1 FROM information_schema.columns
       WHERE table_name='payments'
         AND column_name='stripe_payment_intent_id'))     AS mig197_applied;
`;

async function tryConnect(password: string): Promise<Client | null> {
  const url = `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    return client;
  } catch (err: any) {
    const code = err?.code ?? err?.message;
    const hint =
      code === '28P01'
        ? ' (invalid password — rotate it in Supabase Dashboard > Settings > Database)'
        : '';
    console.warn(`  password ending in …${password.slice(-3)} failed: ${code}${hint}`);
    try {
      await client.end();
    } catch {
      /* no-op */
    }
    return null;
  }
}

async function main() {
  console.log(
    `Connecting to db.${PROJECT_REF}.supabase.co (trying ${candidatePasswords.length} password(s))...`
  );

  let client: Client | null = null;
  for (const pw of candidatePasswords) {
    client = await tryConnect(pw);
    if (client) break;
  }
  if (!client) {
    console.error('\nAll candidate passwords failed authentication.');
    console.error(
      'Fix: Supabase Dashboard > Project Settings > Database > Database password,\n' +
        'then set STAGING_DB_PASSWORD in .env.local.'
    );
    process.exit(1);
  }
  console.log('Connected.\n');

  const before = await client.query(PROBE);
  console.log('=== State BEFORE ===');
  console.table(before.rows);

  if (DRY_RUN) {
    console.log('\n--dry-run: no changes made.');
    await client.end();
    return;
  }

  const path = resolve(process.cwd(), 'supabase/migrations', MIGRATION);
  const sql = readFileSync(path, 'utf8');
  console.log(`\n=== Applying ${MIGRATION} (${sql.length} bytes) ===`);
  try {
    await client.query(sql);
    console.log(`✓ ${MIGRATION} applied.`);
  } catch (err: any) {
    console.error(`✗ ${MIGRATION} FAILED:\n${err?.message ?? err}`);
    await client.end();
    process.exit(1);
  }

  const after = await client.query(PROBE);
  console.log('\n=== State AFTER ===');
  console.table(after.rows);

  const row = after.rows[0];
  const ok = row.stripe_materialize_rpc;

  await client.end();

  if (!ok) {
    console.error('\nVerification FAILED — expected objects are missing.');
    process.exit(1);
  }
  console.log('\nDone. Migration 198 verified.');
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
