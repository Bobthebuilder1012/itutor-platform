// =====================================================
// Secure your spot — confirmation.
//
// Called from the Stripe webhook when a securing payment succeeds.
// Modelled on handleSubscriptionPayment: the webhook branch stays thin,
// the logic lives here, and the caller distinguishes transient failures
// (retry) from terminal ones (dedupe and move on).
//
// The webhook is the only writer of payment state. Nothing here is ever
// driven by the browser's confirmPayment result.
// =====================================================

import { type SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { sendEmail } from '@/lib/services/emailService';
import { renderEmail } from '@/lib/email/design';
import {
  computeReleaseDate,
  firstUpcomingSession,
  preorderEligibility,
  preorderReasonMessage,
} from '@/lib/payments/secureSpot';
import type { SessionPattern } from '@/lib/utils/scheduleFormat';
import { trackForUser } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';

export interface ConfirmSecuredSpotParams {
  admin: SupabaseClient;
  enrollmentId: string;
  stripePaymentIntentId: string;
  source?: 'webhook' | 'manual';
}

export interface ConfirmSecuredSpotResult {
  ok: boolean;
  idempotent?: boolean;
  enrollmentId?: string;
  releaseDate?: string | null;
  refunded?: boolean;
  /** Set when the caller should let Stripe retry rather than dedupe. */
  transient?: boolean;
  error?: string;
}

const SESSION_COLUMNS =
  'recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on';

/**
 * May this class open preorders?
 *
 * Shared by both settings routes so the rule is enforced once. This is the
 * flag that lets a class take money before it has taught anything, so it is
 * never taken on the client's word — and "no schedule" is refused outright,
 * because a payment CTA next to "schedule to be confirmed" is indefensible in
 * a dispute.
 */
export async function canOpenPreorders(
  admin: SupabaseClient,
  groupId: string
): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  const { data: sessions, error } = await admin
    .from('group_sessions')
    .select(SESSION_COLUMNS)
    .eq('group_id', groupId);

  if (error) {
    return { ok: false, reason: 'lookup_failed', message: 'Could not read the class schedule.' };
  }

  const eligibility = preorderEligibility((sessions ?? []) as SessionPattern[]);
  if (eligibility.eligible) return { ok: true };

  return { ok: false, reason: eligibility.reason, message: preorderReasonMessage(eligibility.reason) };
}

/**
 * Turn a paid securing charge into a held seat.
 *
 * The class start is read from the schedule at confirmation time and the
 * release date is computed from it ONCE, here, then stored. It is never
 * recomputed later from groups.end_date: a tutor who kept extending the class
 * would otherwise never be paid, and one who shortened it would be paid for a
 * month they had not taught.
 */
