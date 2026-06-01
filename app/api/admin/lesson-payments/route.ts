// GET /api/admin/lesson-payments
// Returns three datasets for the Lesson Payments admin page:
//   active          — PAID subscription_payments for ACTIVE enrollments, not yet batched
//   pending_refunds — group_removals where refund_issued=false and a PAID subscription_payment exists
//   cancelled_left  — group_enrollments CANCELLED by student (no matching group_removal row)
// Also returns aggregated stats for the four KPI cards.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const [
    activeRes,
    pendingRefundsRes,
    cancelledLeftRes,
  ] = await Promise.all([
    // Tab 1: Active subscriptions — PAID, enrollment ACTIVE
    // Left-join payout_ledger to know batch/hold status
    admin
      .from('subscription_payments')
      .select(`
        id, amount_ttd, platform_fee_ttd, tutor_payout_ttd,
        period_start, period_end, paid_at, status,
        enrollment:group_enrollments!enrollment_id(
          id, status,
          student:profiles!student_id(id, full_name, email)
        ),
        group:groups!group_id(id, name, tutor_id,
          tutor:profiles!tutor_id(id, full_name, email)
        ),
        payout_ledger(id, status, batch_id, amount_ttd)
      `)
      .eq('status', 'PAID')
      .order('paid_at', { ascending: false })
      .limit(200),

    // Tab 2: group_removals with no refund yet and a PAID subscription_payment
    admin
      .from('group_removals')
      .select(`
        id, group_id, enrollment_id, student_id, tutor_id,
        with_cause, reason_category, explanation, status,
        refund_issued, refund_amount_ttd, admin_notes, created_at,
        enrollment:group_enrollments!enrollment_id(
          id, status, payment_status,
          student:profiles!student_id(id, full_name, email),
          subscription_payment:subscription_payments!enrollment_id(
            id, amount_ttd, tutor_payout_ttd, platform_fee_ttd, status, lunipay_transaction_id
          )
        ),
        group:groups!group_id(id, name),
        tutor:profiles!tutor_id(id, full_name)
      `)
      .eq('refund_issued', false)
      .order('created_at', { ascending: false })
      .limit(200),

    // Tab 3: group_enrollments CANCELLED with no group_removal (student left voluntarily)
    admin
      .from('group_enrollments')
      .select(`
        id, status, payment_status, enrolled_at, updated_at, enrollment_type,
        student:profiles!student_id(id, full_name, email),
        group:groups!group_id(id, name, tutor_id,
          tutor:profiles!tutor_id(id, full_name)
        ),
        subscription_payment:subscription_payments!enrollment_id(
          id, amount_ttd, platform_fee_ttd, tutor_payout_ttd, status, paid_at
        )
      `)
      .eq('status', 'CANCELLED')
      .eq('enrollment_type', 'SUBSCRIPTION')
      .order('updated_at', { ascending: false })
      .limit(200),
  ]);

  // ── Filter active: enrollment must be ACTIVE, payout not reversed/batched ──
  const allActive = (activeRes.data ?? []) as any[];
  const active = allActive.filter((sp) => {
    const enrollment = Array.isArray(sp.enrollment) ? sp.enrollment[0] : sp.enrollment;
    if (enrollment?.status !== 'ACTIVE') return false;
    // Include if payout_ledger doesn't exist yet OR batch_id IS NULL and status != 'reversed'
    const ledger = Array.isArray(sp.payout_ledger) ? sp.payout_ledger[0] : sp.payout_ledger;
    if (!ledger) return true;
    if (ledger.status === 'reversed') return false;
    if (ledger.batch_id !== null && ledger.batch_id !== undefined) return false;
    return true;
  });

  // ── Filter pending refunds: must have a PAID subscription_payment ──────────
  const allRemovals = (pendingRefundsRes.data ?? []) as any[];
  const pending_refunds = allRemovals.filter((r) => {
    const enrollment = Array.isArray(r.enrollment) ? r.enrollment[0] : r.enrollment;
    const sps = enrollment?.subscription_payment;
    const sp = Array.isArray(sps) ? sps[0] : sps;
    return sp?.status === 'PAID';
  });

  // ── Filter cancelled-left: exclude enrollments that have a group_removal ───
  // (Those appear in pending_refunds instead)
  const allCancelled = (cancelledLeftRes.data ?? []) as any[];
  const removalEnrollmentIds = new Set(allRemovals.map((r) => r.enrollment_id));
  const cancelled_left = allCancelled.filter(
    (e) => !removalEnrollmentIds.has(e.id)
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  const unbatchedTotal = active.reduce((s, sp) => {
    const ledger = Array.isArray(sp.payout_ledger) ? sp.payout_ledger[0] : sp.payout_ledger;
    return s + Number(ledger?.amount_ttd ?? sp.tutor_payout_ttd ?? 0);
  }, 0);

  const pendingRefundTotal = pending_refunds.reduce((s, r) => {
    const enrollment = Array.isArray(r.enrollment) ? r.enrollment[0] : r.enrollment;
    const sps = enrollment?.subscription_payment;
    const sp = Array.isArray(sps) ? sps[0] : sps;
    return s + Number(sp?.amount_ttd ?? 0);
  }, 0);

  const stats = {
    active_count:           active.length,
    pending_refund_count:   pending_refunds.length,
    cancelled_left_count:   cancelled_left.length,
    unbatched_payout_ttd:   +unbatchedTotal.toFixed(2),
    pending_refund_ttd:     +pendingRefundTotal.toFixed(2),
  };

  return NextResponse.json({ active, pending_refunds, cancelled_left, stats });
}
