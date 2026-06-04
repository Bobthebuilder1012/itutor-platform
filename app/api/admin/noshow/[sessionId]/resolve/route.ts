// =====================================================
// ADMIN NO-SHOW RESOLVE
// =====================================================
// POST /api/admin/noshow/:sessionId/resolve
// Body: { outcome: 'student_noshow' | 'tutor_noshow' | 'tie' }
//
// Maps the admin's verdict onto a refund / strike shape, hands it
// to lib/payments/refundService where money moves, and writes
// the right strikes / system ratings via lib/reliability.
//
// Outcome mapping:
//   student_noshow → NO refund. Payment + tutor payout proceed
//                    normally per session-finalize cron. Student
//                    receives a 90-day strike.
//                    sessions.status='NO_SHOW_STUDENT'.
//   tutor_noshow   → full refund. Tutor strike + 1-star system rating.
//                    sessions.status='NO_SHOW_TUTOR'.
//   tie            → full refund. No penalties either side.
//                    sessions.status='MUTUAL_NON_COMPLETION'.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { refundPayment, type RefundReason } from '@/lib/payments/refundService';
import {
  writeTutorStrike,
  writeStudentStrike,
  writeSystemRating,
} from '@/lib/reliability';
import { createRequiredNotice, fmtTTD } from '@/lib/notices/createNotice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Outcome = 'student_noshow' | 'tutor_noshow' | 'tie';

interface ResolveBody {
  outcome?: Outcome;
  claimId?: string;
  adminNotes?: string;
}