export async function confirmSecuredSpot(
  params: ConfirmSecuredSpotParams
): Promise<ConfirmSecuredSpotResult> {
  const { admin, enrollmentId, stripePaymentIntentId } = params;

  const { data: enrollment, error: enrErr } = await admin
    .from('group_enrollments')
    // plan_price_ttd is read only so the `paid` event below can carry an
    // amount. It is what secure_spot_claim wrote as the securing charge.
    .select('id, group_id, student_id, status, plan_price_ttd')
    .eq('id', enrollmentId)
    .maybeSingle();

  if (enrErr) return { ok: false, transient: true, error: `rpc_failed: ${enrErr.message}` };
  if (!enrollment) return { ok: false, error: 'enrollment_not_found' };

  // Already secured by an earlier delivery of the same event.
  if ((enrollment as any).status === 'SECURED') {
    return { ok: true, idempotent: true, enrollmentId };
  }

  const { data: group, error: grpErr } = await admin
    .from('groups')
    .select('id, name, tutor_id, end_date')
    .eq('id', (enrollment as any).group_id)
    .maybeSingle();

  if (grpErr) return { ok: false, transient: true, error: `rpc_failed: ${grpErr.message}` };
  if (!group) return { ok: false, error: 'group_not_found' };

  const { data: sessions, error: sesErr } = await admin
    .from('group_sessions')
    .select(SESSION_COLUMNS)
    .eq('group_id', (enrollment as any).group_id);

  if (sesErr) return { ok: false, transient: true, error: `rpc_failed: ${sesErr.message}` };

  // A class that lost its schedule between checkout and payment cannot be
  // dated, and money we cannot date is money we must not hold. Refund.
  const firstSession = firstUpcomingSession((sessions ?? []) as SessionPattern[]);
  if (!firstSession) {
    const refunded = await refundSecuringCharge(stripePaymentIntentId);
    await releaseClaim(admin, enrollmentId, 'schedule_removed');
    return { ok: false, error: 'no_schedule', refunded };
  }

  const releaseDate = computeReleaseDate({
    firstSession,
    endDate: (group as any).end_date ?? null,
  });

  const { data: rpc, error: rpcErr } = await (admin as any).rpc('secure_spot_confirm', {
    p_payload: {
      enrollment_id: enrollmentId,
      payment_intent_id: stripePaymentIntentId,
      release_date: releaseDate,
      period_start: firstSession.toISOString(),
      period_end: `${releaseDate}T23:59:59.000Z`,
    },
  });

  // Transient: let Stripe retry rather than leaving a paid student unseated.
  if (rpcErr) return { ok: false, transient: true, error: `rpc_failed: ${rpcErr.message}` };

  if (rpc?.ok === false && rpc?.reason === 'oversubscribed') {
    // Both students passed the claim check and both paid. The later webhook
    // loses the seat and gets their money back automatically — overfilling
    // the class or keeping the money would both be worse.
    const refunded = await refundSecuringCharge(stripePaymentIntentId);
    await releaseClaim(admin, enrollmentId, 'oversubscribed');
    return { ok: false, error: 'oversubscribed', refunded, enrollmentId };
  }

  if (rpc?.ok === false) {
    return { ok: false, error: String(rpc?.reason ?? 'confirm_failed'), enrollmentId };
  }

  // Only on the transition, never on a replay — Stripe redelivers, and a
  // second delivery must not email the tutor a second student who doesn't
  // exist.
  if (rpc?.idempotent !== true) {
    await notifySpotSecured({
      admin,
      enrollmentId,
      group: group as any,
      studentId: (enrollment as any).student_id,
      releaseDate,
      firstSession,
    });

    // ── paid ──
    // A secured spot IS a payment — the student's card is charged for the first
    // month up front. Leaving it out of the revenue event would make the whole
    // preorder cohort look like it converted for free, and preorders are
    // currently the only path taking real money on production.
    //
    // Inside the transition guard for the same reason the email is: Stripe
    // redelivers. The payment-intent id is also passed as the dedupe key, so the
    // count survives a future refactor that moves this line outside the guard.
    await trackForUser(
      PRODUCT_EVENTS.PAID,
      {
        group_id: (enrollment as any).group_id,
        amount: Number((enrollment as any).plan_price_ttd) || 0,
      },
      { userId: (enrollment as any).student_id, dedupeKey: `pi:${stripePaymentIntentId}` }
    );
  }

  return {
    ok: true,
    idempotent: rpc?.idempotent === true,
    enrollmentId,
    releaseDate,
  };
}

/**
 * Tells both sides a spot has been secured.
 *
 * The tutor gets told explicitly WHEN the money reaches them, because this is
 * the one thing about secured spots that differs from every other enrolment
 * they have ever had: a student has paid and the tutor has not. The generic
 * "new student enrolled" email would imply the money is on its way.
 *
 * Fully non-fatal. The seat is secured and the money is taken by the time this
 * runs; a bounced email must never turn that into a webhook failure, because
 * Stripe would redeliver and the student would be processed twice.
 */
