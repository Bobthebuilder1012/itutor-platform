// The group-subscription checkout, once, for both people who can start one.
//
// This was the body of POST /api/groups/[groupId]/subscribe, which used
// auth.uid() as the student, the Stripe customer and the schedule-conflict
// subject all at the same time. That is correct only while the payer and the
// student are the same person. A parent paying for a child needs the student and
// the customer to differ, and nothing else about the flow to change.
//
// It is extracted rather than copied deliberately. The fourteen steps below carry
// the seat reservation, the waitlist, the capacity arithmetic, the promotion
// selection and the cancel_at rounding — a second implementation would start
// identical and drift, and the way it would drift is a parent paying full price
// where a student got the early-bird rate, or a parent holding a seat the
// capacity check does not count.
//
// WHAT THE CALLER MUST GET RIGHT
//   studentId   who attends, and whose schedule is checked for clashes
//   payerId     whose Stripe customer is charged; equal to studentId for students
//   payerEmail  the payer's, because Stripe emails the receipt to the card holder
//
// Authorization is NOT done here. Each route proves its own right to act — the
// student route by session identity, the parent route by parent_child_links —
// because those are different proofs and collapsing them into a flag is how one
// of them ends up unchecked.

import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient, ttdToCents } from '@/lib/payments/stripeClient';
import {
  ensureStripeCustomer,
  ensureGroupPrice,
  endDateToCancelAt,
} from '@/lib/payments/stripeSubscriptions';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import {
  createPendingSubscriptionPayment,
  expireSubscriptionPayment,
} from '@/lib/services/subscriptionPayments';
import type { SeatType } from '@/lib/utils/seatCapacity';
import { checkCapacity, joinWaitlist, loadCheckoutContext } from '@/lib/payments/groupEnrollmentEligibility';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';

const SEAT_RESERVATION_MS = 30 * 60 * 1000; // 30 minutes

