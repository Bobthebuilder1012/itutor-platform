// =====================================================
// TUTOR WALLET (CANONICAL LEDGER VIEW)
// =====================================================
// GET /api/tutor/wallet
//
// Returns the authoritative balance view for the calling tutor:
//   - pending_ttd        (in escrow, ledger 'owed')
//   - available_ttd      (awaiting bank transfer, ledger 'release_ready')
//   - lifetime_paid_ttd  (ledger 'released')
//   - history            (per-session ledger rows + unprocessed past
//                         sessions whose ledger row is still missing)
//
// Primary source is payout_ledger + tutor_balances. We also surface
// "unprocessed" sessions — any non-cancelled session whose scheduled
// END time has already passed but where no payout_ledger row exists
// yet (process-charges cron + ledger trigger hasn't fired). Until
// scheduled_end_at passes the money is still tentative because a
// no-show claim can still be filed mid-session; in-progress sessions
// therefore stay in the upcoming/tentative bucket via fetchUpcoming
// and only flip to in_escrow once the meeting time is over.
//
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
  status: 'in_escrow' | 'awaiting_transfer' | 'paid' | 'reversed' | 'under_review' | 'unknown';
  ledger_status: string;
  created_at: string;
  released_at: string | null;
  batch_id: string | null;
  scheduled_start_at: string | null;
  charge_amount_ttd: number | null;
  platform_fee_ttd: number | null;
  student_id: string | null;
  student_name: string | null;
  student_avatar_url: string | null;
  subject_name: string | null;
  source_type: 'session' | 'subscription';
}

