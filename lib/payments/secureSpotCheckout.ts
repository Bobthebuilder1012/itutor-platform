// Secure-your-spot checkout, shared by the student and the parent.
//
// Pay the first month up front to hold a seat in a class that has not started
// yet. One-time charge, not a subscription: nothing renews, and after the first
// month the student is asked whether they want to continue.
//
// Order of operations matters. The seat is claimed in the database BEFORE
// Stripe is called, inside a transaction that counts capacity under a lock —
// otherwise two students on the last seat both pay and one has to be refunded.
// If Stripe then fails, the claim is released immediately rather than parking
// the seat for the length of the checkout window.
//
// The enrollment stays SECURED_PENDING_PAYMENT until the webhook confirms the
// charge. The client never marks anything paid.
//
// WHY THE STUDENT AND THE PAYER ARE SEPARATE ARGUMENTS
// This lived inline in /api/groups/[groupId]/secure-spot and assumed the two
// were the same person, which left a parent with no way to buy a preorder class
// for their child at all: /parent/classes sent every priced class to the
// MONTHLY subscription checkout. So a parent enrolling a child in a class that
// had not started got a recurring subscription where the student path creates a
// one-time held charge — and, once the child had opened a secure-spot hold of
// their own, an outright "Failed to create enrollment" as the two collided on
// the unique index over (student_id, group_id).
//
// Everything identifying the person in the class keys on studentId — the claim,
// the enrollment, the roster, the webhook metadata. Only the Stripe customer is
// the payer. Getting this backwards would put the parent on the roster and
// charge the child's card.

import type { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getStripeClient, ttdToCents } from '@/lib/payments/stripeClient';
import { ensureStripeCustomer } from '@/lib/payments/stripeSubscriptions';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';
import {
  preorderEligibility,
  computeReleaseDate,
  isShortClass,
  SECURE_SPOT_HOLD_MINUTES,
} from '@/lib/payments/secureSpot';
import type { SessionPattern } from '@/lib/utils/scheduleFormat';
import { notifySpotSecured } from '@/lib/services/secureSpotService';
import { track, trackForUser } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';

const SESSION_COLUMNS =
  'recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on';

// Student-facing wording. Deliberately not preorderReasonMessage(), which is
// written for the tutor deciding whether to switch the feature on.
const ELIGIBILITY_MESSAGE: Record<string, string> = {
  no_schedule: 'This class does not have a confirmed schedule yet.',
  already_started: 'This class has already started — you can join it directly.',
  starts_today: 'This class starts today — you can join it directly.',
  too_far_out: 'This class starts too far in the future to reserve a place yet.',
};

export const CLAIM_MESSAGE: Record<string, string> = {
  no_capacity: 'This class is full.',
  already_enrolled: "You've already got a place in this class.",
  secure_spot_not_enabled: 'This class is not taking reservations.',
  group_archived: 'This class is no longer available.',
  tutor_cannot_enrol: 'You cannot reserve a place in your own class.',
  group_not_found: 'Class not found.',
};

export type SecureSpotResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

