// PATCH /api/groups/[groupId]/payments/[paymentId] — the row actions.
//
// §7: record cash, waive, void. Suspension is deliberately NOT here — it reuses
// the existing group_members machinery and its confirmation copy, and forking
// that into a second implementation is how two suspensions start behaving
// differently.
//
// ── ONLY CASH CAN BE RECORDED BY HAND ──────────────────────────────────────
// A card payment's witness is the gateway. Letting a tutor mark a card row PAID
// would let them assert money that never moved, and nothing downstream could
// tell the difference. So `record_cash` refuses anything whose payment_method
// is not cash.
//
// ── VOID HAS NO TIME LIMIT, BY DESIGN ──────────────────────────────────────
// The spec is explicit that voiding is tutor-managed and the audit trail is the
// control rather than a window. Hence voided_by and void_reason: without them a
// voided charge is indistinguishable from one the system cancelled, and there
// would be nothing to review.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string; paymentId: string }> };

const ACTIONS = ['record_cash', 'waive', 'void'] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(req: NextRequest, { params }: Params) {
  const { groupId, paymentId } = await params;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const admin = getServiceClient();

  const { data: group } = await admin
    .from('groups')
    .select('id, tutor_id')
    .eq('id', groupId)
    .maybeSingle();
  if (!group || (group as any).tutor_id !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: { action?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = body.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  }

  // Scoped to the group as well as the id, so a payment id from another class
  // cannot be acted on by a tutor who happens to own a different one.
  const { data: payment, error: readErr } = await admin
    .from('subscription_payments')
    .select('id, group_id, enrollment_id, student_id, amount_ttd, status, payment_method, waived_at, voided_at')
    .eq('id', paymentId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (readErr) {
    console.error('[payments] read failed:', readErr.message);
    return NextResponse.json({ error: 'could_not_load' }, { status: 500 });
  }
  if (!payment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const p = payment as any;
  if (p.voided_at) {
    return NextResponse.json({ error: 'This payment has been voided.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

  if (action === 'record_cash') {
    if ((p.payment_method ?? 'card') !== 'cash') {
      return NextResponse.json(
        { error: 'Only a cash payment can be recorded by hand.' },
        { status: 400 }
      );
    }
    if (p.status === 'PAID') {
      return NextResponse.json({ error: 'Already recorded.' }, { status: 409 });
    }

    const { error } = await admin
      .from('subscription_payments')
      .update({ status: 'PAID', paid_at: now, recorded_by: user.id })
      .eq('id', paymentId);
    if (error) {
      console.error('[payments] record cash failed:', error.message);
      return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
    }

    // Activate the seat the hold was keeping. A cash hold sits in
    // PENDING_PAYMENT with no expiry, so nothing else would ever move it.
    if (p.enrollment_id) {
      const { error: enrolErr } = await admin
        .from('group_enrollments')
        .update({ status: 'ACTIVE', payment_status: 'PAID' })
        .eq('id', p.enrollment_id)
        .eq('status', 'PENDING_PAYMENT');
      if (enrolErr) {
        // The money is recorded; failing the request now would invite the tutor
        // to record it twice. Logged for repair instead.
        console.error('[payments] enrolment activation failed:', enrolErr.message);
      }
    }

    // The platform never saw this money, so it could not withhold its
    // share. Written as a debt against the tutor's next payout — see
    // migration 249 for why this is tutor_deductions and not a new table.
    //
    // Non-fatal on purpose: the cash HAS been handed over, and failing the
    // request now would invite the tutor to record it a second time. The
    // partial unique index in 249 is what makes that retry safe, and this
    // log is what makes a missing debt findable.
    try {
      const amount = Number((p as any).amount_ttd) || 0;
      if (amount > 0) {
        const { platformFee } = await calculateCommissionForTutor(admin, user.id, amount);
        if (platformFee > 0) {
          const { error: debtErr } = await admin.from('tutor_deductions').insert({
            tutor_id: user.id,
            amount_ttd: platformFee,
            reason: 'cash_commission',
            source_enrollment_id: p.enrollment_id ?? null,
            source_subscription_payment_id: paymentId,
            status: 'pending',
          });
          // 23505 = the one-per-payment index caught a retry. Not an error.
          if (debtErr && String(debtErr.code) !== '23505') {
            console.error('[payments] cash commission debt failed:', debtErr.message);
          }
        }
      }
    } catch (debtErr) {
      console.error('[payments] cash commission debt threw:', debtErr);
    }

    return NextResponse.json({ ok: true, status: 'PAID' });
  }

  if (action === 'waive') {
    const { error } = await admin
      .from('subscription_payments')
      .update({ waived_at: now, waived_by: user.id, waive_reason: reason })
      .eq('id', paymentId);
    if (error) {
      console.error('[payments] waive failed:', error.message);
      return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
    }

    // A waived month must not leave the student suspended for non-payment —
    // waiving means "they owe nothing", and the enrolment has to agree.
    if (p.enrollment_id) {
      await admin
        .from('group_enrollments')
        .update({ status: 'ACTIVE', payment_status: 'PAID' })
        .eq('id', p.enrollment_id)
        .in('status', ['PENDING_PAYMENT', 'GRACE', 'SUSPENDED']);
    }

    return NextResponse.json({ ok: true, waived: true });
  }

  // void
  const { error } = await admin
    .from('subscription_payments')
    .update({ voided_at: now, voided_by: user.id, void_reason: reason })
    .eq('id', paymentId);
  if (error) {
    console.error('[payments] void failed:', error.message);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }

  // Voiding an unpaid hold releases the seat. Voiding a PAID row does not touch
  // the enrolment: the money moved, and reversing that is a refund, which has
  // its own machinery and its own authority.
  if (p.enrollment_id && p.status !== 'PAID') {
    await admin
      .from('group_enrollments')
      .update({ status: 'CANCELLED', payment_status: 'CANCELLED' })
      .eq('id', p.enrollment_id)
      .eq('status', 'PENDING_PAYMENT');
  }

  // Voiding says the money did not really arrive. A cash commission debt
  // raised against it must go with it, or the tutor is left owing the
  // platform a share of a payment the platform has just been told never
  // happened. Waived rather than deleted: the row is the only evidence the
  // debt was ever raised, and an admin reviewing a disputed void needs it.
  await admin
    .from('tutor_deductions')
    .update({ status: 'waived', resolved_at: now })
    .eq('source_subscription_payment_id', paymentId)
    .eq('reason', 'cash_commission')
    .eq('status', 'pending');

  return NextResponse.json({ ok: true, voided: true });
}