function mapLedgerStatus(s: string): WalletHistoryRow['status'] {
  switch (s) {
    case 'owed':          return 'in_escrow';
    case 'release_ready': return 'awaiting_transfer';
    case 'released':      return 'paid';
    case 'reversed':      return 'reversed';
    case 'admin_hold':    return 'under_review';
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

  // -- Held amount (admin_hold rows — already excluded from tutor_balances) --
  const { data: heldRows } = await admin
    .from('payout_ledger')
    .select('amount_ttd')
    .eq('tutor_id', user.id)
    .eq('status', 'admin_hold');

  const heldTtd = (heldRows ?? []).reduce(
    (s: number, r: any) => s + Number(r.amount_ttd ?? 0),
    0
  );

  // -- Transaction history (ledger joined with sessions + subscription payments) --
  const { data: ledger } = await admin
    .from('payout_ledger')
    .select('id, session_id, subscription_payment_id, amount_ttd, status, created_at, released_at, batch_id')
    .eq('tutor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  let history: WalletHistoryRow[] = [];

  if (ledger && ledger.length > 0) {
    // Separate session-based and subscription-based rows
    const sessionRows = ledger.filter((r: any) => r.session_id);
    const subRows    = ledger.filter((r: any) => !r.session_id && r.subscription_payment_id);

    // Fetch subscription row metadata: group name + student name
    let subInfoById = new Map<string, { student_id: string | null; student_name: string | null; student_avatar_url: string | null; subject_name: string | null }>();
    if (subRows.length > 0) {
      const subPaymentIds = subRows.map((r: any) => r.subscription_payment_id);
      const { data: subPayments } = await admin
        .from('subscription_payments')
        .select(`
          id, student_id,
          group:groups!group_id ( name ),
          student:profiles!student_id ( full_name, display_name, avatar_url )
        `)
        .in('id', subPaymentIds);
      for (const sp of subPayments ?? []) {
        subInfoById.set(sp.id, {
          student_id: sp.student_id ?? null,
          student_name: (sp as any).student?.display_name ?? (sp as any).student?.full_name ?? null,
          student_avatar_url: (sp as any).student?.avatar_url ?? null,
          subject_name: (sp as any).group?.name ?? null,
        });
      }
    }

    const sessionIds = sessionRows.map((r: any) => r.session_id);

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
        ? admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', studentIds)
        : Promise.resolve({ data: [] as any[] }),
      subjectIds.length
        ? admin.from('subjects').select('id, name, label').in('id', subjectIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const studentById = new Map((students ?? []).map((p: any) => [p.id, p]));
    const subjectById = new Map((subjects ?? []).map((s: any) => [s.id, s]));

    history = ledger.map((row: any) => {
      // Subscription payout row (no session)
      if (!row.session_id && row.subscription_payment_id) {
        const info = subInfoById.get(row.subscription_payment_id);
        return {
          ledger_id: row.id,
          session_id: null,
          amount_ttd: Number(row.amount_ttd ?? 0),
          status: mapLedgerStatus(row.status),
          ledger_status: row.status,
          created_at: row.created_at,
          released_at: row.released_at ?? null,
          batch_id: row.batch_id ?? null,
          scheduled_start_at: null,
          charge_amount_ttd: null,
          platform_fee_ttd: null,
          student_id: info?.student_id ?? null,
          student_name: info?.student_name ?? null,
          student_avatar_url: info?.student_avatar_url ?? null,
          subject_name: info?.subject_name ?? null,
          source_type: 'subscription',
        } as unknown as WalletHistoryRow;
      }

      // Session-based payout row
      const sess = sessionById.get(row.session_id);
      const booking = sess?.booking_id ? bookingById.get(sess.booking_id) : null;
      const studentId = booking?.student_id ?? null;
      const student = studentId ? studentById.get(studentId) : null;
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
        student_id: studentId,
        student_name: student?.display_name ?? student?.full_name ?? null,
        student_avatar_url: student?.avatar_url ?? null,
        subject_name: subject?.label ?? subject?.name ?? null,
        source_type: 'session',
      };
    });
  }

  // ---- Self-heal: surface ended-but-not-yet-charged sessions ----
  // We only promote a session to in_escrow once its scheduled_end_at has
  // passed. Before that the tutor's earnings are still at risk (the
  // student can file a no-show mid-session), so those rows stay in the
  // tentative bucket via fetchUpcoming on the page.
  const sessionIdsInLedger = new Set(history.map((h) => h.session_id));
  const nowIso = new Date().toISOString();
  const { data: orphanSessions } = await admin
    .from('sessions')
    .select(
      'id, booking_id, status, charged_at, scheduled_start_at, scheduled_end_at, charge_amount_ttd, payout_amount_ttd, platform_fee_ttd'
    )
    .eq('tutor_id', user.id)
    .not('status', 'in', '(CANCELLED,cancelled)')
    .lte('scheduled_end_at', nowIso)
    .order('scheduled_start_at', { ascending: false })
    .limit(200);

  const orphans = (orphanSessions ?? []).filter(
    (s: any) =>
      !sessionIdsInLedger.has(s.id) && Number(s.payout_amount_ttd ?? 0) > 0
  );

  let unprocessedPending = 0;
  if (orphans.length > 0) {
    const orphanBookingIds = Array.from(
      new Set(orphans.map((s: any) => s.booking_id).filter(Boolean))
    );

    const { data: paidBookings } = orphanBookingIds.length
      ? await admin
          .from('bookings')
          .select('id, student_id, subject_id, payment_status, payment_required, price_ttd')
          .in('id', orphanBookingIds)
      : { data: [] as any[] };

    const orphanBookingById = new Map((paidBookings ?? []).map((b: any) => [b.id, b]));

    const orphanStudentIds = Array.from(
      new Set((paidBookings ?? []).map((b: any) => b.student_id).filter(Boolean))
    );
    const orphanSubjectIds = Array.from(
      new Set((paidBookings ?? []).map((b: any) => b.subject_id).filter(Boolean))
    );

    const [{ data: orphanStudents }, { data: orphanSubjects }] = await Promise.all([
      orphanStudentIds.length
        ? admin
            .from('profiles')
            .select('id, full_name, display_name, avatar_url')
            .in('id', orphanStudentIds)
        : Promise.resolve({ data: [] as any[] }),
      orphanSubjectIds.length
        ? admin.from('subjects').select('id, name, label').in('id', orphanSubjectIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const orphanStudentById = new Map(
      (orphanStudents ?? []).map((p: any) => [p.id, p])
    );
    const orphanSubjectById = new Map(
      (orphanSubjects ?? []).map((s: any) => [s.id, s])
    );

    const orphanRows: WalletHistoryRow[] = [];
    for (const s of orphans) {
      const booking = s.booking_id ? orphanBookingById.get(s.booking_id) : null;
      // Only count earnings whose booking was actually paid. Otherwise the
      // money the tutor is "owed" isn't real yet.
      const isPaid =
        booking?.payment_status === 'paid' ||
        booking?.payment_required === false ||
        Number(booking?.price_ttd ?? 0) === 0;
      if (!isPaid) continue;

      const studentId = booking?.student_id ?? null;
      const student = studentId ? orphanStudentById.get(studentId) : null;
      const subject = booking?.subject_id
        ? orphanSubjectById.get(booking.subject_id)
        : null;
      const amount = Number(s.payout_amount_ttd ?? 0);
      unprocessedPending += amount;
      orphanRows.push({
        ledger_id: `unprocessed-${s.id}`,
        session_id: s.id,
        amount_ttd: amount,
        status: 'in_escrow',
        ledger_status: 'unprocessed',
        created_at: s.charged_at ?? s.scheduled_start_at ?? new Date().toISOString(),
        released_at: null,
        batch_id: null,
        scheduled_start_at: s.scheduled_start_at ?? null,
        charge_amount_ttd: s.charge_amount_ttd ?? null,
        platform_fee_ttd: s.platform_fee_ttd ?? null,
        student_id: studentId,
        student_name: student?.display_name ?? student?.full_name ?? null,
        student_avatar_url: student?.avatar_url ?? null,
        subject_name: subject?.label ?? subject?.name ?? null,
        source_type: 'session',
      });
    }

    history = [...history, ...orphanRows].sort(
      (a, b) =>
        new Date(b.scheduled_start_at ?? b.created_at).getTime() -
        new Date(a.scheduled_start_at ?? a.created_at).getTime()
    );
  }

  return NextResponse.json({
    balances: {
      pending_ttd:       Math.round((pending + unprocessedPending) * 100) / 100,
      available_ttd:     available,
      lifetime_paid_ttd: Math.round(lifetimePaid * 100) / 100,
      held_ttd:          Math.round(heldTtd * 100) / 100,
      last_updated:      balanceRow?.last_updated ?? null,
    },
    pending_deductions: [],
    history,
  });
}