export async function notifySpotSecured(args: {
  admin: SupabaseClient;
  enrollmentId: string;
  group: { id: string; name: string | null; tutor_id: string | null };
  studentId: string;
  releaseDate: string | null;
  firstSession: Date;
}): Promise<void> {
  const { admin, enrollmentId, group, studentId, releaseDate, firstSession } = args;

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const className = group.name ?? 'your class';

    const [{ data: student }, { data: tutor }, { data: payment }] = await Promise.all([
      admin.from('profiles').select('full_name, email').eq('id', studentId).maybeSingle(),
      group.tutor_id
        ? admin.from('profiles').select('full_name, email').eq('id', group.tutor_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      admin
        .from('subscription_payments')
        .select('amount_ttd, tutor_payout_ttd')
        .eq('enrollment_id', enrollmentId)
        .eq('type', 'secure_spot')
        .maybeSingle(),
    ]);

    const studentName = (student as any)?.full_name ?? 'A student';
    const paidTtd = Number((payment as any)?.amount_ttd ?? 0);
    const heldTtd = Number((payment as any)?.tutor_payout_ttd ?? 0);
    const isFree = paidTtd <= 0;

    const fmt = (iso: string | Date) =>
      (iso instanceof Date ? iso : new Date(`${iso}T00:00:00`)).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      });
    const releaseLabel = releaseDate ? fmt(releaseDate) : null;

    // ---- Tutor ----
    if ((tutor as any)?.email) {
      // Family 05 — "tutor booking notice", which is what this is. The payout
      // terms are a detail panel rather than a paragraph: a teacher's question
      // is always how much and when, and both were previously bold words in the
      // middle of a sentence.
      const email = renderEmail({
        family: 'booking-confirmation',
        subject: `${studentName} secured a spot in ${className}`,
        heading: 'A spot has been secured',
        intro: `Hi ${(tutor as any).full_name ?? 'there'}, you have a new student.`,
        eyebrow: 'Spot secured',
        blocks: [
          {
            kind: 'details',
            rows: [
              { label: 'Student', value: studentName, strong: true },
              { label: 'Class', value: className },
              { label: 'Starts', value: fmt(firstSession) },
            ],
          },
          ...(isFree
            ? [
                {
                  kind: 'paragraph' as const,
                  text: "This is a free class, so there's no payment involved — the place is simply reserved.",
                },
              ]
            : [
                {
                  kind: 'details' as const,
                  title: "When you'll be paid",
                  tone: 'neutral' as const,
                  rows: [
                    { label: 'Held by iTutor', value: `TT$${heldTtd.toFixed(2)}`, strong: true },
                    ...(releaseLabel
                      ? [{ label: 'Released after', value: releaseLabel }]
                      : [{ label: 'Released after', value: 'the first month is taught' }]),
                  ],
                },
                {
                  kind: 'paragraph' as const,
                  text: `${studentName} paid for their first month up front. It is released with your next payout after that date, as long as the class runs as scheduled.`,
                },
              ]),
        ],
        cta: { label: 'View your class roster', href: `${appUrl}/tutor/classes/${group.id}` },
      });
      await sendEmail({
        to: (tutor as any).email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }

    if (group.tutor_id) {
      await admin.from('notifications').insert({
        user_id: group.tutor_id,
        type: 'new_class_member',
        title: 'Spot secured',
        message: isFree
          ? `${studentName} reserved a place in ${className}.`
          : `${studentName} secured a spot in ${className}. TT$${heldTtd.toFixed(2)} is held until${releaseLabel ? ` ${releaseLabel}` : ' the first month is taught'}.`,
        group_id: group.id,
        metadata: { groupId: group.id, enrollmentId, heldTtd, releaseDate },
      });
    }

    // ---- Student ----
    if ((student as any)?.email) {
      const email = renderEmail({
        family: 'booking-confirmation',
        subject: `Your spot in ${className} is secured`,
        heading: 'Your spot is secured',
        intro: `Hi ${(student as any).full_name ?? 'there'}, your place is reserved.`,
        eyebrow: 'Spot secured',
        blocks: [
          {
            kind: 'details',
            rows: [
              { label: 'Class', value: className, strong: true },
              { label: 'Classes start', value: fmt(firstSession) },
              ...(isFree
                ? [{ label: 'Cost', value: 'Free' }]
                : [{ label: 'Paid for the first month', value: `TT$${paidTtd.toFixed(2)}` }]),
            ],
          },
          ...(isFree
            ? [{ kind: 'paragraph' as const, text: "This class is free — there's nothing to pay." }]
            : [
                {
                  kind: 'notice' as const,
                  title: 'Your payment is held until the class has been taught',
                  body: "If the tutor cancels the class before it starts, you'll be refunded automatically.",
                },
                // The strongest sentence in this email. A family who thinks a
                // second month is coming out automatically will not preorder
                // again, so it gets its own panel rather than a clause.
                ...(releaseLabel
                  ? [
                      {
                        kind: 'notice' as const,
                        tone: 'neutral' as const,
                        title: `Your first month runs until ${releaseLabel}`,
                        body: "We'll ask before then whether you'd like to continue. Nothing is charged automatically.",
                      },
                    ]
                  : []),
              ]),
        ],
        cta: { label: 'View your class', href: `${appUrl}/student/explore/${group.id}` },
      });
      await sendEmail({
        to: (student as any).email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    }

    await admin.from('notifications').insert({
      user_id: studentId,
      type: 'spot_secured',
      title: 'Your spot is secured',
      message: `Your place in ${className} is reserved. Classes start ${fmt(firstSession)}.`,
      group_id: group.id,
      metadata: { groupId: group.id, enrollmentId, releaseDate },
    });
  } catch (err) {
    console.error('[secureSpot] notifications failed (non-fatal):', (err as Error)?.message);
  }
}

/**
 * Refund every secured spot in a class, because the class is going away.
 *
 * The deal a student accepted was "your money is held until the first month is
 * taught, and if the tutor cancels before it starts you're refunded
 * automatically". This is the code that keeps the second half of that promise,
 * so it is called from every path that archives or deletes a class rather than
 * from one of them.
 *
 * Best-effort per student and never throws: one card that refuses a refund
 * must not stop the other students being refunded, or block the deletion the
 * tutor asked for. Failures are logged loudly and left in the ledger as
 * 'owed' so they surface rather than vanish.
 */
export async function refundSecuredSpotsForClass(
  admin: SupabaseClient,
  groupId: string,
  reason: string
): Promise<{ refunded: number; failed: number }> {
  const out = { refunded: 0, failed: 0 };

  const { data: secured, error } = await admin
    .from('group_enrollments')
    .select('id, student_id, secure_payment_intent_id')
    .eq('group_id', groupId)
    .eq('status', 'SECURED');

  if (error || !secured?.length) return out;

  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .maybeSingle();

  for (const enrolment of secured) {
    const pi = (enrolment as any).secure_payment_intent_id as string | null;
    let refunded = true;

    // A free reservation has no payment intent — there is nothing to refund,
    // but the seat and the enrolment still have to be closed out.
    if (pi) refunded = await refundSecuringCharge(pi);

    await releaseClaim(admin, (enrolment as any).id, reason);

    // Reverse the tutor's held money. It was never theirs to keep: they are
    // not teaching the class.
    const { data: payment } = await admin
      .from('subscription_payments')
      .select('id, tutor_payout_ttd')
      .eq('enrollment_id', (enrolment as any).id)
      .eq('type', 'secure_spot')
      .maybeSingle();

    if (payment?.id) {
      await admin
        .from('payout_ledger')
        .update({ status: 'reversed', updated_at: new Date().toISOString() })
        .eq('subscription_payment_id', payment.id)
        .eq('status', 'owed');
    }

    await admin.from('notifications').insert({
      user_id: (enrolment as any).student_id,
      type: 'secure_spot_refunded',
      title: 'Your reserved place has been refunded',
      message: `${group?.name ?? 'A class'} was cancelled before it started, so your payment has been refunded in full.`,
      group_id: groupId,
      metadata: { groupId, enrollmentId: (enrolment as any).id, reason },
    });

    if (refunded) out.refunded += 1;
    else out.failed += 1;
  }

  if (out.failed > 0) {
    console.error('[secureSpot] some refunds failed and need manual attention', {
      groupId, ...out,
    });
  }
  return out;
}

/**
 * Refund a securing charge in full.
 *
 * Returns false rather than throwing: a failed refund must not stop us from
 * releasing the seat and recording the outcome, or the student ends up with
 * neither a seat nor a refund and no record of either.
 */
async function refundSecuringCharge(paymentIntentId: string): Promise<boolean> {
  try {
    const stripe = getStripeClient();
    await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `secure-refund-${paymentIntentId}` }
    );
    return true;
  } catch (err) {
    console.error('[secureSpot] refund failed — needs manual attention', {
      paymentIntentId,
      error: (err as Error)?.message,
    });
    return false;
  }
}

/** Give the seat back and mark the payment refunded. Never leaves it SECURED. */
async function releaseClaim(admin: SupabaseClient, enrollmentId: string, reason: string) {
  await admin
    .from('group_enrollments')
    .update({
      status: 'CANCELLED',
      payment_status: 'REFUNDED',
      pending_payment_expires_at: null,
      cancelled_at: new Date().toISOString(),
      removal_reason: reason,
    })
    .eq('id', enrollmentId);

  await admin
    .from('subscription_payments')
    .update({ status: 'REFUNDED', refunded_at: new Date().toISOString() })
    .eq('enrollment_id', enrollmentId)
    .eq('type', 'secure_spot');
}