const VALID_OUTCOMES: ReadonlySet<Outcome> = new Set([
  'student_noshow',
  'tutor_noshow',
  'tie',
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as ResolveBody;
  if (!body.outcome || !VALID_OUTCOMES.has(body.outcome)) {
    return NextResponse.json(
      { error: "outcome must be one of 'student_noshow' | 'tutor_noshow' | 'tie'" },
      { status: 400 }
    );
  }
  const outcome: Outcome = body.outcome;

  const admin = getServiceClient();

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, booking_id, status, charge_amount_ttd, tutor_id, student_id')
    .eq('id', params.sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (!session.booking_id) {
    return NextResponse.json(
      { error: 'Session has no booking — cannot resolve' },
      { status: 400 }
    );
  }

  // student_noshow: no refund, payment proceeds normally. Tutor strike + system rating only for tutor verdicts.
  // tutor_noshow / tie: refund via refundService. tutor_noshow also writes a strike + 1-star rating.
  let refundResult: Awaited<ReturnType<typeof refundPayment>> | null = null;
  let sessionStatusOverride: string;

  if (outcome === 'student_noshow') {
    sessionStatusOverride = 'NO_SHOW_STUDENT';
    // Update session status directly — no refund pipeline involvement.
    const { error: sessionUpdateError } = await admin
      .from('sessions')
      .update({ status: sessionStatusOverride, updated_at: new Date().toISOString() })
      .eq('id', session.id);
    if (sessionUpdateError) {
      return NextResponse.json({ error: sessionUpdateError.message }, { status: 500 });
    }

    await writeStudentStrike(admin, {
      studentId: session.student_id,
      reason: 'student_noshow',
      bookingId: session.booking_id,
      sessionId: session.id,
      notes: 'No-show claim resolved against student',
    });
  } else {
    // tutor_noshow or tie — both require a full refund.
    const { data: payment } = await admin
      .from('payments')
      .select('id, status, amount_ttd, total_refunded_ttd')
      .eq('booking_id', session.booking_id)
      .in('status', ['succeeded', 'partially_refunded'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json(
        { error: 'No refundable payment found for this booking' },
        { status: 404 }
      );
    }

    const amountTtd = Number(payment.amount_ttd ?? 0);
    const alreadyRefunded = Number(payment.total_refunded_ttd ?? 0);
    const remaining = +(amountTtd - alreadyRefunded).toFixed(2);

    if (remaining <= 0) {
      return NextResponse.json(
        { error: 'Payment is already fully refunded' },
        { status: 409 }
      );
    }

    const reason: RefundReason =
      outcome === 'tutor_noshow' ? 'tutor_noshow' : 'tie_inconclusive';
    sessionStatusOverride =
      outcome === 'tutor_noshow' ? 'NO_SHOW_TUTOR' : 'MUTUAL_NON_COMPLETION';

    refundResult = await refundPayment({
      paymentId: payment.id,
      reason,
      refundAmountTtd: remaining,
      retainedAmountTtd: 0,
      actorId: auth.user!.id,
      sessionStatusOverride,
      client: admin,
    });

    if (!refundResult.ok) {
      return NextResponse.json(
        {
          error: refundResult.message,
          code: refundResult.code,
          details: refundResult.details,
        },
        { status: refundResult.status }
      );
    }

    if (outcome === 'tutor_noshow') {
      await writeTutorStrike(admin, {
        tutorId: session.tutor_id,
        reason: 'tutor_noshow',
        bookingId: session.booking_id,
        sessionId: session.id,
        notes: 'No-show claim resolved against tutor',
      });
      await writeSystemRating(admin, {
        tutorId: session.tutor_id,
        studentId: session.student_id,
        sessionId: session.id,
        reason: 'tutor_noshow',
      });
    }
  }

  // Resolve the claim row.
  const claimUpdate: Record<string, unknown> = {
    status: 'resolved',
    admin_verdict: outcome,
    admin_id: auth.user!.id,
    admin_decided_at: new Date().toISOString(),
  };
  if (body.adminNotes && typeof body.adminNotes === 'string') {
    claimUpdate.admin_notes = body.adminNotes.trim();
  }
  if (body.claimId) {
    await admin.from('noshow_claims').update(claimUpdate).eq('id', body.claimId);
  } else {
    await admin.from('noshow_claims').update(claimUpdate).eq('session_id', session.id);
  }

  // Flip the booking row only for refund outcomes. For student_noshow
  // the booking stays as-is (payment proceeds, session is just flagged).
  if (outcome !== 'student_noshow' && session.booking_id) {
    await admin
      .from('bookings')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
        cancel_reason:
          outcome === 'tutor_noshow'
            ? 'Tutor no-show (admin verdict)'
            : 'No-show dispute inconclusive (admin verdict)',
        last_action_by: 'admin',
      })
      .eq('id', session.booking_id);
  }

  // Auto-close any open payout_case for this session.
  // apply_refund_side_effects already handled admin_hold → reversed for
  // tutor_noshow/tie paths; here we just update the case status.
  try {
    const { data: openCase } = await admin
      .from('payout_cases')
      .select('id, status')
      .eq('session_id', session.id)
      .in('status', ['open', 'under_review'])
      .maybeSingle();

    if (openCase) {
      if (outcome === 'student_noshow') {
        await (admin as any).rpc('resolve_payout_case', {
          p_case_id:     openCase.id,
          p_action:      'release_to_tutor',
          p_admin_id:    auth.user!.id,
          p_admin_notes: `Auto-resolved: verdict was student_noshow. ${body.adminNotes ?? ''}`.trim(),
        });
      } else {
        // tutor_noshow / tie: ledger already reversed by refundPayment; close the case
        await admin
          .from('payout_cases')
          .update({
            status:      'closed',
            admin_id:    auth.user!.id,
            admin_notes: `Closed: verdict ${outcome}. Payout reversed via refundPayment.`,
            resolved_at: new Date().toISOString(),
            updated_at:  new Date().toISOString(),
          })
          .eq('id', openCase.id);
      }
    }
  } catch (e) {
    console.error('[admin/noshow/resolve] payout case auto-close failed (non-blocking):', e);
  }

  // Required notices — inform both parties of the admin verdict.
  const resolvedClaimId = body.claimId ?? null;
  const refundAmt = refundResult?.ok ? refundResult.refundAmountTtd : 0;

  try {
    if (outcome === 'student_noshow') {
      await createRequiredNotice(admin, {
        user_id: session.student_id,
        type: 'noshow_admin_verdict_student_noshow',
        severity: 'danger',
        title: 'No-show case resolved — no refund',
        message:
          'An admin has reviewed the no-show dispute and determined that you did not attend the session. No refund will be issued and your payment stands. A strike has been added to your account.',
        requires_ack: true,
        related_session_id: session.id,
        related_noshow_claim_id: resolvedClaimId,
      });
      await createRequiredNotice(admin, {
        user_id: session.tutor_id,
        type: 'noshow_admin_verdict_student_noshow',
        severity: 'success',
        title: 'No-show case resolved in your favor',
        message:
          'An admin has reviewed the no-show dispute and found in your favor. The student was determined to be the no-show. Your payout will proceed as normal.',
        requires_ack: false,
        related_session_id: session.id,
        related_noshow_claim_id: resolvedClaimId,
      });
    } else if (outcome === 'tutor_noshow') {
      await createRequiredNotice(admin, {
        user_id: session.student_id,
        type: 'noshow_admin_verdict_tutor_noshow',
        severity: 'success',
        title: 'No-show case resolved — refund approved',
        message: `An admin has reviewed the no-show dispute and found in your favor. A full refund of ${fmtTTD(refundAmt)} has been approved and will be returned to your original payment method.`,
        requires_ack: true,
        related_session_id: session.id,
        related_noshow_claim_id: resolvedClaimId,
        refund_amount_ttd: refundAmt,
      });
      await createRequiredNotice(admin, {
        user_id: session.tutor_id,
        type: 'noshow_admin_verdict_tutor_noshow',
        severity: 'danger',
        title: 'No-show case resolved against you',
        message: `An admin has reviewed the no-show dispute and determined that you did not attend the session. A full refund of ${fmtTTD(refundAmt)} has been issued to the student. A strike and a 1-star system rating have been recorded on your account.`,
        requires_ack: true,
        related_session_id: session.id,
        related_noshow_claim_id: resolvedClaimId,
        refund_amount_ttd: refundAmt,
      });
    } else {
      // tie
      await createRequiredNotice(admin, {
        user_id: session.student_id,
        type: 'noshow_admin_verdict_tie',
        severity: 'success',
        title: 'No-show case — refund approved',
        message: `An admin reviewed the no-show dispute and was unable to determine fault. As a result, a full refund of ${fmtTTD(refundAmt)} has been approved and will be returned to your original payment method.`,
        requires_ack: true,
        related_session_id: session.id,
        related_noshow_claim_id: resolvedClaimId,
        refund_amount_ttd: refundAmt,
      });
      await createRequiredNotice(admin, {
        user_id: session.tutor_id,
        type: 'noshow_admin_verdict_tie',
        severity: 'warning',
        title: 'No-show case — split decision',
        message: `An admin reviewed the no-show dispute and was unable to determine fault. A full refund of ${fmtTTD(refundAmt)} has been issued to the student and your payout for this session has been reversed.`,
        requires_ack: true,
        related_session_id: session.id,
        related_noshow_claim_id: resolvedClaimId,
        refund_amount_ttd: refundAmt,
      });
    }
  } catch (e) {
    console.error('[admin/noshow/resolve] required notices insert failed (non-blocking):', e);
  }

  return NextResponse.json({
    ok: true,
    session_id: session.id,
    outcome,
    session_status: sessionStatusOverride,
    payment_status: refundResult?.ok ? refundResult.newPaymentStatus : null,
    ledger_action: refundResult?.ok ? refundResult.ledgerAction : null,
    refund_amount_ttd: refundResult?.ok ? refundResult.refundAmountTtd : 0,
    retained_amount_ttd: refundResult?.ok ? refundResult.retainedAmountTtd : 0,
    total_refunded_ttd: refundResult?.ok ? refundResult.totalRefundedTtd : 0,
    warning: refundResult?.ok ? refundResult.warning : undefined,
  });
}
