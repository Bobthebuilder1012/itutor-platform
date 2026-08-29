// Fulfilment of a parent-approved booking — handover §4.6, and the second half
// of §4.5.
//
// Reached from checkout.session.completed. Everything that makes a child
// actually enrolled happens here and nowhere earlier, because until Stripe says
// the money cleared the parent may still have abandoned the page.
//
// §4.6, in order:
//   1. capacity re-check
//   2. PARENT_APPROVED, booking confirmed
//   3. payer_id = the payer
//   4. now the tutor sees it
//   5. the approval email goes to the STUDENT — on payment clearing, not on the
//      approve click
//
// THE PATH THAT MUST NOT BE SKIPPED
// §4.5: if the class filled despite the first check, the payment has already
// succeeded. Refund automatically, set SEAT_UNAVAILABLE_REFUNDED, tell both
// people. §13 singles this out: "Deliberately test the §4.5 auto-refund path.
// It is rare and will not surface on its own." Without it a parent is charged
// for nothing and the only trace is a row in the Stripe dashboard.

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkCapacity } from '@/lib/server/bookingRequests';
import { loadRequestContext } from '@/lib/server/bookingRequestContext';
import {
  notifySeatUnavailableRefunded,
  notifyStudentOfApproval,
} from '@/lib/server/bookingRequestNotify';
import { refundCheckoutSession } from '@/lib/payments/parentApprovalCheckout';
import { createSessionForBooking } from '@/lib/services/sessionService';

/** Only sessions this flow created are ours to fulfil. */
export function isParentApprovalSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.itutor_flow === 'parent_approval';
}

export type FulfilResult =
  | { handled: false; reason: string }
  | { handled: true; outcome: 'confirmed' | 'refunded_no_capacity' | 'already_done' };

export async function fulfilParentApproval(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<FulfilResult> {
  const bookingId = session.metadata?.booking_id ?? session.client_reference_id ?? null;
  if (!bookingId) return { handled: false, reason: 'no_booking_id_on_session' };

  const ctx = await loadRequestContext(admin, bookingId);
  if (!ctx) return { handled: false, reason: 'booking_not_found' };

  // Idempotency. Stripe retries webhooks, and a retry must not create a second
  // session for the student or send the enrolment email twice.
  if (ctx.booking.status === 'CONFIRMED' || ctx.booking.status === 'PARENT_APPROVED') {
    return { handled: true, outcome: 'already_done' };
  }
  if (ctx.booking.status === 'SEAT_UNAVAILABLE_REFUNDED') {
    return { handled: true, outcome: 'already_done' };
  }

  const nowIso = new Date().toISOString();
  const parentId = ctx.parent?.id ?? ctx.booking.payer_id ?? null;

  // ---- 1. §4.5 second capacity check --------------------------------------
  const capacity = await checkCapacity(admin, {
    id: ctx.booking.id,
    tutor_id: ctx.booking.tutor_id,
    requested_start_at: ctx.booking.requested_start_at,
    requested_end_at: ctx.booking.requested_end_at,
  });

  if (!capacity.available) {
    // Money first: refund before touching the booking, so a failure to write
    // the row cannot leave a charge stranded with no refund attempted.
    const refund = await refundCheckoutSession(session.id);

    await admin
      .from('bookings')
      .update({
        status: 'SEAT_UNAVAILABLE_REFUNDED',
        decided_at: nowIso,
        payment_status: refund.ok ? 'refunded' : 'paid',
        payment_required: false,
      })
      .eq('id', bookingId);

    if (!refund.ok) {
      // The one case a human must see: charged, no place, refund failed. There
      // is an existing admin alert type for exactly this.
      console.error(
        `[parentApprovalFulfilment] REFUND FAILED booking=${bookingId} session=${session.id}: ${refund.reason}`
      );
      try {
        await admin.from('notifications').insert({
          user_id: parentId,
          type: 'refund_failed_admin_alert',
          title: 'Automatic refund failed',
          message: `Booking ${bookingId} lost its place after payment and the refund did not go through. Support will complete it.`,
          related_booking_id: bookingId,
          is_read: false,
          metadata: { checkout_session_id: session.id, reason: refund.reason },
        });
      } catch {
        /* alerting must not mask the original failure */
      }
    }

    if (parentId) {
      await notifySeatUnavailableRefunded(admin, {
        parentId,
        parentEmail: ctx.parent?.email ?? null,
        parentName: ctx.parent?.name ?? null,
        studentId: ctx.student.id,
        childName: ctx.student.name,
        subjectLabel: ctx.subjectLabel,
        amountTtd: ctx.amountTtd,
        bookingId,
      });
    }

    return { handled: true, outcome: 'refunded_no_capacity' };
  }

  // ---- 2–4. confirmed, payer recorded, tutor can now see it ---------------
  const { error } = await admin
    .from('bookings')
    .update({
      status: 'CONFIRMED',
      confirmed_start_at: ctx.booking.requested_start_at,
      confirmed_end_at: ctx.booking.requested_end_at,
      decided_at: ctx.booking.status === 'PENDING_PARENT_APPROVAL' ? nowIso : undefined,
      decided_by: parentId ?? undefined,
      parent_approved_at: nowIso,
      payer_id: parentId,
      payment_status: 'paid',
      payment_required: true,
      checkout_session_id: session.id,
    })
    .eq('id', bookingId);

  if (error) {
    // Do not swallow: Stripe will retry, and a retry is the correct outcome
    // here because the money is in and the booking is not yet confirmed.
    throw new Error(`[parentApprovalFulfilment] booking update failed: ${error.message}`);
  }

  // The session row (and its meeting link) comes from the same helper the
  // ordinary Stripe success path uses, so a parent-paid booking is materialised
  // identically to a student-paid one.
  try {
    await createSessionForBooking(bookingId);
  } catch (e) {
    console.error('[parentApprovalFulfilment] createSessionForBooking failed:', e);
  }

  // ---- 5. now, and not before, the student is told ------------------------
  await notifyStudentOfApproval(admin, {
    studentId: ctx.student.id,
    studentEmail: ctx.student.email,
    studentName: ctx.student.name,
    subjectLabel: ctx.subjectLabel,
    tutorName: ctx.tutor.name,
    whenLabel: ctx.whenLabel,
    bookingId,
  });

  return { handled: true, outcome: 'confirmed' };
}
