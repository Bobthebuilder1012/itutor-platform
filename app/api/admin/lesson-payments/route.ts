// GET /api/admin/lesson-payments
// Returns three datasets for the Lesson Payments admin page:
//   active             — PAID subscription_payments for ACTIVE enrollments, not yet batched
//   completed_removals — group_removals with refunds already processed (auto or manual)
//   cancelled_left     — group_enrollments CANCELLED by student (no matching group_removal row)
// Also returns aggregated stats for the KPI cards.
// NOTE: Refunds are now auto-processed on removal. There is no admin approval step.
//       Any failed refunds appear as subscription_payment_exceptions, not here.

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
    completedRemovalsRes,
    cancelledLeftRes,
  ] = await Promise.all([
    // Tab 1: Active subscriptions — PAID, enrollment ACTIVE
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

    // Tab 2: Completed removals — group_removals (refund auto-processed at removal time)
    admin
      .from('group_removals')
      .select(`
        id, group_id, enrollment_id, student_id, tutor_id,
        status, with_cause, reason_category, explanation,
        refund_issued, refund_amount_ttd, admin_notes, created_at, resolved_at,
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
      .eq('status', 'auto_processed')
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
    const ledger = Array.isArray(sp.payout_ledger) ? sp.payout_ledger[0] : sp.payout_ledger;
    if (!ledger) return true;
    if (ledger.status === 'reversed') return false;
    if (ledger.batch_id !== null && ledger.batch_id !== undefined) return false;
    return true;
  });

  // ── Completed removals: all auto_processed removals ──
  const allRemovals = (completedRemovalsRes.data ?? []) as any[];
  const completed_removals = allRemovals;

  // ── Filter cancelled-left: exclude enrollments that have a group_removal ───
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

  const refundedTotal = completed_removals
    .filter((r) => r.refund_issued)
    .reduce((s, r) => s + Number(r.refund_amount_ttd ?? 0), 0);

  const failedRefundCount = completed_removals.filter((r) => !r.refund_issued).length;

  const stats = {
    active_count:             active.length,
    completed_removal_count:  completed_removals.length,
    cancelled_left_count:     cancelled_left.length,
    unbatched_payout_ttd:     +unbatchedTotal.toFixed(2),
    refunded_total_ttd:       +refundedTotal.toFixed(2),
    failed_refund_count:      failedRefundCount,
  };

  return NextResponse.json({ active, completed_removals, cancelled_left, stats });
}
