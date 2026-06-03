// =====================================================================
// GET /api/admin/payments/one-on-one
// =====================================================================
// Returns ALL data needed by the Admin One-on-One Payments page in a
// single request. Sections:
//
//   kpis            — aggregate headline numbers
//   all_payments    — every session payment row (paid/refunded) enriched
//                     with student, tutor, session, payout, noshow info
//   pending_refunds — payments that require a refund decision
//   cancellations   — cancelled bookings/sessions with payment context
//   noshows         — noshow_claims with full admin resolution context
//   ready_for_csv   — release_ready, unbatched, clean payout_ledger rows
//   batch_failed    — payout_batches in a failed/cancelled state
//   unofficial_csv  — per-tutor totals (release_ready ledger minus debts)
// =====================================================================

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── Small helpers ────────────────────────────────────────────────────────────

/** Round a number to 2 decimal places. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** De-duplicate an array of primitives. */
function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Safely normalise a Supabase join that may return [] or a single object. */
function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // ── Parallel data fetches ─────────────────────────────────────────────────
  // We run independent queries concurrently to keep latency low.
  const [
    paymentsRes,
    ledgerReadyRes,
    ledgerOwedRes,
    noshowRes,
    cancellationEventsRes,
    batchesRes,
    deductionRes,
    openCasesRes,
    batchFailedRes,
  ] = await Promise.all([
    // All session payments that have been completed (succeeded / partially_refunded / refunded)
    admin
      .from('payments')
      .select(
        `id, booking_id, payer_id,
         amount_ttd, platform_fee_ttd, refund_amount_ttd,
         retained_amount_ttd, total_refunded_ttd,
         status, lunipay_payment_id, paid_at, refunded_at, created_at, updated_at`
      )
      .in('status', ['succeeded', 'partially_refunded', 'refunded'])
      .not('booking_id', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(500),

    // release_ready unbatched payout_ledger rows (for ready_for_csv + KPI)
    admin
      .from('payout_ledger')
      .select('id, session_id, tutor_id, amount_ttd, status, case_id, batch_id, created_at')
      .eq('status', 'release_ready')
      .is('batch_id', null),

    // owed rows (for KPI pending total)
    admin
      .from('payout_ledger')
      .select('id, session_id, tutor_id, amount_ttd, status, case_id, batch_id, created_at')
      .eq('status', 'owed'),

    // All open / pending noshow_claims
    admin
      .from('noshow_claims')
      .select(
        `id, session_id, booking_id,
         claimant_id, claimant_role, defendant_id,
         written_explanation, response_deadline,
         defendant_response, defendant_responded_at,
         status, admin_verdict, admin_id, admin_decided_at, admin_notes,
         created_at, updated_at`
      )
      .order('created_at', { ascending: false })
      .limit(200),

    // cancellation_events for the cancellations section
    admin
      .from('cancellation_events')
      .select(
        `id, student_id, tutor_id, booking_id, session_id,
         cancelled_at, scheduled_start_at, hours_before,
         was_late, fee_applied, fee_amount_ttd, reason, source, created_at`
      )
      .order('cancelled_at', { ascending: false })
      .limit(200),

    // All recent payout batches (for context + batch_failed)
    admin
      .from('payout_batches')
      .select('id, generated_at, paid_at, cancelled_at, total_amount_ttd, line_count, status, csv_filename, notes, generated_by')
      .order('generated_at', { ascending: false })
      .limit(100),

    // Pending tutor deductions (for unofficial_csv)
    admin
      .from('tutor_deductions')
      .select('tutor_id, amount_ttd, reason, status, created_at')
      .eq('status', 'pending'),

    // Open / under_review payout_cases tied to session payments
    admin
      .from('payout_cases')
      .select('id, session_id, booking_id, payment_id, payout_ledger_id, tutor_id, hold_reason, status, created_at')
      .in('status', ['open', 'under_review'])
      .not('session_id', 'is', null),

    // Failed / cancelled batches
    admin
      .from('payout_batches')
      .select('id, generated_at, cancelled_at, total_amount_ttd, line_count, status, csv_filename, notes')
      .in('status', ['cancelled'])
      .order('generated_at', { ascending: false })
      .limit(50),
  ]);

  // Graceful error handling: log but don't crash — return partial data with error flags
  const payments        = paymentsRes.data       ?? [];
  const ledgerReady     = ledgerReadyRes.data     ?? [];
  const ledgerOwed      = ledgerOwedRes.data      ?? [];
  const noshowClaims    = noshowRes.data          ?? [];
  const cancelEvents    = cancellationEventsRes.data ?? [];
  const batches         = batchesRes.data         ?? [];
  const deductions      = deductionRes.data       ?? [];
  const openCases       = openCasesRes.data       ?? [];
  const failedBatches   = batchFailedRes.data     ?? [];

  if (paymentsRes.error) {
    console.error('[one-on-one] payments fetch error:', paymentsRes.error);
  }

  // ── Collect IDs for secondary lookups ─────────────────────────────────────

  const bookingIds  = uniq(payments.map((p: any) => p.booking_id).filter(Boolean) as string[]);
  const noshowSessionIds = uniq(noshowClaims.map((n: any) => n.session_id).filter(Boolean) as string[]);
  const cancelBookingIds = uniq(cancelEvents.map((e: any) => e.booking_id).filter(Boolean) as string[]);
  const readySessionIds  = uniq(ledgerReady.map((l: any) => l.session_id).filter(Boolean) as string[]);
  const openCaseSessionIds = uniq(openCases.map((c: any) => c.session_id).filter(Boolean) as string[]);

  // All session IDs we need to load
  const allSessionIds = uniq([
    ...noshowSessionIds,
    ...readySessionIds,
    ...openCaseSessionIds,
  ]);

  // ── Secondary fetches (run in parallel) ───────────────────────────────────
  const [
    bookingsRes,
    sessionsRes,
    cancelBookingsRes,
  ] = await Promise.all([
    bookingIds.length > 0
      ? admin
          .from('bookings')
          .select(
            `id, student_id, tutor_id, subject_id,
             status, payment_status, price_ttd,
             platform_fee_ttd, tutor_payout_ttd,
             cancellation_reason, cancelled_at,
             requested_start_at, confirmed_start_at, created_at`
          )
          .in('id', bookingIds)
      : Promise.resolve({ data: [], error: null }),

    allSessionIds.length > 0
      ? admin
          .from('sessions')
          .select(
            `id, booking_id, tutor_id, student_id,
             scheduled_start_at, scheduled_end_at,
             duration_minutes, status, payment_status,
             charge_amount_ttd, payout_amount_ttd, platform_fee_ttd,
             charged_at, cancelled_at, cancelled_by, cancellation_reason,
             created_at`
          )
          .in('id', allSessionIds)
      : Promise.resolve({ data: [], error: null }),

    cancelBookingIds.length > 0
      ? admin
          .from('bookings')
          .select(
            `id, student_id, tutor_id, subject_id,
             status, payment_status, price_ttd,
             platform_fee_ttd, tutor_payout_ttd,
             cancellation_reason, cancelled_at,
             requested_start_at, confirmed_start_at`
          )
          .in('id', cancelBookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const bookingsMap        = new Map((bookingsRes.data ?? []).map((b: any) => [b.id, b]));
  const sessionsMap        = new Map((sessionsRes.data ?? []).map((s: any) => [s.id, s]));
  const cancelBookingsMap  = new Map((cancelBookingsRes.data ?? []).map((b: any) => [b.id, b]));

  // ── Collect all profile IDs from every dataset ────────────────────────────

  const allProfileIds = uniq([
    // from payments → bookings
    ...(bookingsRes.data ?? []).flatMap((b: any) => [b.student_id, b.tutor_id].filter(Boolean)),
    // from noshow claims
    ...noshowClaims.flatMap((n: any) => [n.claimant_id, n.defendant_id].filter(Boolean)),
    // from cancellation events
    ...cancelEvents.flatMap((e: any) => [e.student_id, e.tutor_id].filter(Boolean)),
    // from ledger tutor IDs
    ...ledgerReady.map((l: any) => l.tutor_id).filter(Boolean),
    ...ledgerOwed.map((l: any) => l.tutor_id).filter(Boolean),
  ] as string[]);

  const allSubjectIds = uniq(
    [...(bookingsRes.data ?? []), ...(cancelBookingsRes.data ?? [])]
      .map((b: any) => b.subject_id)
      .filter(Boolean) as string[]
  );

  const readyTutorIds = uniq(ledgerReady.map((l: any) => l.tutor_id).filter(Boolean) as string[]);

  // ── Third-level fetches ────────────────────────────────────────────────────

  const [profilesRes, subjectsRes, payoutAccountsRes, payleLedgerForPaymentsRes] = await Promise.all([
    allProfileIds.length > 0
      ? admin
          .from('profiles')
          .select('id, full_name, email, role')
          .in('id', allProfileIds)
      : Promise.resolve({ data: [], error: null }),

    allSubjectIds.length > 0
      ? admin
          .from('subjects')
          .select('id, name, label')
          .in('id', allSubjectIds)
      : Promise.resolve({ data: [], error: null }),

    readyTutorIds.length > 0
      ? admin
          .from('tutor_payout_accounts')
          .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
          .in('tutor_id', readyTutorIds)
      : Promise.resolve({ data: [], error: null }),

    // payout_ledger rows keyed by session_id — covers ALL payments' sessions
    bookingIds.length > 0
      ? admin
          .from('payout_ledger')
          .select('id, session_id, tutor_id, amount_ttd, status, batch_id, case_id, created_at')
          .not('session_id', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profilesById    = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
  const subjectsById    = new Map((subjectsRes.data ?? []).map((s: any) => [s.id, s]));
  const payoutAcctByTutor = new Map((payoutAccountsRes.data ?? []).map((a: any) => [a.tutor_id, a]));
  const ledgerBySession  = new Map((payleLedgerForPaymentsRes.data ?? []).map((l: any) => [l.session_id, l]));

  // Map open payout cases by session_id for fast lookup
  const openCaseBySession = new Map(openCases.map((c: any) => [c.session_id, c]));

  // noshow claims keyed by session_id (unique per session)
  const noshowBySession = new Map(noshowClaims.map((n: any) => [n.session_id, n]));

  // ── Build session lookup from bookings → sessions ─────────────────────────
  // We need to find the session for each payment's booking.
  // Fetch sessions for all booking IDs from payments (a separate query).
  const paymentBookingIds = bookingIds; // already collected above

  const sessionsByBookingRes = paymentBookingIds.length > 0
    ? await admin
        .from('sessions')
        .select(
          `id, booking_id, tutor_id, student_id,
           scheduled_start_at, scheduled_end_at,
           duration_minutes, status, payment_status,
           charge_amount_ttd, payout_amount_ttd, platform_fee_ttd,
           charged_at, cancelled_at, cancelled_by, cancellation_reason`
        )
        .in('booking_id', paymentBookingIds)
    : { data: [], error: null };

  const sessionByBooking = new Map(
    (sessionsByBookingRes.data ?? []).map((s: any) => [s.booking_id, s])
  );

  // ── Helper: build a rich payment row ──────────────────────────────────────
  function buildPaymentRow(payment: any) {
    const booking   = bookingsMap.get(payment.booking_id) ?? null;
    const session   = booking ? sessionByBooking.get(booking.id) ?? null : null;
    const student   = booking ? profilesById.get(booking.student_id) ?? null : null;
    const tutor     = booking ? profilesById.get(booking.tutor_id) ?? null : null;
    const subject   = booking ? subjectsById.get(booking.subject_id) ?? null : null;
    const ledger    = session ? ledgerBySession.get(session.id) ?? null : null;
    const noshow    = session ? noshowBySession.get(session.id) ?? null : null;
    const openCase  = session ? openCaseBySession.get(session.id) ?? null : null;

    return {
      // payment core
      id:                      payment.id,
      payment_id:              payment.id,
      lunipay_transaction_id:  payment.lunipay_payment_id ?? null,
      amount_ttd:              Number(payment.amount_ttd ?? 0),
      platform_fee_ttd:        Number(payment.platform_fee_ttd ?? 0),
      tutor_payout_ttd:        Number(booking?.tutor_payout_ttd ?? session?.payout_amount_ttd ?? 0),
      total_refunded_ttd:      Number(payment.total_refunded_ttd ?? 0),
      retained_amount_ttd:     Number(payment.retained_amount_ttd ?? 0),
      payment_status:          payment.status,
      paid_at:                 payment.paid_at ?? null,
      refunded_at:             payment.refunded_at ?? null,
      // booking
      booking_id:              payment.booking_id ?? null,
      booking_status:          booking?.status ?? null,
      // student
      student_id:              booking?.student_id ?? null,
      student_name:            student?.full_name ?? null,
      student_email:           student?.email ?? null,
      // tutor
      tutor_id:                booking?.tutor_id ?? null,
      tutor_name:              tutor?.full_name ?? null,
      tutor_email:             tutor?.email ?? null,
      // session
      session_id:              session?.id ?? null,
      scheduled_at:            session?.scheduled_start_at ?? booking?.confirmed_start_at ?? booking?.requested_start_at ?? null,
      session_status:          session?.status ?? null,
      // subject
      subject:                 subject?.label ?? subject?.name ?? null,
      // payout ledger
      payout_status:           ledger?.status ?? null,
      payout_ledger_id:        ledger?.id ?? null,
      payout_batch_id:         ledger?.batch_id ?? null,
      // flags
      has_noshow_claim:        !!noshow,
      noshow_status:           noshow?.status ?? null,
      noshow_verdict:          noshow?.admin_verdict ?? null,
      has_payout_case:         !!openCase,
      payout_case_id:          openCase?.id ?? null,
      payout_case_status:      openCase?.status ?? null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 1: all_payments
  // ─────────────────────────────────────────────────────────────────────────
  const all_payments = payments.map(buildPaymentRow);

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2: KPIs
  // ─────────────────────────────────────────────────────────────────────────
  const succeededPayments     = payments.filter((p: any) => p.status === 'succeeded');
  const partialRefundPayments = payments.filter((p: any) => p.status === 'partially_refunded');
  const refundedPayments      = payments.filter((p: any) => p.status === 'refunded');

  const total_payments_ttd    = r2(payments.reduce((s: number, p: any) => s + Number(p.amount_ttd ?? 0), 0));
  const total_payments_count  = payments.length;
  const total_refunded_ttd    = r2(payments.reduce((s: number, p: any) => s + Number(p.total_refunded_ttd ?? 0), 0));

  const unbatched_payout_ttd  = r2(ledgerReady.reduce((s: number, l: any) => s + Number(l.amount_ttd ?? 0), 0));
  const release_ready_ttd     = unbatched_payout_ttd; // alias — same set
  const owed_payout_ttd       = r2(ledgerOwed.reduce((s: number, l: any) => s + Number(l.amount_ttd ?? 0), 0));

  // Pending refunds: succeeded/partially_refunded payments where the session is
  // cancelled, or noshow verdict is tutor/tie, or booking is cancelled.
  const pending_refunds_rows = all_payments.filter((row) => {
    if (!['succeeded', 'partially_refunded'].includes(row.payment_status)) return false;
    const isSessionCancelled = row.session_status && ['CANCELLED', 'NO_SHOW_TUTOR', 'MUTUAL_NON_COMPLETION'].includes(row.session_status);
    const isBookingCancelled = row.booking_status === 'CANCELLED';
    const isNoshowTutor      = row.noshow_verdict === 'tutor_noshow' || row.noshow_verdict === 'tie';
    return isSessionCancelled || isBookingCancelled || isNoshowTutor;
  });

  const pending_refunds_count = pending_refunds_rows.length;
  const pending_refunds_ttd   = r2(pending_refunds_rows.reduce((s, r) => {
    // Recommended refund = amount - already refunded
    return s + Math.max(0, r.amount_ttd - r.total_refunded_ttd);
  }, 0));

  const cancelled_count = all_payments.filter(
    (r) => r.session_status === 'CANCELLED' || r.booking_status === 'CANCELLED'
  ).length;

  const noshow_count = noshowClaims.filter(
    (n: any) => n.status !== 'resolved'
  ).length;

  const batch_failed_count = failedBatches.length;

  const kpis = {
    total_payments_ttd,
    total_payments_count,
    total_refunded_ttd,
    unbatched_payout_ttd,
    release_ready_ttd,
    owed_payout_ttd,
    pending_refunds_count,
    pending_refunds_ttd,
    cancelled_count,
    noshow_count,
    batch_failed_count,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 3: pending_refunds
  // ─────────────────────────────────────────────────────────────────────────
  // Filter: payments that need refund action. Enrich with recommended amounts.
  const pending_refunds = pending_refunds_rows.map((row) => {
    let refund_reason = 'session_cancelled';
    if (row.noshow_verdict === 'tutor_noshow') refund_reason = 'tutor_noshow';
    else if (row.noshow_verdict === 'tie') refund_reason = 'tie_inconclusive';
    else if (row.session_status === 'MUTUAL_NON_COMPLETION') refund_reason = 'mutual_non_completion';
    else if (row.session_status === 'NO_SHOW_TUTOR') refund_reason = 'tutor_noshow';
    else if (row.booking_status === 'CANCELLED') refund_reason = 'booking_cancelled';

    const recommended_refund_ttd = r2(Math.max(0, row.amount_ttd - row.total_refunded_ttd));
    const retained_ttd           = r2(row.retained_amount_ttd);

    return {
      ...row,
      refund_reason,
      recommended_refund_ttd,
      retained_ttd,
    };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4: cancellations
  // ─────────────────────────────────────────────────────────────────────────
  // cancellation_events enriched with booking + payment context.
  const cancellations = cancelEvents.map((evt: any) => {
    const booking    = cancelBookingsMap.get(evt.booking_id) ?? null;
    const student    = evt.student_id ? profilesById.get(evt.student_id) ?? null : null;
    const tutor      = evt.tutor_id   ? profilesById.get(evt.tutor_id)   ?? null : null;
    const subject    = booking        ? subjectsById.get(booking.subject_id) ?? null : null;

    // Determine who cancelled (source column)
    const cancelled_by = evt.source === 'student_cancel' ? 'student' : 'student'; // all events here are student-sourced per schema

    const hours_before  = Number(evt.hours_before ?? 0);
    const is_late       = evt.was_late === true || hours_before < 24;
    // "super late" = within 2 hours of scheduled start
    const is_super_late = hours_before > 0 && hours_before < 2;

    // Recommend action: if late cancel, retain partial; if super late, retain more
    let recommended_action = 'full_refund';
    if (is_super_late)    recommended_action = 'admin_review_retain_partial';
    else if (is_late)     recommended_action = 'late_cancel_fee_may_apply';

    const payment_amount = Number(booking?.price_ttd ?? 0);
    const platform_fee   = Number(booking?.platform_fee_ttd ?? 0);
    const tutor_payout   = Number(booking?.tutor_payout_ttd ?? 0);

    // If fee was applied by system, honour that; otherwise recommend based on policy
    const refund_recommended   = !evt.fee_applied;
    const tutor_payout_recommended = evt.fee_applied
      ? Number(evt.fee_amount_ttd ?? 0)
      : 0;

    return {
      event_id:               evt.id,
      booking_id:             evt.booking_id ?? null,
      session_id:             evt.session_id ?? null,
      student_id:             evt.student_id ?? null,
      student_name:           student?.full_name ?? null,
      tutor_id:               evt.tutor_id ?? null,
      tutor_name:             tutor?.full_name ?? null,
      subject:                subject?.label ?? subject?.name ?? null,
      session_time:           evt.scheduled_start_at ?? booking?.confirmed_start_at ?? booking?.requested_start_at ?? null,
      cancelled_at:           evt.cancelled_at,
      cancelled_by,
      hours_before:           r2(hours_before),
      is_late,
      is_super_late,
      was_fee_applied:        evt.fee_applied,
      fee_amount_ttd:         Number(evt.fee_amount_ttd ?? 0),
      recommended_action,
      payment_amount,
      platform_fee_ttd:       platform_fee,
      tutor_payout_ttd:       tutor_payout,
      refund_recommended,
      tutor_payout_recommended,
      booking_status:         booking?.status ?? null,
      booking_payment_status: booking?.payment_status ?? null,
    };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5: noshows
  // ─────────────────────────────────────────────────────────────────────────
  const noshows = noshowClaims.map((claim: any) => {
    const session     = sessionsMap.get(claim.session_id)   ?? sessionByBooking.get(claim.booking_id) ?? null;
    const claimant    = profilesById.get(claim.claimant_id) ?? null;
    const defendant   = profilesById.get(claim.defendant_id) ?? null;
    const ledger      = session ? ledgerBySession.get(session.id) ?? null : null;
    const openCase    = session ? openCaseBySession.get(session.id) ?? null : null;

    // Determine student/tutor names based on claimant_role
    const student_name = claim.claimant_role === 'student'
      ? claimant?.full_name ?? null
      : defendant?.full_name ?? null;
    const tutor_name   = claim.claimant_role === 'tutor'
      ? claimant?.full_name ?? null
      : defendant?.full_name ?? null;

    const filed_by                = claim.claimant_role;
    const response_deadline       = claim.response_deadline;
    const now                     = new Date();
    const deadline                = new Date(response_deadline);
    const is_within_filing_window = deadline > now;
    const tutor_responded         = !!claim.defendant_responded_at;
    const refund_issued           = !!['tutor_noshow', 'tie'].includes(claim.admin_verdict ?? '');

    return {
      claim_id:               claim.id,
      session_id:             claim.session_id,
      booking_id:             claim.booking_id ?? null,
      student_name,
      tutor_name,
      scheduled_at:           session?.scheduled_start_at ?? null,
      filed_by,
      filed_at:               claim.created_at,
      is_within_filing_window,
      tutor_responded,
      response_deadline,
      defendant_response:     claim.defendant_response ?? null,
      status:                 claim.status,
      admin_verdict:          claim.admin_verdict ?? null,
      admin_decided_at:       claim.admin_decided_at ?? null,
      admin_notes:            claim.admin_notes ?? null,
      payout_status:          ledger?.status ?? null,
      payout_ledger_id:       ledger?.id ?? null,
      payout_case_id:         openCase?.id ?? null,
      refund_issued,
    };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6: ready_for_csv
  // ─────────────────────────────────────────────────────────────────────────
  // release_ready, unbatched payout_ledger rows with no open payout_case or noshow_claim.
  // Bank detail from tutor_payout_accounts.
  const ready_for_csv = ledgerReady
    .filter((l: any) => !openCaseBySession.has(l.session_id))
    .map((l: any) => {
      const session = sessionsMap.get(l.session_id) ?? null;
      const acct    = payoutAcctByTutor.get(l.tutor_id) ?? null;
      const prof    = profilesById.get(l.tutor_id) ?? null;

      // Find the payment for this session's booking
      const sess       = session ?? null;
      const booking    = sess ? bookingsMap.get(sess.booking_id) ?? null : null;
      const paymentRow = payments.find((p: any) => p.booking_id === sess?.booking_id) ?? null;

      return {
        ledger_id:        l.id,
        tutor_id:         l.tutor_id,
        tutor_name:       acct?.payout_name ?? prof?.full_name ?? null,
        tutor_email:      prof?.email ?? null,
        session_id:       l.session_id,
        scheduled_at:     sess?.scheduled_start_at ?? null,
        amount_ttd:       r2(Number(l.amount_ttd)),
        payment_date:     paymentRow?.paid_at ?? null,
        bank_name:        acct?.bank_name ?? null,
        branch:           acct?.branch ?? null,
        account_number:   acct?.payout_account_identifier ?? null,
        account_type:     acct?.account_type ?? null,
        has_bank_details: !!(acct?.payout_account_identifier),
        ledger_created_at: l.created_at,
      };
    })
    .sort((a, b) => Number(b.amount_ttd) - Number(a.amount_ttd));

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 7: batch_failed
  // ─────────────────────────────────────────────────────────────────────────
  // Cancelled payout_batches with context.
  const batch_failed = failedBatches.map((b: any) => ({
    batch_id:         b.id,
    generated_at:     b.generated_at,
    cancelled_at:     b.cancelled_at ?? null,
    total_amount_ttd: r2(Number(b.total_amount_ttd ?? 0)),
    line_count:       b.line_count ?? 0,
    status:           b.status,
    csv_filename:     b.csv_filename ?? null,
    notes:            b.notes ?? null,
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 8: unofficial_csv
  // ─────────────────────────────────────────────────────────────────────────
  // Per-tutor totals: release_ready ledger rows minus pending tutor_deductions.
  // Same logic as /api/admin/payouts/unofficial but scoped to session payouts only.
  const grossByTutor = new Map<string, number>();
  for (const l of ledgerReady) {
    if (!l.session_id) continue; // skip subscription rows
    const prev = grossByTutor.get(l.tutor_id) ?? 0;
    grossByTutor.set(l.tutor_id, prev + Number(l.amount_ttd ?? 0));
  }

  const debtByTutor = new Map<string, number>();
  for (const d of deductions) {
    const prev = debtByTutor.get(d.tutor_id) ?? 0;
    debtByTutor.set(d.tutor_id, prev + Number(d.amount_ttd ?? 0));
  }

  const unofficialTutorIds = uniq([
    ...Array.from(grossByTutor.keys()),
    ...Array.from(debtByTutor.keys()),
  ]);

  // Fetch profiles for tutors not already in profilesById
  const missingTutorIds = unofficialTutorIds.filter((id) => !profilesById.has(id));
  if (missingTutorIds.length > 0) {
    const { data: extraProfiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', missingTutorIds);
    for (const p of extraProfiles ?? []) {
      profilesById.set(p.id, p);
    }
  }

  const missingAcctIds = unofficialTutorIds.filter((id) => !payoutAcctByTutor.has(id));
  if (missingAcctIds.length > 0) {
    const { data: extraAccts } = await admin
      .from('tutor_payout_accounts')
      .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
      .in('tutor_id', missingAcctIds);
    for (const a of extraAccts ?? []) {
      payoutAcctByTutor.set(a.tutor_id, a);
    }
  }

  const unofficial_csv = unofficialTutorIds
    .map((tutorId) => {
      const gross = r2(grossByTutor.get(tutorId) ?? 0);
      const debt  = r2(debtByTutor.get(tutorId) ?? 0);
      const net   = r2(Math.max(0, gross - debt));
      const prof  = profilesById.get(tutorId);
      const acct  = payoutAcctByTutor.get(tutorId);
      return {
        tutor_id:         tutorId,
        tutor_name:       acct?.payout_name ?? prof?.full_name ?? null,
        email:            prof?.email ?? null,
        bank_name:        acct?.bank_name ?? null,
        branch:           acct?.branch ?? null,
        account_number:   acct?.payout_account_identifier ?? null,
        account_type:     acct?.account_type ?? null,
        gross_payout_ttd: gross,
        pending_debt_ttd: debt,
        net_payout_ttd:   net,
      };
    })
    .sort((a, b) => b.net_payout_ttd - a.net_payout_ttd);

  const unofficial_totals = {
    total_gross_ttd: r2(unofficial_csv.reduce((s, t) => s + t.gross_payout_ttd, 0)),
    total_debt_ttd:  r2(unofficial_csv.reduce((s, t) => s + t.pending_debt_ttd, 0)),
    total_net_ttd:   r2(unofficial_csv.reduce((s, t) => s + t.net_payout_ttd, 0)),
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 9: recent batches (all, for UI reference)
  // ─────────────────────────────────────────────────────────────────────────
  const recent_batches = batches.map((b: any) => ({
    batch_id:         b.id,
    generated_at:     b.generated_at,
    paid_at:          b.paid_at ?? null,
    cancelled_at:     b.cancelled_at ?? null,
    total_amount_ttd: r2(Number(b.total_amount_ttd ?? 0)),
    line_count:       b.line_count ?? 0,
    status:           b.status,
    csv_filename:     b.csv_filename ?? null,
    notes:            b.notes ?? null,
  }));

  // ─────────────────────────────────────────────────────────────────────────
  // Response
  // ─────────────────────────────────────────────────────────────────────────
  return NextResponse.json({
    kpis,
    all_payments,
    pending_refunds,
    cancellations,
    noshows,
    ready_for_csv,
    batch_failed,
    unofficial_csv,
    unofficial_totals,
    recent_batches,
  });
}
