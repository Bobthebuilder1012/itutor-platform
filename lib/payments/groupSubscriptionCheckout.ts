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
import { findGroupEnrollmentConflict, conflictMessage } from '@/lib/services/scheduleConflict';
import { track } from '@/lib/analytics/track';
import { isPaidGroup } from '@/lib/payments/groupPricing';
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
}): Promise<CheckoutOutcome> {
  const { admin, groupId, studentId, payerId, payerEmail } = params;

  // Step 2: Group must exist and be PUBLISHED
  const { data: group, error: groupErr } = await admin
    .from('groups')
    .select(`
      id, tutor_id, name, status, pricing_model, price_monthly,
      max_students, grace_period_days, require_join_requests,
      visibility, archived_at,
      end_date, stripe_price_id, stripe_price_amount_ttd
    `)
    .eq('id', groupId)
    .is('archived_at', null)
    .single();

  if (groupErr || !group) {
    return { ok: false as const, status: 404, body: { error: 'Group not found' } };
  }
  if (group.status !== 'PUBLISHED') {
    return { ok: false as const, status: 404, body: { error: 'Group is not available for enrollment' } };
  }

  // Step 3: Must be a MONTHLY group with a price
  if (!isPaidGroup(group)) {
    return { ok: false as const, status: 400, body: { error: 'This group does not have a monthly subscription' } };
  }

  // Tutor cannot subscribe to their own group
  if (group.tutor_id === studentId) {
    return { ok: false as const, status: 403, body: { error: 'Tutor cannot subscribe to their own group' } };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { ok: false as const, status: 503, body: { error: 'Payments are not configured' } };
  }

  // Gate on the provider this route actually uses. This checked
  // LUNIPAY_SECRET_KEY, which would have refused Stripe subscriptions on
  // any environment where the (now unused) LuniPay key was absent.
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false as const, status: 503, body: { error: 'Payment processing is not available on this environment' } };
  }

  // Step 4: Visibility check
  let memberRow: { id: string; status: string } | null = null;
  if (group.visibility === 'private' || group.require_join_requests) {
    const { data: existing } = await admin
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', studentId)
      .maybeSingle();
    memberRow = existing ?? null;
  }

  if (group.visibility === 'private') {
    if (!memberRow || !['invited', 'approved'].includes(memberRow.status)) {
      return { ok: false as const, status: 403, body: { error: 'This group is by invitation only' } };
    }
  }

  // Step 5: Approval check
  if (group.require_join_requests) {
    if (!memberRow) {
      return { ok: false as const, status: 403, body: { error: 'Request to join before subscribing' } };
    }
    if (memberRow.status === 'pending') {
      return { ok: false as const, status: 409, body: { error: 'Your join request is pending tutor approval' } };
    }
    if (memberRow.status === 'denied') {
      return { ok: false as const, status: 403, body: { error: 'Your join request was not approved' } };
    }
  }

  // Step 6: Reject duplicate non-cancelled active subscription
  const { data: activeEnrollment } = await admin
    .from('group_enrollments')
    .select('id, status, payment_status')
    .eq('group_id', groupId)
    .eq('student_id', studentId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'])
    .maybeSingle();

  // A SECURED enrolment is the one case where "you already have an
  // enrolment" is not a reason to refuse: this IS the month-one prompt
  // being taken up. The student paid for their first month up front and is
  // now choosing to continue, so the existing row is converted rather than
  // duplicated — a second row would trip the unique index on
  // (student_id, group_id) anyway.
  const continuingFromSecured = activeEnrollment?.status === 'SECURED';

  if (activeEnrollment && !continuingFromSecured) {
    return { ok: false as const, status: 409, body: {
      error: 'You already have an active subscription for this group',
      enrollment_id: activeEnrollment.id,
      status: activeEnrollment.status,
    } };
  }

  // Step 6b: Child schedule conflict — the student's own upcoming schedule
  // (1:1 + group) vs this class's occurrences. Block before creating a checkout.
  const conflict = await findGroupEnrollmentConflict(admin, studentId, groupId);
  if (conflict) {
    return { ok: false as const, status: 409, body: { error: conflictMessage(conflict) } };
  }

  const now = new Date();

  // Step 7: Duplicate pending checkout — reuse existing non-expired PENDING_PAYMENT enrollment
  const { data: pendingEnrollment } = await admin
    .from('group_enrollments')
    .select('id, pending_payment_expires_at')
    .eq('group_id', groupId)
    .eq('student_id', studentId)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .eq('status', 'PENDING_PAYMENT')
    .maybeSingle();

  let enrollmentId: string | null = null;
  let isReusingEnrollment = false;

  // Always reuse any existing PENDING_PAYMENT enrollment regardless of expiry.
  // Inserting a new row would violate the unique index on (student_id, group_id)
  // for non-cancelled subscriptions. The expiry and checkout session are refreshed below.
  if (pendingEnrollment) {
    enrollmentId = pendingEnrollment.id;
    isReusingEnrollment = true;
  } else if (continuingFromSecured && activeEnrollment) {
    // Converting a held spot into a subscription. Reused, and treated as an
    // existing enrolment for the capacity check below — the student is
    // already occupying this seat, so counting them against capacity would
    // refuse them their own place in a full class.
    enrollmentId = activeEnrollment.id;
    isReusingEnrollment = true;
  }

  // Step 8: Capacity check (only for new enrollments)
  if (!isReusingEnrollment) {
    if (group.max_students) {
      const nowIso = now.toISOString();

      const { count: occupiedCount } = await admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('enrollment_type', 'SUBSCRIPTION')
        .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED']);

      const { count: pendingCount } = await admin
        .from('group_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('enrollment_type', 'SUBSCRIPTION')
        .eq('status', 'PENDING_PAYMENT')
        .gt('pending_payment_expires_at', nowIso);

      const { count: offeredCount } = await admin
        .from('group_waitlist_entries')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('status', 'offered')
        .gt('offer_expires_at', nowIso);

      const used = (occupiedCount ?? 0) + (pendingCount ?? 0) + (offeredCount ?? 0);

      if (used >= group.max_students) {
        // Check for existing waitlist entry
        const { data: waitlistEntry } = await admin
          .from('group_waitlist_entries')
          .select('id, position, status')
          .eq('group_id', groupId)
          .eq('student_id', studentId)
          .in('status', ['waiting', 'offered'])
          .maybeSingle();

        if (!waitlistEntry) {
          // Get position (count of waiting entries + 1)
          const { count: waitingCount } = await admin
            .from('group_waitlist_entries')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('status', 'waiting');

          const position = (waitingCount ?? 0) + 1;

          await admin.from('group_waitlist_entries').insert({
            group_id: groupId,
            student_id: studentId,
            position,
            status: 'waiting',
          });

          return { ok: false as const, status: 202, body: { waitlisted: true, position } };
        }

        return { ok: false as const, status: 202, body: {
          waitlisted: true,
          position: waitlistEntry.position,
          status: waitlistEntry.status,
        } };
      }
    }
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
  if (!isReusingEnrollment) {
    // This runs on the ADMIN client, so RLS does not scope it — the filter has
    // to be explicit here. A personal coupon (migration 231) belongs to one
    // buyer; without `user_id`, one coupon row would discount this class for
    // everyone who checks out. `user_id IS NULL` is a group-wide promotion,
    // which is every row created before 231.
    const nowIso = new Date().toISOString();
    const { data: promoRows } = await admin
      .from('group_promotions')
      .select('id, kind, discount, student_cap, duration_days, user_id, expires_at, price_duration_months')
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
          // Count how many subscribers have used this promotion
          const { count: usedCount } = await admin
            .from('group_enrollments')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('promotion_id', promo.id)
            .neq('status', 'ACTIVATION_FAILED');

          if ((usedCount ?? 0) >= promo.student_cap) {
            applicable = false;
          }
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
    const { data: newEnrollment, error: enrollErr } = await admin
      .from('group_enrollments')
      .insert({
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
        current_period_start: null,
        current_period_end: null,
        next_payment_due_at: null,
        grace_period_ends_at: null,
        grace_period_days_snapshot: null,
        cancel_at_period_end: false,
        pending_payment_expires_at: pendingExpiresAt,
        reminder_count: 0,
        last_reminder_sent_at: null,
      })
      .select('id')
      .single();

    if (enrollErr || !newEnrollment) {
      console.error('[subscribe] Failed to create enrollment:', enrollErr);
      const detail = enrollErr ? (enrollErr.message || enrollErr.code || JSON.stringify(enrollErr)) : 'no row returned';
      return { ok: false as const, status: 500, body: { error: 'Failed to create enrollment', detail } };
    }
    enrollmentId = newEnrollment.id;

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
  } else {
    // Refresh expiry on existing PENDING_PAYMENT enrollment
    await admin
      .from('group_enrollments')
      .update({ pending_payment_expires_at: pendingExpiresAt })
      .eq('id', enrollmentId);
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
    subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
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
