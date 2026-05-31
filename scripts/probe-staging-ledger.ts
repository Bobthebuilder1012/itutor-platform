/**
 * Diagnostic: dump recent payments, bookings, webhook events,
 * payout ledger, and tutor balances from staging via the
 * Supabase service-role REST client (bypasses RLS the same
 * way migrations do).
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

function show(title: string, rows: any) {
  console.log(`\n=== ${title} ===`);
  if (!rows || (Array.isArray(rows) && rows.length === 0)) {
    console.log('  (no rows)');
    return;
  }
  console.table(rows);
}

async function main() {
  console.log(`Probing ${SUPABASE_URL}\n`);

  const { data: payments, error: paymentsErr } = await sb
    .from('payments')
    .select(
      'id, created_at, status, amount_ttd, provider, booking_id, payer_id, lunipay_checkout_session_id, lunipay_payment_id, paid_at, cancel_reason, raw_provider_payload'
    )
    .order('created_at', { ascending: false })
    .limit(10);

  if (paymentsErr) console.error('payments err:', paymentsErr.message);
  show(
    'payments (last 10)',
    (payments ?? []).map((p: any) => ({
      id: p.id?.slice(0, 8) + '…',
      created_at: p.created_at,
      status: p.status,
      amount_ttd: p.amount_ttd,
      provider: p.provider,
      booking_id: p.booking_id ? p.booking_id.slice(0, 8) + '…' : null,
      payer_id: p.payer_id ? p.payer_id.slice(0, 8) + '…' : null,
      lunipay_session_id: p.lunipay_checkout_session_id?.slice(0, 18) + '…',
      paid_at: p.paid_at,
      cancel_reason: p.cancel_reason,
      payload_source: p.raw_provider_payload?.source ?? null,
    }))
  );

  const { data: events, error: eventsErr } = await sb
    .from('lunipay_webhook_events')
    .select('event_id, event_type, livemode, payment_id, received_at')
    .order('received_at', { ascending: false })
    .limit(10);
  if (eventsErr) console.error('events err:', eventsErr.message);
  show('lunipay_webhook_events (last 10)', events);

  const { data: bookings, error: bookingsErr } = await sb
    .from('bookings')
    .select('id, created_at, status, payment_status, payment_required, student_id, tutor_id, payer_id, price_ttd, tutor_payout_ttd')
    .order('created_at', { ascending: false })
    .limit(10);
  if (bookingsErr) console.error('bookings err:', bookingsErr.message);
  show(
    'bookings (last 10)',
    (bookings ?? []).map((b: any) => ({
      id: b.id?.slice(0, 8) + '…',
      created_at: b.created_at,
      status: b.status,
      payment_status: b.payment_status,
      payment_required: b.payment_required,
      student: b.student_id?.slice(0, 8) + '…',
      tutor: b.tutor_id?.slice(0, 8) + '…',
      payer: b.payer_id?.slice(0, 8) + '…',
      price_ttd: b.price_ttd,
      tutor_payout_ttd: b.tutor_payout_ttd,
    }))
  );

  const { data: ledger, error: ledgerErr } = await sb
    .from('payout_ledger')
    .select('id, session_id, tutor_id, amount_ttd, status, batch_id, created_at, released_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (ledgerErr) console.error('payout_ledger err:', ledgerErr.message);
  show('payout_ledger (last 10)', ledger);

  const { data: balances, error: balErr } = await sb
    .from('tutor_balances')
    .select('tutor_id, pending_ttd, available_ttd, last_updated')
    .order('last_updated', { ascending: false })
    .limit(10);
  if (balErr) console.error('tutor_balances err:', balErr.message);
  show('tutor_balances (top 10)', balances);

  const { data: orphans, error: orphErr } = await sb
    .from('payments')
    .select('id, paid_at, amount_ttd, cancel_reason, lunipay_checkout_session_id')
    .eq('status', 'succeeded')
    .is('booking_id', null)
    .order('paid_at', { ascending: false })
    .limit(10);
  if (orphErr) console.error('orphans err:', orphErr.message);
  show('orphan payments (succeeded, no booking)', orphans);

  // sessions: charged_at NULL means the process-charges cron hasn't run for it
  const { data: sessions, error: sessErr } = await sb
    .from('sessions')
    .select('*')
    .order('id', { ascending: false })
    .limit(10);
  if (sessErr) console.error('sessions err:', sessErr.message);
  show(
    'sessions (last 10, key fields)',
    (sessions ?? []).map((s: any) => ({
      id: s.id?.slice(0, 8) + '…',
      booking_id: s.booking_id?.slice(0, 8) + '…',
      tutor: s.tutor_id?.slice(0, 8) + '…',
      status: s.status,
      payment_status: s.payment_status,
      charged_at: s.charged_at,
      scheduled_start: s.scheduled_start_at ?? s.start_at ?? s.scheduled_at,
      payout_amount_ttd: s.payout_amount_ttd,
      charge_amount_ttd: s.charge_amount_ttd,
    }))
  );

  // tutor_earnings: legacy source the mig 129 trigger writes to
  const { data: earnings, error: earnErr } = await sb
    .from('tutor_earnings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (earnErr) console.error('tutor_earnings err:', earnErr.message);
  show('tutor_earnings (last 10, raw)', earnings);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
