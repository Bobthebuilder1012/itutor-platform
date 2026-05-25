/**
 * STAGING-ONLY: wipe payment + ledger artifacts so a fresh scenario
 * can be exercised end-to-end. Refuses to run unless the Supabase
 * URL contains "staging" OR --force is passed.
 *
 *   npx ts-node scripts/reset-payments-staging.ts            # safe, dry-run
 *   npx ts-node scripts/reset-payments-staging.ts --apply    # actually wipe
 *   npx ts-node scripts/reset-payments-staging.ts --apply --force  # bypass staging guard
 *
 * What it does (in dependency order):
 *   1. lunipay_webhook_events      (FK → payments)
 *   2. payout_ledger               (FK → payout_batches, sessions)
 *   3. payout_batches
 *   4. tutor_earnings              (FK → payments, sessions)
 *   5. tutor_balances              (no FKs)
 *   6. payments                    (FK → bookings)
 *   7. UPDATE sessions   SET status='SCHEDULED', charged_at=NULL,
 *                            meeting_started_at=NULL, meeting_ended_at=NULL,
 *                            charge_amount_ttd=payout_amount_ttd+platform_fee_ttd
 *                          WHERE charged_at IS NOT NULL OR status IN
 *                            ('COMPLETED','COMPLETED_ASSUMED','EARLY_END_SHORT','NO_SHOW_STUDENT','NO_SHOW_TUTOR')
 *   8. UPDATE bookings   SET payment_status='unpaid'
 *                          WHERE payment_status='paid'
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function readEnv(file: string, key: string): string | null {
  try {
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith(`${key}=`)) return t.slice(key.length + 1).trim();
    }
  } catch {}
  return null;
}

const envFile = resolve(process.cwd(), '.env.local');
const SUPABASE_URL = readEnv(envFile, 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = readEnv(envFile, 'SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');

const isStaging = /staging|preview|test/i.test(SUPABASE_URL);
if (!isStaging && !FORCE) {
  console.error(`Refusing to run: ${SUPABASE_URL} does not look like staging.`);
  console.error('Add --force to bypass (only if you really know what you are doing).');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function count(table: string): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.warn(`  ! count(${table}) error: ${error.message}`);
    return -1;
  }
  return count ?? 0;
}

// Per-table primary-key column (Supabase blocks DELETE without a filter).
const PK_BY_TABLE: Record<string, string> = {
  lunipay_webhook_events: 'event_id',
  tutor_balances: 'tutor_id',
};

async function deleteAll(table: string): Promise<number> {
  const pk = PK_BY_TABLE[table] ?? 'id';
  const { error, count } = await sb
    .from(table)
    .delete({ count: 'exact' })
    .not(pk, 'is', null);
  if (error) {
    console.error(`  ! delete(${table}) error: ${error.message}`);
    return -1;
  }
  return count ?? 0;
}

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(`Mode  : ${APPLY ? 'APPLY (will mutate)' : 'DRY RUN (counts only)'}\n`);

  const tables = [
    'lunipay_webhook_events',
    'payout_ledger',
    'payout_batches',
    'tutor_earnings',
    'tutor_balances',
    'payments',
  ] as const;

  console.log('Current row counts:');
  for (const t of tables) {
    const c = await count(t);
    console.log(`  ${t.padEnd(28)} ${c}`);
  }

  const { count: completedSessions } = await sb
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .or(
      'charged_at.not.is.null,status.in.(COMPLETED,COMPLETED_ASSUMED,EARLY_END_SHORT,NO_SHOW_STUDENT,NO_SHOW_TUTOR)'
    );
  const { count: paidBookings } = await sb
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('payment_status', 'paid');
  console.log(`  sessions to reset            ${completedSessions ?? 0}`);
  console.log(`  bookings to mark unpaid      ${paidBookings ?? 0}`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to wipe.');
    return;
  }

  console.log('\nWiping tables in dependency order…');
  for (const t of tables) {
    const removed = await deleteAll(t);
    console.log(`  ${t.padEnd(28)} removed ${removed}`);
  }

  console.log('\nResetting sessions → SCHEDULED, charged_at = NULL…');
  const { error: sessErr, count: sessCount } = await sb
    .from('sessions')
    .update(
      {
        status: 'SCHEDULED',
        charged_at: null,
        meeting_started_at: null,
        meeting_ended_at: null,
      },
      { count: 'exact' }
    )
    .or(
      'charged_at.not.is.null,status.in.(COMPLETED,COMPLETED_ASSUMED,EARLY_END_SHORT,NO_SHOW_STUDENT,NO_SHOW_TUTOR)'
    );
  if (sessErr) console.error(`  ! sessions update error: ${sessErr.message}`);
  else console.log(`  sessions reset               ${sessCount}`);

  console.log('\nResetting bookings → payment_status = unpaid…');
  const { error: bookErr, count: bookCount } = await sb
    .from('bookings')
    .update({ payment_status: 'unpaid' }, { count: 'exact' })
    .eq('payment_status', 'paid');
  if (bookErr) console.error(`  ! bookings update error: ${bookErr.message}`);
  else console.log(`  bookings updated             ${bookCount}`);

  console.log('\nDone. The scenario is reset; you can now create new bookings or replay the existing ones.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