export type CheckoutOutcome =
  | { ok: true; status: 201; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function createGroupSubscriptionCheckout(params: {
  admin: SupabaseClient;
  groupId: string;
  /** Who attends. Their schedule is the one checked for clashes. */
  studentId: string;
  /** Who pays. Equal to studentId when a student subscribes for themself. */
  payerId: string;
  /** The payer's email — Stripe sends the receipt here. */
  payerEmail: string | null | undefined;
  /**
   * Which kind of seat is being bought. Omitted means 'online', which is what
   * every enrolment before migration 242 was and the only thing an online-only
   * class can offer — so the default is history rather than a guess.
   */
  seatType?: SeatType | null;
}): Promise<CheckoutOutcome> {
  const { admin, groupId, studentId, payerId, payerEmail, seatType } = params;

  // Steps 2–8 — the class, the student's right to join it, and a seat — are
  // shared with the one-month credit purchase: lib/payments/groupEnrollmentEligibility.ts.
  const loaded = await loadCheckoutContext({ admin, groupId, studentId, seatType });
  if (!loaded.ok) return loaded;
  const { ctx } = loaded;
  const { group, requestedSeat } = ctx;
  // A held month being converted to monthly billing: a secured spot paid up
  // front, or a month bought with credits. The row is reused, and its first
  // paid period starts when the held month ends.
  const continuingFromSecured = ctx.continuingFromSecured || ctx.continuingFromCreditMonth;
  let enrollmentId: string | null = ctx.enrollmentId;
  const isReusingEnrollment = ctx.isReusingEnrollment;

  const now = new Date();

  // Step 8: Capacity check (only for new enrollments). A full class offers the
  // waitlist.
  const capacity = await checkCapacity(admin, ctx, groupId, now);
  if (!capacity.ok) {
    if ('full' in capacity) return joinWaitlist(admin, groupId, studentId);
    return capacity;
  }

  // Step 9: Check for active promotions
  let promotionData: {
    promotionId: string | null;
    originalPrice: number;
    discountPercent: number | null;
    discountedPrice: number;
    promotionAppliedAt: string | null;
    promotionDurationDaysSnapshot: number | null;
    promotionExpiresAt: string | null;
  } = {
    promotionId: null,
    originalPrice: group.price_monthly,
    discountPercent: null,
    discountedPrice: group.price_monthly,
    promotionAppliedAt: null,
    promotionDurationDaysSnapshot: null,
    promotionExpiresAt: null,
  };

  let promotions: any[] | null = null;
  // A student coming back to finish a held seat ("Complete payment") is quoted
  // the same promotion a first-time checkout would get. A SECURED row converting
  // to monthly is not: that place was bought under secure-spot terms.
  if (!continuingFromSecured) {
    // This runs on the ADMIN client, so RLS does not scope it — the filter has
    // to be explicit here. A personal coupon (migration 231) belongs to one
    // buyer; without `user_id`, one coupon row would discount this class for
    // everyone who checks out. `user_id IS NULL` is a group-wide promotion,
    // which is every row created before 231.
    const nowIso = new Date().toISOString();
    const { data: promoRows } = await admin
      .from('group_promotions')
      .select('id, kind, discount, student_cap, duration_days, user_id, expires_at, price_duration_months, created_at')
      .eq('group_id', groupId)
      .eq('active', true)
      .or(`user_id.is.null,user_id.eq.${studentId}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .is('redeemed_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    // Precedence is explicit, not newest-first (docs 03: identical created_at
    // values tie nondeterministically, and a campaign coupon must not lose to
    // a standing class promotion): the buyer's personal coupon outranks
    // group-wide offers, then higher discount wins, then id as a stable tie-break.
    promotions = (promoRows ?? []).slice().sort((a: any, b: any) => {
      const aPersonal = a.user_id != null ? 0 : 1;
      const bPersonal = b.user_id != null ? 0 : 1;
      if (aPersonal !== bPersonal) return aPersonal - bPersonal;
      if ((b.discount ?? 0) !== (a.discount ?? 0)) return (b.discount ?? 0) - (a.discount ?? 0);
      return String(a.id).localeCompare(String(b.id));
    });

    if (promotions && promotions.length > 0) {
      // Find first applicable promotion, in precedence order (sorted above).
      for (const promo of promotions) {
        let applicable = true;

        if (promo.kind === 'early-bird' && promo.student_cap) {
          // Count how many subscribers have used this promotion. A held seat
          // being retried is excluded, or it would count against its own place.
          let usedQuery = admin
            .from('group_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('promotion_id', promo.id)
            .neq('status', 'ACTIVATION_FAILED');
          if (enrollmentId) usedQuery = usedQuery.neq('id', enrollmentId);
          const { count: usedCount } = await usedQuery;

          if ((usedCount ?? 0) >= promo.student_cap) {
            applicable = false;
          }
        }

        // The window the class page advertises (created_at + duration_days).
        // Without this an expired offer kept discounting checkouts.
        if (promo.kind === 'time-limited' && promo.duration_days && promo.created_at) {
          const windowEnd = new Date(promo.created_at);
          windowEnd.setDate(windowEnd.getDate() + promo.duration_days);
          if (windowEnd <= now) applicable = false;
        }

        if (applicable) {
          const discountedPrice = Math.round(group.price_monthly * (1 - promo.discount / 100) * 100) / 100;
          const appliedAt = now.toISOString();
          let promoExpiresAt: string | null = null;

          if (promo.duration_days) {
            const expiryDate = new Date(now);
            expiryDate.setDate(expiryDate.getDate() + promo.duration_days);
            promoExpiresAt = expiryDate.toISOString();
          }

          promotionData = {
            promotionId: promo.id,
            originalPrice: group.price_monthly,
            discountPercent: promo.discount,
            discountedPrice,
            promotionAppliedAt: appliedAt,
            promotionDurationDaysSnapshot: promo.duration_days ?? null,
            promotionExpiresAt: promoExpiresAt,
          };
          break;
        }
      }
    }
  }

  const finalPrice = promotionData.discountedPrice;
  const pendingExpiresAt = new Date(now.getTime() + SEAT_RESERVATION_MS).toISOString();

  // Step 10: Create or reuse group_enrollments row
  if (!isReusingEnrollment) {
    const enrolmentRow: Record<string, unknown> = {
        group_id: groupId,
        student_id: studentId,
        enrollment_type: 'SUBSCRIPTION',
        status: 'PENDING_PAYMENT',
        payment_status: 'PENDING',
        plan_price_ttd: finalPrice,
        original_price_ttd: promotionData.originalPrice,
        discount_percent: promotionData.discountPercent,
        discounted_price_ttd: promotionData.discountPercent ? finalPrice : null,
        promotion_id: promotionData.promotionId,
        promotion_applied_at: promotionData.promotionAppliedAt,
        promotion_duration_days_snapshot: promotionData.promotionDurationDaysSnapshot,
        promotion_expires_at: promotionData.promotionExpiresAt,
        // NULL when the student pays for themself (migration 230).
        payer_id: payerId === studentId ? null : payerId,
        // What they BOUGHT (migration 242) — not what they attend, which is
        // per-occurrence and may legitimately differ week to week. This is the
        // column seatCounts splits on, so an unwritten value would make a
        // physical seat invisible to the capacity gate above.
        seat_type: requestedSeat,
        current_period_start: null,
        current_period_end: null,
        next_payment_due_at: null,
        grace_period_ends_at: null,
        grace_period_days_snapshot: null,
        cancel_at_period_end: false,
        pending_payment_expires_at: pendingExpiresAt,
        reminder_count: 0,
        last_reminder_sent_at: null,
    };

    // TOLERANT OF A DATABASE WITHOUT 242. `seat_type` is the only key in this
    // row that might not exist as a column, and a missing column rejects the
    // WHOLE insert — which here would mean nobody can enrol in any class on any
    // environment that has not run the migration. Retried once without it, with
    // a log that names the migration, rather than turning a schema gap into a
    // total enrolment outage.
    let newEnrollment: { id: string } | null = null;
    let enrollErr: any = null;
    {
      const first = await admin
        .from('group_enrollments')
        .insert(enrolmentRow)
        .select('id')
        .single();

      if (!first.error) {
        newEnrollment = first.data as { id: string };
      } else {
        const missingSeatType =
          String(first.error.code) === 'PGRST204' ||
          String(first.error.code) === '42703' ||
          /seat_type/i.test(first.error.message ?? '');

        if (!missingSeatType) {
          enrollErr = first.error;
        } else {
          console.warn(
            '[subscribe] group_enrollments.seat_type absent — is migration 242 applied? ' +
              'Retrying without it; the seat kind will not be recorded.'
          );
          // Refuse rather than silently sell a physical seat the database cannot
          // record: seatCounts would never see it, so the room could oversell
          // without limit. An online seat is safe to record as before, because
          // that is what every row on such a database already is.
          if (requestedSeat === 'physical') {
            return {
              ok: false as const,
              status: 503,
              body: { error: 'In-person enrolment is not available yet. Please try online.' },
            };
          }
          const { seat_type: _dropped, ...withoutSeat } = enrolmentRow;
          const second = await admin
            .from('group_enrollments')
            .insert(withoutSeat)
            .select('id')
            .single();
          if (second.error) enrollErr = second.error;
          else newEnrollment = second.data as { id: string };
        }
      }
    }

    if (enrollErr || !newEnrollment) {
      console.error('[subscribe] Failed to create enrollment:', enrollErr);
      const detail = enrollErr ? (enrollErr.message || enrollErr.code || JSON.stringify(enrollErr)) : 'no row returned';
      return { ok: false as const, status: 500, body: { error: 'Failed to create enrollment', detail } };
    }
    enrollmentId = newEnrollment.id;
  } else if (continuingFromSecured) {
    // A SECURED row keeps its price until this payment actually succeeds —
    // activate_subscription syncs it then (migration 264).
    await admin
      .from('group_enrollments')
      .update({ pending_payment_expires_at: pendingExpiresAt })
      .eq('id', enrollmentId);
  } else {
    // A retried checkout is re-quoted above: the class price or its promotion
    // can change between the attempt that created this row and this one, and
    // every "Active — TT$X/mo" display reads plan_price_ttd.
    await admin
      .from('group_enrollments')
      .update({
        pending_payment_expires_at: pendingExpiresAt,
        plan_price_ttd: finalPrice,
        original_price_ttd: promotionData.originalPrice,
        discount_percent: promotionData.discountPercent,
        discounted_price_ttd: promotionData.discountPercent ? finalPrice : null,
        promotion_id: promotionData.promotionId,
        promotion_applied_at: promotionData.promotionAppliedAt,
        promotion_duration_days_snapshot: promotionData.promotionDurationDaysSnapshot,
        promotion_expires_at: promotionData.promotionExpiresAt,
      })
      .eq('id', enrollmentId);
  }

  // Auto-deactivate early-bird promotion if cap is now reached
  if (promotionData.promotionId) {
    const appliedPromo = promotions?.find((p: any) => p.id === promotionData.promotionId);
    if (appliedPromo?.kind === 'early-bird' && appliedPromo.student_cap) {
      const { count: newUsedCount } = await admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('promotion_id', promotionData.promotionId)
        .neq('status', 'ACTIVATION_FAILED');
      if ((newUsedCount ?? 0) >= appliedPromo.student_cap) {
        await admin
          .from('group_promotions')
          .update({ active: false })
          .eq('id', promotionData.promotionId);
      }
    }
  }

  // Step 11: group_members is created by activate_subscription after payment
  // completes. Do NOT create it here — doing so would grant access before
  // payment is confirmed and leave a stale member row if checkout is abandoned.

  // Step 12: Create pending subscription_payments row
  // If reusing enrollment, expire the previous pending payment row first
  if (isReusingEnrollment) {
    const { data: oldPayment } = await admin
      .from('subscription_payments')
      .select('id')
      .eq('enrollment_id', enrollmentId!)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (oldPayment) {
      await expireSubscriptionPayment(admin as any, oldPayment.id);
    }
  }

  const paymentRow = await createPendingSubscriptionPayment(admin as any, {
    enrollmentId: enrollmentId!,
    groupId,
    studentId,
    payerId,
    type: 'subscription_initial',
    amountTtd: finalPrice,
    originalAmountTtd: promotionData.originalPrice,
    discountPercent: promotionData.discountPercent,
    promotionId: promotionData.promotionId,
  });

  // Update enrollment with checkout_expires_at matching the payment row
  await admin
    .from('subscription_payments')
    .update({ checkout_expires_at: pendingExpiresAt })
    .eq('id', paymentRow.id);

  // Step 13: Create the Stripe PaymentIntent for this cycle.
  //
  // NOT a Stripe Subscription object: we own the recurring cycle
  // (group_enrollments.next_payment_due_at + the process-subscriptions
  // cron), so Stripe just charges each period, exactly like the 1:1 flow.
  const { grossAmount: grossFinalPrice, processingFee: subFee } =
    calculateGrossAmountForProvider(finalPrice, 'stripe');
  const amountCents = ttdToCents(grossFinalPrice);

  // Get student email for checkout
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', studentId)
    .single();

  const customerEmail = payerEmail;

  if (!customerEmail) {
    return { ok: false as const, status: 400, body: { error: 'Your account is missing an email address' } };
  }

  // Native Stripe Subscription: Stripe owns the cycle from here on —
  // it charges each month, retries failures and runs its own dunning.
  // Our process-subscriptions cron must therefore SKIP this enrollment,
  // which is what billing_provider='stripe' below signals.
  let subscription: Stripe.Subscription;
  try {
    const customerId = await ensureStripeCustomer(admin, payerId);
    const priceId = await ensureGroupPrice(admin, group as any);
    const cancelAt = endDateToCancelAt((group as any).end_date);

    const stripe = getStripeClient();

    // The recurring Price is the class's FULL price, shared by every
    // subscriber, so a promotion has to reach Stripe as a discount — without
    // one Stripe billed full price while checkout quoted and recorded the
    // discount. Sized against the Price's real unit_amount (a cached Price may
    // predate a fee-schedule change) so the invoice lands on amountCents
    // exactly. 'forever': a promotion price holds for the subscription's life.
    let discounts: Array<{ coupon: string }> | undefined;
    if (promotionData.promotionId) {
      const price = await stripe.prices.retrieve(priceId);
      const amountOff = (price.unit_amount ?? 0) - amountCents;
      if (amountOff > 0) {
        const coupon = await stripe.coupons.create(
          {
            amount_off: amountOff,
            currency: 'ttd',
            duration: 'forever',
            max_redemptions: 1,
            name: `${promotionData.discountPercent}% off`,
            metadata: {
              group_id: groupId,
              promotion_id: promotionData.promotionId,
              payment_id: paymentRow.id,
            },
          },
          { idempotencyKey: `promo-coupon-${paymentRow.id}` }
        );
        discounts = [{ coupon: coupon.id }];
      }
    }

    subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        ...(discounts ? { discounts } : {}),
        // Don't activate until the first invoice is actually paid; the
        // enrollment stays PENDING_PAYMENT until the webhook says so.
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        // NOT 'latest_invoice.payment_intent' — Stripe removed
        // Invoice.payment_intent in recent API versions (we pin
        // 2026-07-29.dahlia). That expand is accepted silently but
        // yields nothing, so the client secret came back undefined and
        // every subscribe attempt fell into the 502 below.
        // confirmation_secret is the replacement.
        expand: ['latest_invoice.confirmation_secret'],
        // Stops billing when the class ends, without a cron to cancel it.
        // The timestamp is rounded up to a whole-month boundary — see
        // endDateToCancelAt — because a mid-period cancel_at makes Stripe
        // bill a fraction of the month.
        ...(cancelAt ? { cancel_at: cancelAt } : {}),
        // Tutors are paid by the month, never a part month. Belt and braces
        // with the boundary rounding above: this switches off the proration
        // Stripe would otherwise create when a cancel lands inside a period.
        proration_behavior: 'none',
        // Stripe has no concept of "which class/tutor" — these are what
        // the webhook and the (deferred) pause/resume work key off.
        metadata: {
          kind: 'group_subscription',
          group_id: groupId,
          tutor_id: group.tutor_id,
          student_id: studentId,
          enrollment_id: enrollmentId!,
          payment_id: paymentRow.id,
          base_amount_ttd: String(finalPrice),
        },
      },
      { idempotencyKey: `subscribe-${paymentRow.id}` }
    );
  } catch (err) {
    const isApiError = err instanceof Stripe.errors.StripeError;
    console.error(
      '[subscribe] Stripe subscriptions.create failed:',
      isApiError ? { type: err.type, code: err.code, message: err.message } : err
    );
    return { ok: false as const, status: 502, body: { error: 'Failed to create checkout session' } };
  }

  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
  const clientSecret = (latestInvoice as any)?.confirmation_secret?.client_secret as
    | string
    | undefined;

  if (!clientSecret) {
    console.error(
      '[subscribe] Subscription created without a payable invoice',
      {
        subscription: subscription.id,
        status: subscription.status,
        invoice: latestInvoice?.id,
      }
    );
    return { ok: false as const, status: 502, body: { error: 'Failed to create checkout session' } };
  }

  // A client secret is `pi_XXX_secret_YYY`, so the PaymentIntent id is the
  // part before `_secret_`. Derived rather than fetched: Invoice no longer
  // exposes payment_intent, and this saves a round-trip.
  const intentId = clientSecret.split('_secret_')[0];

  await admin
    .from('subscription_payments')
    .update({
      stripe_payment_intent_id: intentId,
      stripe_subscription_id: subscription.id,
      stripe_invoice_id: latestInvoice?.id ?? null,
      charged_processing_fee_ttd: subFee,
    })
    .eq('id', paymentRow.id);

  // Mark the enrollment Stripe-billed so the self-managed dunning cron
  // leaves it alone. Set BEFORE the student pays: if they abandon
  // checkout the enrollment is still PENDING_PAYMENT and gets expired by
  // the normal seat-reservation task, which doesn't consult this flag.
  await admin
    .from('group_enrollments')
    .update({
      stripe_subscription_id: subscription.id,
      billing_provider: 'stripe',
    })
    .eq('id', enrollmentId!);

  // ── enrolment_started ──
  // Instrumented in this shared helper rather than in the two routes that call
  // it, so the student path and the parent-enrols-a-child path are counted by
  // the same line. Two call sites would drift, and a funnel that silently omits
  // parent enrolments would be worse than one that omits them visibly.
  //
  // Emitted here, at the end, because everything above can still refuse the
  // enrolment — full class, schedule clash, waitlist, Stripe failure. Those are
  // not abandoned checkouts and must not be counted as ones.
  //
  // Attributed to the STUDENT, matching `paid` (which uses sp.student_id): the
  // funnel follows the learner through, even when a parent holds the card.
  await track(
    PRODUCT_EVENTS.ENROLMENT_STARTED,
    { group_id: groupId },
    { userId: studentId }
  );

  // Step 14: Return the client secret. The enrollment stays PENDING_PAYMENT
  // until the webhook confirms — the client never activates it from
  // confirmPayment's result.
  return {
    ok: true as const,
    status: 201 as const,
    body: {
      checkout_url: `/payments/checkout?pi=${intentId}`,
      client_secret: clientSecret,
      payment_intent_id: intentId,
      enrollment_id: enrollmentId,
      payment_id: paymentRow.id,
      amount: finalPrice,
      processing_fee: subFee,
      total: grossFinalPrice,
      currency: 'TTD',
    },
  };
}
