// =====================================================
// TUTOR WALLET (CANONICAL LEDGER VIEW)
// =====================================================
// GET /api/tutor/wallet
//
// Returns the authoritative balance view for the calling tutor:
//   - pending_ttd        (in escrow, ledger 'owed')
//   - available_ttd      (awaiting bank transfer, ledger 'release_ready')
//   - lifetime_paid_ttd  (ledger 'released')
//   - history            (per-session ledger rows, newest first)
//
// Source of truth is payout_ledger + tutor_balances, NOT sessions.
// Status mapping back to UI:
//   owed          → 'in_escrow'
//   release_ready → 'awaiting_transfer'
//   released      → 'paid'
//   reversed      → 'reversed'
// =====================================================

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface WalletHistoryRow {
  ledger_id: string;
  session_id: string;
  amount_ttd: number;
  status: 'in_escrow' | 'awaiting_transfer' | 'paid' | 'reversed' | 'unknown';
  ledger_status: string;
  created_at: string;
  released_at: string | null;
  batch_id: string | null;
  scheduled_start_at: string | null;
  charge_amount_ttd: number | null;
  platform_fee_ttd: number | null;
  student_name: string | null;
  subject_name: string | null;
}

function mapLedgerStatus(s: string): WalletHistoryRow['status'] {
  switch (s) {
    case 'owed':          return 'in_escrow';
    case 'release_ready': return 'awaiting_transfer';
    case 'released':      return 'paid';
    case 'reversed':      return 'reversed';
    default:              return 'unknown';
  }
}

export async function GET() {
  const userClient = await getServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'tutor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getServiceClient();

  // -- Balances (canonical) --
  const { data: balanceRow } = await admin
    .from('tutor_balances')
    .select('pending_ttd, available_ttd, last_updated')
    .eq('tutor_id', user.id)
    .maybeSingle();

  const pending = Number(balanceRow?.pending_ttd ?? 0);
  const available = Number(balanceRow?.available_ttd ?? 0);

  // -- Lifetime paid (sum of released ledger items) --
  const { data: releasedRows } = await admin
    .from('payout_ledger')
    .select('amount_ttd')
    .eq('tutor_id', user.id)
    .eq('status', 'released');

  const lifetimePaid = (releasedRows ?? []).reduce(
    (s: number, r: any) => s + Number(r.amount_ttd ?? 0),
    0
  );

  // -- Transaction history (ledger joined with sessions) --
  const { data: ledger } = await admin
    .from('payout_ledger')
    .select('id, session_id, amount_ttd, status, created_at, released_at, batch_id')
    .eq('tutor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  let history: WalletHistoryRow[] = [];

  if (ledger && ledger.length > 0) {
    const sessionIds = ledger.map((r: any) => r.session_id);

    const { data: sessions } = await admin
      .from('sessions')
      .select('id, booking_id, scheduled_start_at, charge_amount_ttd, platform_fee_ttd')
      .in('id', sessionIds);

    const sessionById = new Map((sessions ?? []).map((s: any) => [s.id, s]));
    const bookingIds = Array.from(
      new Set((sessions ?? []).map((s: any) => s.booking_id).filter(Boolean))
    );

    const { data: bookings } = bookingIds.length
      ? await admin
          .from('bookings')
          .select('id, student_id, subject_id')
          .in('id', bookingIds)
      : { data: [] };

    const bookingById = new Map((bookings ?? []).map((b: any) => [b.id, b]));
    const studentIds = Array.from(new Set((bookings ?? []).map((b: any) => b.student_id).filter(Boolean)));
    const subjectIds = Array.from(new Set((bookings ?? []).map((b: any) => b.subject_id).filter(Boolean)));

    const [{ data: students }, { data: subjects }] = await Promise.all([
      studentIds.length
        ? admin.from('profiles').select('id, full_name, display_name').in('id', studentIds)
        : Promise.resolve({ data: [] as any[] }),
      subjectIds.length
        ? admin.from('subjects').select('id, name, label').in('id', subjectIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const studentById = new Map((students ?? []).map((p: any) => [p.id, p]));
    const subjectById = new Map((subjects ?? []).map((s: any) => [s.id, s]));

    history = ledger.map((row: any) => {
      const sess = sessionById.get(row.session_id);
      const booking = sess?.booking_id ? bookingById.get(sess.booking_id) : null;
      const student = booking?.student_id ? studentById.get(booking.student_id) : null;
      const subject = booking?.subject_id ? subjectById.get(booking.subject_id) : null;
      return {
        ledger_id: row.id,
        session_id: row.session_id,
        amount_ttd: Number(row.amount_ttd ?? 0),
        status: mapLedgerStatus(row.status),
        ledger_status: row.status,
        created_at: row.created_at,
        released_at: row.released_at,
        batch_id: row.batch_id,
        scheduled_start_at: sess?.scheduled_start_at ?? null,
        charge_amount_ttd: sess?.charge_amount_ttd ?? null,
        platform_fee_ttd: sess?.platform_fee_ttd ?? null,
        student_name: student?.display_name ?? student?.full_name ?? null,
        subject_name: subject?.label ?? subject?.name ?? null,
      };
    });
  }

  return NextResponse.json({
    balances: {
      pending_ttd: pending,
      available_ttd: available,
      lifetime_paid_ttd: Math.round(lifetimePaid * 100) / 100,
      last_updated: balanceRow?.last_updated ?? null,
    },
    history,
  });
}
