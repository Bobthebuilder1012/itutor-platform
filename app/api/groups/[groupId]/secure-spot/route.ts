// POST /api/groups/[groupId]/secure-spot
//
// Pay the first month up front to hold a seat in a class that has not started
// yet. One-time charge, not a subscription: nothing renews, and after the
// first month the student is asked whether they want to continue.
//
// Order of operations matters. The seat is claimed in the database BEFORE
// Stripe is called, inside a transaction that counts capacity under a lock —
// otherwise two students on the last seat both pay and one has to be refunded.
// If Stripe then fails, the claim is released immediately rather than parking
// the seat for the length of the checkout window.
//
// The enrollment stays SECURED_PENDING_PAYMENT until the webhook confirms the
// charge. The client never marks anything paid.

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
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

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

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

const CLAIM_MESSAGE: Record<string, string> = {
  no_capacity: 'This class is full.',
  already_enrolled: "You've already got a place in this class.",
  secure_spot_not_enabled: 'This class is not taking reservations.',
  group_archived: 'This class is no longer available.',
  tutor_cannot_enrol: 'You cannot reserve a place in your own class.',
  group_not_found: 'Class not found.',
};

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    const { data: group, error: groupError } = await admin
      .from('groups')
      .select('id, name, tutor_id, price_monthly, max_students, secure_spot_enabled, end_date, archived_at')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) {
      console.error('[secure-spot] group lookup failed:', groupError.message);
      return NextResponse.json({ error: 'Could not load the class' }, { status: 500 });
    }
    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // The claim RPC re-checks all of this under a lock. Checking here too just
    // buys a readable error instead of a bare reason code.
    if ((group as any).archived_at) {
      return NextResponse.json({ error: CLAIM_MESSAGE.group_archived }, { status: 400 });
    }
    if (!(group as any).secure_spot_enabled) {
      return NextResponse.json(
        { error: CLAIM_MESSAGE.secure_spot_not_enabled, reason: 'secure_spot_not_enabled' },
        { status: 400 }
      );
    }

    // ---- The class must actually have somewhere to start from ------------
    const { data: sessions, error: sessionError } = await admin
      .from('group_sessions')
      .select(SESSION_COLUMNS)
      .eq('group_id', groupId);

    if (sessionError) {
      console.error('[secure-spot] session lookup failed:', sessionError.message);
      return NextResponse.json({ error: 'Could not load the class schedule' }, { status: 500 });
    }

    const eligibility = preorderEligibility((sessions ?? []) as SessionPattern[]);
    if (!eligibility.eligible) {
      return NextResponse.json(
        { error: ELIGIBILITY_MESSAGE[eligibility.reason], reason: eligibility.reason },
        { status: 400 }
      );
    }

    const { firstSession } = eligibility;
    const endDate = (group as any).end_date ?? null;
    const releaseDate = computeReleaseDate({ firstSession, endDate });
    const short = isShortClass({ firstSession, endDate });

    // ---- Money -----------------------------------------------------------
    // Commission is charged on the class price, not on the grossed-up total:
    // the processing fee is neither the platform's revenue nor the tutor's.
    // Same basis as createPendingSubscriptionPayment.
    const baseAmount = Number((group as any).price_monthly ?? 0);
    const isFree = !(baseAmount > 0);

    const fees = isFree ? null : calculateGrossAmountForProvider(baseAmount, 'stripe');
    const commission = isFree
      ? { platformFee: 0, payoutAmount: 0 }
      : await calculateCommissionForTutor(admin, (group as any).tutor_id, baseAmount);

    // ---- Claim the seat, atomically, before touching Stripe --------------
    const { data: claim, error: claimError } = await (admin as any).rpc('secure_spot_claim', {
      p_payload: {
        group_id: groupId,
        student_id: user.id,
        amount_ttd: baseAmount,
        platform_fee_ttd: commission.platformFee,
        tutor_payout_ttd: commission.payoutAmount,
        hold_minutes: SECURE_SPOT_HOLD_MINUTES,
      },
    });

    if (claimError) {
      console.error('[secure-spot] claim failed:', claimError.message);
      return NextResponse.json({ error: 'Could not reserve a place' }, { status: 500 });
    }
    if (!claim?.ok) {
      const reason = String(claim?.reason ?? 'claim_failed');
      // Full or already-in is a conflict, not a bad request.
      const status = reason === 'no_capacity' || reason === 'already_enrolled' ? 409 : 400;
      return NextResponse.json(
        { error: CLAIM_MESSAGE[reason] ?? 'Could not reserve a place', reason },
        { status }
      );
    }

    const enrollmentId: string = claim.enrollment_id;
    const subscriptionPaymentId: string | null = claim.subscription_payment_id ?? null;

    // ── enrolment_started ──
    // Emitted at the CLAIM, not at the button press. This is the first moment a
    // seat is actually held on the student's behalf, so it is the first moment
    // there is anything to abandon — which is what the enrolment_started → paid
    // ratio is for. Emitting on the click would fold "the class was full" and
    // "the class had no schedule" into the drop-off number and make checkout
    // look broken when it was working correctly.
    await track(PRODUCT_EVENTS.ENROLMENT_STARTED, { group_id: groupId }, { userId: user.id });

    // ---- Free class: no Stripe object at all -----------------------------
    // Stripe will not create zero-value payment objects, and there is no money
    // to hold, so there is no ledger row and no release date either.
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
        return NextResponse.json({ error: 'Could not reserve a place' }, { status: 500 });
      }

      // The paid path notifies from the webhook; a free reservation never goes
      // near Stripe, so it has to notify here or the tutor would only ever be
      // told about students who paid.
      if (confirmed?.idempotent !== true) {
        await notifySpotSecured({
          admin,
          enrollmentId,
          group: { id: groupId, name: (group as any).name ?? null, tutor_id: (group as any).tutor_id ?? null },
          studentId: user.id,
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
        { userId: user.id, dedupeKey: `free:${enrollmentId}` }
      );

      return NextResponse.json({
        success: true,
        free: true,
        enrollment_id: enrollmentId,
        first_session: firstSession.toISOString(),
        release_date: null,
        short_class: short,
      });
    }

    // ---- Paid class ------------------------------------------------------
    try {
      const stripe = getStripeClient();
      const customerId = await ensureStripeCustomer(admin as any, user.id);

      // A resumed checkout leaves the abandoned intent open. Cancel it, or the
      // student could still pay on a stale tab against a payment row this
      // claim has already retired — money in, nothing to attach it to.
      const superseded: string | null = claim.superseded_payment_intent_id ?? null;
      if (superseded) {
        try {
          await stripe.paymentIntents.cancel(superseded, { cancellation_reason: 'abandoned' });
        } catch (cancelError) {
          // Already cancelled, already paid, or gone. Not worth failing the
          // new reservation over; the webhook is still the only writer.
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
          // is charged off-session. It also surfaces an expired card at month
          // one instead of silently failing later.
          setup_future_usage: 'off_session',
          automatic_payment_methods: { enabled: true },
          metadata: {
            // `kind` is what the webhook switches on, matching
            // group_subscription and create_booking.
            kind: 'secure_spot',
            enrollment_id: enrollmentId,
            group_id: groupId,
            student_id: user.id,
            payment_id: subscriptionPaymentId ?? '',
            base_amount_ttd: String(baseAmount),
            processing_fee_ttd: String(fees!.processingFee),
          },
        },
        // Keyed on the PAYMENT, not the enrollment. Resuming an abandoned
        // checkout reuses the enrollment row but opens a new payment, and
        // Stripe rejects a key replayed with different parameters — keyed on
        // the enrollment, every resumed checkout would have failed outright.
        { idempotencyKey: `secure-${subscriptionPaymentId ?? enrollmentId}` }
      );

      if (subscriptionPaymentId) {
        await admin
          .from('subscription_payments')
          .update({ stripe_payment_intent_id: intent.id })
          .eq('id', subscriptionPaymentId);
      }

      return NextResponse.json({
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
      });
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
      return NextResponse.json(
        {
          error: 'Could not start the payment',
          details: isApiError ? stripeError.message : (stripeError as Error).message,
        },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/secure-spot]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function releaseClaim(
  admin: ReturnType<typeof getServiceClient>,
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
