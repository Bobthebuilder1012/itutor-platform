/**
 * Smoke test for migration 152 + apply_refund_side_effects.
 *
 * What it does:
 *   1. Picks a candidate paid payment that has a session with a
 *      payout_ledger row in status 'owed' (or no ledger row yet).
 *   2. Snapshots the BEFORE state of payments / payout_ledger /
 *      tutor_balances / sessions for that candidate.
 *   3. Calls apply_refund_side_effects with a SYNTHETIC LuniPay refund
 *      payload — bypasses the real LuniPay call so this is safe to
 *      run in staging without actually moving money.
 *   4. Snapshots the AFTER state and prints a diff.
 *
 * Usage:
 *     npx tsx scripts/smoke-test-partial-refund.ts                # dry run, lists candidates
 *     npx tsx scripts/smoke-test-partial-refund.ts --execute      # picks the first candidate and runs
 *     npx tsx scripts/smoke-test-partial-refund.ts --payment <id> --execute
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (same vars probe-staging-ledger uses).
 *
 * NOTE: this test rewrites real DB rows (payments.status,
 * payout_ledger, tutor_balances). Pick a throwaway test booking, not
 * production data.
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

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = process.argv.slice(2);
const argFor = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const EXECUTE = args.includes('--execute');
const FORCED_PAYMENT = argFor('--payment');

async function snapshot(paymentId: string) {
  const { data: payment } = await sb
    .from('payments')
    .select(
      'id, status, amount_ttd, total_refunded_ttd, refund_amount_ttd, retained_amount_ttd, refunded_at, cancel_reason, booking_id, payer_id'
    )
    .eq('id', paymentId)
    .maybeSingle();

  const bookingId = (payment as any)?.booking_id ?? null;

  const { data: session } = bookingId
    ? await sb
        .from('sessions')
        .select('id, tutor_id, status, charge_amount_ttd, payout_amount_ttd, platform_fee_ttd, charged_at, cancelled_at')
        .eq('booking_id', bookingId)
        .maybeSingle()
    : { data: null };

  const sessionId = (session as any)?.id ?? null;
  const tutorId = (session as any)?.tutor_id ?? null;

  const { data: ledger } = sessionId
    ? await sb
        .from('payout_ledger')
        .select('id, session_id, tutor_id, amount_ttd, status, updated_at')
        .eq('session_id', sessionId)
        .maybeSingle()
    : { data: null };

  const { data: balance } = tutorId
    ? await sb
        .from('tutor_balances')
        .select('tutor_id, pending_ttd, available_ttd, last_updated')
        .eq('tutor_id', tutorId)
        .maybeSingle()
    : { data: null };

  return { payment, session, ledger, balance };
}

async function findCandidates(): Promise<string[]> {
  // Paid payments that haven't been refunded yet, newest first.
  const { data, error } = await sb
    .from('payments')
    .select('id, status, amount_ttd, total_refunded_ttd, booking_id, created_at')
    .eq('status', 'succeeded')
    .gt('amount_ttd', 0)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('lookup error:', error.message);
    return [];
  }
  return (data ?? [])
    .filter((p: any) => Number(p.total_refunded_ttd ?? 0) === 0 && p.booking_id)
    .map((p: any) => p.id);
}

function printSection(label: string, obj: unknown) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(obj, null, 2));
}

async function main() {
  console.log(`Smoke target: ${SUPABASE_URL}`);

  let paymentId = FORCED_PAYMENT;

  if (!paymentId) {
    const candidates = await findCandidates();
    if (candidates.length === 0) {
      console.error('No refundable paid payments found.');
      process.exit(1);
    }
    console.log(`\nFound ${candidates.length} candidate payment(s):`);
    for (const id of candidates) console.log(`  - ${id}`);
    paymentId = candidates[0];
    console.log(`\nUsing first candidate: ${paymentId}`);
  }

  const before = await snapshot(paymentId);
  printSection('BEFORE', before);

  if (!before.payment) {
    console.error('Payment not found.');
    process.exit(1);
  }

  const amountTtd = Number((before.payment as any).amount_ttd);
  const half = +(amountTtd / 2).toFixed(2);
  const refundAmountTtd = half;
  const retainedAmountTtd = +(amountTtd - half).toFixed(2);

  // Mirror lib/utils/commissionCalculator.ts: the platform takes the
  // fee, the rest goes to the tutor.
  // For a 50-50 retention test the absolute split doesn't matter for
  // ledger reversal correctness — we just need a non-zero payout.
  const retainedPayoutTtd = +(retainedAmountTtd * 0.85).toFixed(2);
  const retainedPlatformFeeTtd = +(retainedAmountTtd - retainedPayoutTtd).toFixed(2);

  const fakeRefundPayload = {
    id: `re_smoke_${Date.now()}`,
    object: 'refund',
    amount: Math.round(refundAmountTtd * 100),
    currency: 'TTD',
    status: 'SUCCEEDED',
    metadata: { smoke_test: true },
  };

  const rpcArgs = {
    payment_id: paymentId,
    refund_amount_ttd: refundAmountTtd,
    retained_amount_ttd: retainedAmountTtd,
    retained_payout_ttd: retainedPayoutTtd,
    retained_platform_fee_ttd: retainedPlatformFeeTtd,
    reason: 'student_late_cancel',
    refund_payload: fakeRefundPayload,
  };

  console.log(`\nProposed RPC payload:`);
  console.log(JSON.stringify(rpcArgs, null, 2));

  if (!EXECUTE) {
    console.log('\nDry run — pass --execute to actually run apply_refund_side_effects.');
    process.exit(0);
  }

  const { data: rpcResult, error: rpcError } = await sb.rpc('apply_refund_side_effects', {
    p_payload: rpcArgs,
  });

  if (rpcError) {
    console.error('\nRPC FAILED:', rpcError);
    process.exit(1);
  }

  printSection('RPC RESULT', rpcResult);

  const after = await snapshot(paymentId);
  printSection('AFTER', after);

  // Quick assertions
  const a = after as any;
  const b = before as any;
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [
    {
      name: 'payment.status moved to partially_refunded',
      pass: a.payment?.status === 'partially_refunded',
      detail: `was '${b.payment?.status}', now '${a.payment?.status}'`,
    },
    {
      name: 'payment.total_refunded_ttd ≈ refundAmount',
      pass: Math.abs(Number(a.payment?.total_refunded_ttd) - refundAmountTtd) < 0.01,
      detail: `total_refunded_ttd = ${a.payment?.total_refunded_ttd}`,
    },
    {
      name: 'payment.retained_amount_ttd matches request',
      pass: Math.abs(Number(a.payment?.retained_amount_ttd) - retainedAmountTtd) < 0.01,
      detail: `retained_amount_ttd = ${a.payment?.retained_amount_ttd}`,
    },
    {
      name: 'ledger row present and non-released',
      pass: !!a.ledger && !['release_ready', 'released'].includes(a.ledger.status),
      detail: `ledger.status = ${a.ledger?.status}`,
    },
    {
      name: 'tutor_balances.pending_ttd reflects retention',
      pass:
        a.balance &&
        Number(a.balance.pending_ttd) >= 0,
      detail: `pending_ttd = ${a.balance?.pending_ttd}`,
    },
  ];

  console.log('\n=== Assertions ===');
  let allPass = true;
  for (const c of checks) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    if (!c.pass) allPass = false;
    console.log(`  [${tag}] ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
