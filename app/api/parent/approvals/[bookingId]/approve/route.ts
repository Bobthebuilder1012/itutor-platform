// POST /api/parent/approvals/[bookingId]/approve — handover §4.4.
//
// Approval is consent, not just payment (statement 2). That is why a free class
// still comes through here and still requires the parent to act: they are
// agreeing to the enrolment, not authorising a charge.
//
// Order of operations matters and is not rearrangeable:
//   1. is this parent this child's parent
//   2. is the window still open (§4.2 — not inside the last two hours)
//   3. is there still a place (§4.5 first check — before taking any money)
//   4. free  -> enrol now, no Checkout at all
//      paid  -> hosted Checkout session, fulfilment happens in the webhook
//
// Nothing here marks the booking approved. For a paid class the booking becomes
// PARENT_APPROVED only when Stripe says the money cleared (§4.6), because a
// parent who abandons the Stripe page must not leave behind a child who appears
// enrolled and a tutor who has been told to expect them.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import {
  assertParentOfStudent,
  checkApprovalWindow,
  checkCapacity,
} from '@/lib/server/bookingRequests';
import { loadRequestContext } from '@/lib/server/bookingRequestContext';
import { notifyStudentOfApproval } from '@/lib/server/bookingRequestNotify';
import { createApprovalCheckoutSession } from '@/lib/payments/parentApprovalCheckout';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ bookingId: string }> };

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://myitutor.com').replace(/\/$/, '');
  return `${base}${path}`;
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { bookingId } = await params;

    const ctx = await loadRequestContext(admin, bookingId);
    if (!ctx) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

    // 1. Authority. Checked against the link table, never against payer_id —
    //    payer_id is data on the row and the row is what we are authorising.
    const isParent = await assertParentOfStudent(admin, parentProfile.id, ctx.student.id);
    if (!isParent) {
      return NextResponse.json({ error: 'Not your child' }, { status: 403 });
    }

    // 2. Window (§4.2).
    const window = checkApprovalWindow(ctx.booking);
    if (!window.ok) {
      return NextResponse.json(
        {
          error: window.reason,
          message:
            window.reason === 'expired'
              ? 'This request closed two hours before the session. The place went to another student.'
              : 'This request is no longer awaiting your approval.',
        },
        { status: 409 }
      );
    }

    // 3. First capacity check (§4.5). "If full, do not redirect. Show that the
    //    class filled and offer alternatives."
    const capacity = await checkCapacity(admin, {
      id: ctx.booking.id,
      tutor_id: ctx.booking.tutor_id,
      requested_start_at: ctx.booking.requested_start_at,
      requested_end_at: ctx.booking.requested_end_at,
    });

    if (!capacity.available) {
      return NextResponse.json(
        {
          error: 'no_capacity',
          reason: capacity.reason,
          message:
            'That time was taken by another student while this request was waiting. Nothing has been charged.',
          // §4.5 asks for alternatives rather than a dead end.
          alternativesUrl: `/parent/booking?subject=${ctx.booking.subject_id}&tutor=${ctx.booking.tutor_id}`,
        },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();

    // 4a. Free class — decision 9: still requires approval, skips Checkout.
    if (ctx.amountTtd <= 0) {
      const { error } = await admin
        .from('bookings')
        .update({
          status: 'CONFIRMED',
          confirmed_start_at: ctx.booking.requested_start_at,
          confirmed_end_at: ctx.booking.requested_end_at,
          decided_at: nowIso,
          decided_by: parentProfile.id,
          // Kept in step with the columns the earlier attempt left behind, so
          // anything still reading them agrees with the new ones.
          parent_approved_at: nowIso,
          payment_required: false,
          payment_status: 'paid',
          payer_id: parentProfile.id,
          last_action_by: 'student',
        })
        .eq('id', bookingId)
        // Optimistic guard: if a second tab already approved this, do nothing.
        .eq('status', 'PENDING_PARENT_APPROVAL');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // No payment to clear, so §4.6's "tell the student when it clears" is now.
      await notifyStudentOfApproval(admin, {
        studentId: ctx.student.id,
        studentEmail: ctx.student.email,
        studentName: ctx.student.name,
        subjectLabel: ctx.subjectLabel,
        tutorName: ctx.tutor.name,
        whenLabel: ctx.whenLabel,
        bookingId,
      });

      return NextResponse.json({
        ok: true,
        free: true,
        message: `${ctx.student.name.split(' ')[0]} is enrolled. No payment was involved.`,
      });
    }

    // 4b. Paid — hosted Checkout (decision 3).
    //
    // mode: 'payment' because a booking row is a single 1:1 session. §4.4's
    // subscription mode belongs to group classes, which enrol through
    // group_enrollments rather than bookings and therefore cannot be
    // represented on this row at all; they are also blocked on §12's unresolved
    // expiry rule. Deliberately not faked here — a subscription created against
    // a 1:1 booking would bill monthly for a session that happens once.
    const checkout = await createApprovalCheckoutSession({
      bookingId,
      amountTtd: ctx.amountTtd,
      mode: 'payment',
      description: `${ctx.subjectLabel} with ${ctx.tutor.name} — ${ctx.whenLabel}`,
      parentId: parentProfile.id,
      studentId: ctx.student.id,
      parentEmail: parentProfile.email ?? null,
      successUrl: appUrl(`/parent/approvals?checkout=success&booking=${bookingId}`),
      cancelUrl: appUrl(`/parent/approvals?checkout=cancelled&booking=${bookingId}`),
      existingSessionId: ctx.booking.checkout_session_id,
    });

    if (!checkout.ok) {
      if (checkout.reason === 'already_paid') {
        return NextResponse.json(
          { error: 'already_paid', message: 'This request has already been paid for.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: checkout.reason }, { status: 502 });
    }

    // Store the session so the webhook can find its way back, and so a parent
    // returning later gets the same link instead of a second charge attempt.
    await admin
      .from('bookings')
      .update({ checkout_session_id: checkout.sessionId, payment_status: 'pending' })
      .eq('id', bookingId);

    return NextResponse.json({ ok: true, free: false, checkoutUrl: checkout.url });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/approvals/[bookingId]/approve]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
