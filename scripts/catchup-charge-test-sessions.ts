/**
 * One-shot catch-up: for every paid SCHEDULED session whose
 * scheduled_end_at is in the past and whose charged_at is NULL,
 * mark it COMPLETED_ASSUMED + set charged_at = now() so the
 * mig 129 trigger fires and populates payout_ledger + tutor_balances.
 *
 * Use this after enabling the cron resilience fix on a fresh staging
 * environment, or any time test bookings get stuck because the cron
 * couldn't reach the video provider.
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
const SUPABASE_URL = readEnv(envFile, 'NEXT_PUBLIC_SUPABASE_URL')!;
const KEY = readEnv(envFile, 'SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const nowIso = new Date().toISOString();

  const { data: candidates, error } = await sb
    .from('sessions')
    .select('id, booking_id, tutor_id, scheduled_end_at, charge_amount_ttd, payout_amount_ttd, status, charged_at')
    .in('status', ['SCHEDULED', 'JOIN_OPEN'])
    .is('charged_at', null)
    .lte('scheduled_end_at', nowIso)
    .gt('charge_amount_ttd', 0)
    .gt('payout_amount_ttd', 0);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  if (!candidates || candidates.length === 0) {
    console.log('No paid sessions need catching up.');
    return;
  }

  console.log(`Found ${candidates.length} session(s) to catch up:\n`);
  for (const s of candidates) {
    console.log(
      `  ${s.id} (booking ${s.booking_id?.slice(0, 8)}…) end=${s.scheduled_end_at} charge=${s.charge_amount_ttd} payout=${s.payout_amount_ttd}`
    );
  }
  console.log();

  for (const s of candidates) {
    // Two-step update: first set status=COMPLETED_ASSUMED, then
    // set charged_at — the trigger fires on the second update.
    const { error: statusErr } = await sb
      .from('sessions')
      .update({ status: 'COMPLETED_ASSUMED' })
      .eq('id', s.id);
    if (statusErr) {
      console.error(`  ${s.id}: status update failed:`, statusErr.message);
      continue;
    }

    const { error: chargeErr } = await sb
      .from('sessions')
      .update({ charged_at: nowIso })
      .eq('id', s.id);
    if (chargeErr) {
      console.error(`  ${s.id}: charged_at update failed:`, chargeErr.message);
      continue;
    }

    console.log(`  ✓ ${s.id} flipped to COMPLETED_ASSUMED + charged_at=${nowIso}`);
  }

  // Verify
  const { data: ledger } = await sb
    .from('payout_ledger')
    .select('id, session_id, tutor_id, amount_ttd, status')
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: balances } = await sb
    .from('tutor_balances')
    .select('tutor_id, pending_ttd, available_ttd');

  console.log('\n=== Post-catchup verification ===');
  console.log(`payout_ledger rows: ${ledger?.length ?? 0}`);
  console.table(ledger ?? []);
  console.log(`tutor_balances rows: ${balances?.length ?? 0}`);
  console.table(balances ?? []);
}

main().catch((e) => { console.error(e); process.exit(1); });