export async function createSecureSpotCheckout(params: {
  admin: SupabaseClient;
  groupId: string;
  /** The person who will be in the class. */
  studentId: string;
  /** Whose card is charged. Equal to studentId when a student pays for themself. */
  payerId: string;
}): Promise<SecureSpotResult> {
  const { admin, groupId, studentId, payerId } = params;

  const { data: group, error: groupError } = await admin
    .from('groups')
    .select('id, name, tutor_id, price_monthly, max_students, secure_spot_enabled, end_date, archived_at')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) {
    console.error('[secure-spot] group lookup failed:', groupError.message);
    return { ok: false, status: 500, body: { error: 'Could not load the class' } };
  }
  if (!group) return { ok: false, status: 404, body: { error: 'Class not found' } };

  // The claim RPC re-checks all of this under a lock. Checking here too just
  // buys a readable error instead of a bare reason code.
  if ((group as any).archived_at) {
    return { ok: false, status: 400, body: { error: CLAIM_MESSAGE.group_archived } };
  }
  if (!(group as any).secure_spot_enabled) {
    return {
      ok: false,
      status: 400,
      body: { error: CLAIM_MESSAGE.secure_spot_not_enabled, reason: 'secure_spot_not_enabled' },
    };
  }

  const { data: sessions, error: sessionError } = await admin
    .from('group_sessions')
    .select(SESSION_COLUMNS)
    .eq('group_id', groupId);

  if (sessionError) {
    console.error('[secure-spot] session lookup failed:', sessionError.message);
    return { ok: false, status: 500, body: { error: 'Could not load the class schedule' } };
  }

  const eligibility = preorderEligibility((sessions ?? []) as SessionPattern[]);
  if (!eligibility.eligible) {
    return {
      ok: false,
      status: 400,
      body: { error: ELIGIBILITY_MESSAGE[eligibility.reason], reason: eligibility.reason },
    };
  }

  const { firstSession } = eligibility;
  const endDate = (group as any).end_date ?? null;
  const releaseDate = computeReleaseDate({ firstSession, endDate });
  const short = isShortClass({ firstSession, endDate });

  // ---- Money -------------------------------------------------------------
  // Commission is charged on the class price, not on the grossed-up total: the
  // processing fee is neither the platform's revenue nor the tutor's. Same
  // basis as createPendingSubscriptionPayment.
  const baseAmount = Number((group as any).price_monthly ?? 0);
  const isFree = !(baseAmount > 0);

  const fees = isFree ? null : calculateGrossAmountForProvider(baseAmount, 'stripe');
  const commission = isFree
    ? { platformFee: 0, payoutAmount: 0 }
    : await calculateCommissionForTutor(admin as any, (group as any).tutor_id, baseAmount);

  // ---- Claim the seat, atomically, before touching Stripe ----------------
  const { data: claim, error: claimError } = await (admin as any).rpc('secure_spot_claim', {
    p_payload: {
      group_id: groupId,
      student_id: studentId,
      amount_ttd: baseAmount,
      platform_fee_ttd: commission.platformFee,
      tutor_payout_ttd: commission.payoutAmount,
      hold_minutes: SECURE_SPOT_HOLD_MINUTES,
    },
  });

  if (claimError) {
    console.error('[secure-spot] claim failed:', claimError.message);
    return { ok: false, status: 500, body: { error: 'Could not reserve a place' } };
  }
  if (!claim?.ok) {
    const reason = String(claim?.reason ?? 'claim_failed');
    // Full or already-in is a conflict, not a bad request.
    const status = reason === 'no_capacity' || reason === 'already_enrolled' ? 409 : 400;
    return {
      ok: false,
      status,
      body: { error: CLAIM_MESSAGE[reason] ?? 'Could not reserve a place', reason },
    };
  }

  const enrollmentId: string = claim.enrollment_id;
  const subscriptionPaymentId: string | null = claim.subscription_payment_id ?? null;

  // ── enrolment_started ──
  // Emitted at the CLAIM, not at the button press. This is the first moment a
  // seat is actually held on the student's behalf, so it is the first moment
  // there is anything to abandon — which is what the enrolment_started → paid
  // ratio measures. Emitting on the click would fold "the class was full" and
  // "the class had no schedule" into the drop-off number and make checkout look
  // broken when it was working correctly.
  //
  // Attributed to the STUDENT, not the payer, matching `paid` — the funnel
  // follows the learner through even when a parent holds the card.
  await track(
    PRODUCT_EVENTS.ENROLMENT_STARTED,
    { group_id: groupId },
    { userId: studentId }
  );

  // Who paid, on the row (migration 230). secure_spot_claim predates parents
  // being able to buy a preorder and takes no payer, so without this the
  // parent's reservation would be indistinguishable from the child paying for
  // themself — and would go missing from the parent's own subscriptions and
  // transactions, which filter on payer_id. NULL stays NULL for self-pay.
  if (payerId !== studentId) {
    const { error: payerErr } = await admin
      .from('group_enrollments')
      .update({ payer_id: payerId })
      .eq('id', enrollmentId);
    // Not worth abandoning a claimed seat over: the payment still completes and
    // the child still gets their place. Logged so the gap is findable.
    if (payerErr) console.error('[secure-spot] could not record payer:', payerErr.message);
  }

  // ---- Free class: no Stripe object at all -------------------------------
  // Stripe will not create zero-value payment objects, and there is no money to
  // hold, so there is no ledger row and no release date either.
  if (isFree) {
    const { data: confirmed, error: confirmError } = await (admin as any).rpc('secure_spot_confirm', {
      p_payload: {
        enrollment_id: enrollmentId,
        payment_intent_id: null,
        release_date: null,
        period_start: firstSession.toISOString(),
        period_end: `${releaseDate}T23:59:59.000Z`,
      },
    });

    if (confirmError || confirmed?.ok === false) {
      console.error('[secure-spot] free confirm failed:', confirmError?.message ?? confirmed?.reason);
      return { ok: false, status: 500, body: { error: 'Could not reserve a place' } };
    }

    // The paid path notifies from the webhook; a free reservation never goes
    // near Stripe, so it has to notify here or the tutor would only ever be
    // told about students who paid.
    if (confirmed?.idempotent !== true) {
      await notifySpotSecured({
        admin: admin as any,
        enrollmentId,
        group: {
          id: groupId,
          name: (group as any).name ?? null,
          tutor_id: (group as any).tutor_id ?? null,
        },
        studentId,
        releaseDate: null,
        firstSession,
      });
    }

    // ── paid, amount 0 ──
    // A free reservation never reaches the webhook, so without this line every
    // free class would show enrolment_started with no conversion and read as a
    // total drop-off. `paid` counts conversions; `amount` carries the revenue,
    // and zero is the honest value for both.
    await trackForUser(
      PRODUCT_EVENTS.PAID,
      { group_id: groupId, amount: 0 },
      { userId: studentId, dedupeKey: `free:${enrollmentId}` }
    );

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        free: true,
        enrollment_id: enrollmentId,
        first_session: firstSession.toISOString(),
        release_date: null,
        short_class: short,
      },
    };
  }

  // ---- Paid class --------------------------------------------------------
  try {
    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer(admin as any, payerId);

    // A resumed checkout leaves the abandoned intent open. Cancel it, or the
    // student could still pay on a stale tab against a payment row this claim
    // has already retired — money in, nothing to attach it to.
    const superseded: string | null = claim.superseded_payment_intent_id ?? null;
    if (superseded) {
      try {
        await stripe.paymentIntents.cancel(superseded, { cancellation_reason: 'abandoned' });
      } catch (cancelError) {
        // Already cancelled, already paid, or gone. Not worth failing the new
        // reservation over; the webhook is still the only writer.
        console.warn('[secure-spot] could not cancel superseded intent', superseded, cancelError);
      }
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: ttdToCents(fees!.grossAmount),
        currency: 'ttd',
        customer: customerId,
        description: `Secure your spot — ${(group as any).name}`,
        // Saves the card so the month-one "keep going?" prompt is a one-click
        // confirm rather than re-entering card details. Still opt-in: nothing
        // is charged off-session. It also surfaces an expired card at month one
        // instead of silently failing later.
        setup_future_usage: 'off_session',
        automatic_payment_methods: { enabled: true },
        metadata: {
          // `kind` is what the webhook switches on, matching group_subscription
          // and create_booking.
          kind: 'secure_spot',
          enrollment_id: enrollmentId,
          group_id: groupId,
          // The person in the class, never the payer — the webhook builds the
          // roster row from this.
          student_id: studentId,
          // Empty when they are the same person, so the existing self-pay
          // records are unchanged.
          payer_id: payerId === studentId ? '' : payerId,
          payment_id: subscriptionPaymentId ?? '',
          base_amount_ttd: String(baseAmount),
          processing_fee_ttd: String(fees!.processingFee),
        },
      },
      // Keyed on the PAYMENT, not the enrollment. Resuming an abandoned
      // checkout reuses the enrollment row but opens a new payment, and Stripe
      // rejects a key replayed with different parameters — keyed on the
      // enrollment, every resumed checkout would have failed outright.
      { idempotencyKey: `secure-${subscriptionPaymentId ?? enrollmentId}` }
    );

    if (subscriptionPaymentId) {
      await admin
        .from('subscription_payments')
        .update({ stripe_payment_intent_id: intent.id })
        .eq('id', subscriptionPaymentId);
    }

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        free: false,
        enrollment_id: enrollmentId,
        checkout_url: `/payments/checkout?pi=${intent.id}`,
        client_secret: intent.client_secret,
        amount: baseAmount,
        processing_fee: fees!.processingFee,
        total: fees!.grossAmount,
        fee_breakdown: fees!.breakdown,
        first_session: firstSession.toISOString(),
        release_date: releaseDate,
        short_class: short,
        expires_at: claim.expires_at,
      },
    };
  } catch (stripeError) {
    // Give the seat back now. Leaving it claimed would hold it for the whole
    // checkout window against a payment that was never going to happen.
    await releaseClaim(admin, enrollmentId, subscriptionPaymentId);

    const isApiError = stripeError instanceof Stripe.errors.StripeError;
    console.error(
      '[secure-spot] paymentIntents.create failed:',
      isApiError
        ? { type: stripeError.type, code: stripeError.code, message: stripeError.message }
        : stripeError
    );
    return {
      ok: false,
      status: 502,
      body: {
        error: 'Could not start the payment',
        details: isApiError ? stripeError.message : (stripeError as Error).message,
      },
    };
  }
}

async function releaseClaim(
  admin: SupabaseClient,
  enrollmentId: string,
  subscriptionPaymentId: string | null
) {
  await admin
    .from('group_enrollments')
    .update({
      status: 'CANCELLED',
      pending_payment_expires_at: null,
      cancelled_at: new Date().toISOString(),
      removal_reason: 'checkout_failed',
    })
    .eq('id', enrollmentId);

  if (subscriptionPaymentId) {
    await admin
      .from('subscription_payments')
      .update({ status: 'expired' })
      .eq('id', subscriptionPaymentId);
  }
}
