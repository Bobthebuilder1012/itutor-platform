/**
 * One-shot migration runner for staging.
 * Applies migrations 150 + 151 against the staging Supabase Postgres
 * directly. Safe to re-run: each migration is wrapped in BEGIN/COMMIT
 * and the SQL inside uses idempotent constructs (DROP IF EXISTS,
 * CREATE OR REPLACE, etc).
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

const candidatePasswords = [
  process.env.STAGING_DB_PW,
  process.env.STAGING_DB_PASSWORD,
  process.env.SUPABASE_DB_PASSWORD,
].filter(Boolean) as string[];

if (!PROJECT_REF || candidatePasswords.length === 0) {
  console.error(
    'Missing project ref or DB password. Need NEXT_PUBLIC_SUPABASE_URL and at least one of STAGING_DB_PW / STAGING_DB_PASSWORD.'
  );
  process.exit(1);
}

const MIGRATIONS = [
  '150_payments_critical_fixes.sql',
  '151_atomic_paid_booking_and_payer.sql',
  '152_partial_refunds.sql',
  '153_materialise_uses_complete_payment.sql',
  '154_payout_batch_atomic.sql',
  '155_booking_slot_exclusion.sql',
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
      console.log(`✓ ${file} applied.`);
    } catch (err: any) {
      console.error(`✗ ${file} FAILED:\n${err?.message ?? err}`);
      await client.end();
      process.exit(1);
    }
  }

  // Sanity probe
  const probe = await client.query(`
    SELECT
      (SELECT is_nullable FROM information_schema.columns
        WHERE table_name='payments' AND column_name='booking_id') AS payments_booking_id_nullable,
      (SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'materialize_paid_booking'
      )) AS materialize_rpc_exists,
      (SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'apply_refund_side_effects'
      )) AS apply_refund_rpc_exists,
      (SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='payments' AND column_name='total_refunded_ttd'
      )) AS payments_total_refunded_column,
      (SELECT pg_get_constraintdef(c.oid)
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname='payments' AND c.conname='payments_status_check') AS payments_status_check;
  `);

  console.log('\n=== Verification ===');
  console.table(probe.rows);
  await client.end();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
