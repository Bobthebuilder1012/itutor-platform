// Payer-initiated subscription pause / resume / cancel — handover §10.7.
//
// SCOPE, STATED UP FRONT
// Only pause_reason 'payer_request' is implemented here. Tutor-initiated pause
// ('tutor_break') is NOT, because §12.4 leaves three things undecided — whether
// it halts billing for every enrolled family at once, what happens to seats, and
// who may trigger it — and a separate scoped spec for it was deferred by the
// product owner. Either would be reason enough on its own; guessing would change
// other families' billing.
//
// THE ORDER OF OPERATIONS IS THE WHOLE SAFETY PROPERTY
// Provider first, database second, always. If Stripe accepts the pause and our
// write then fails, we bill nobody and our row looks active — recoverable, and
// visible on the next reconciliation. If we wrote first and Stripe then refused,
// a parent would be told they had paused while the money kept leaving their
// account. Those two failures are not equivalent, so the order is not arbitrary.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from './stripeClient';

export type PauseOutcome =
  | { ok: true; alreadyInState?: boolean }
  | { ok: false; reason: string };

type EnrolmentRow = {
  id: string;
  student_id: string;
  group_id: string;
  status: string;
  paused_at: string | null;
  cancelled_at: string | null;
  stripe_subscription_id: string | null;
  billing_provider: string | null;
};

const ENROLMENT_COLUMNS =
  'id, student_id, group_id, status, paused_at, cancelled_at, stripe_subscription_id, billing_provider' as const;

export async function loadEnrolment(
  admin: SupabaseClient,
  enrolmentId: string
): Promise<EnrolmentRow | null> {
  const { data } = await admin
    .from('group_enrollments')
    .select(ENROLMENT_COLUMNS)
    .eq('id', enrolmentId)
    .maybeSingle();
  return (data as unknown as EnrolmentRow) ?? null;
}

/**
 * Pauses billing while keeping the place.
 *
 * behavior: 'void' is what §10.7 specifies. It means invoices raised during the
 * pause are voided rather than accumulated, so a parent who pauses for two months
 * does not come back to two months of arrears — which is what 'keep_as_draft'
 * would have done, and would have made "pause" a deferral rather than a pause.
 */
export async function pauseSubscription(
  admin: SupabaseClient,
  params: { enrolmentId: string; actorId: string; resumeAt?: string | null }
): Promise<PauseOutcome> {
  const enrolment = await loadEnrolment(admin, params.enrolmentId);
  if (!enrolment) return { ok: false, reason: 'not_found' };
  if (enrolment.cancelled_at) return { ok: false, reason: 'already_cancelled' };
  if (enrolment.paused_at) return { ok: true, alreadyInState: true };

  // Provider first.
  if (enrolment.stripe_subscription_id) {
    try {
      const stripe = getStripeClient();
      await stripe.subscriptions.update(enrolment.stripe_subscription_id, {
        pause_collection: { behavior: 'void' },
      });
    } catch (e) {
      // Nothing written: our row still says active and billing continues, which
      // is the honest state. Better than a row that claims paused.
      return { ok: false, reason: e instanceof Error ? e.message : 'stripe_pause_failed' };
    }
  }
  // A subscription with no Stripe id is either LuniPay-era or was never
  // materialised. paused_at still stops OUR charging paths, which is the only
  // lever available for those, so the pause is recorded rather than refused.

  const { error } = await admin
    .from('group_enrollments')
    .update({
      paused_at: new Date().toISOString(),
      paused_by: params.actorId,
      pause_reason: 'payer_request',
      resume_at: params.resumeAt ?? null,
    })
    .eq('id', params.enrolmentId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Resumes billing.
 *
 * Deliberately does NOT reset the billing anchor. Resetting it would move the
 * charge date to today, which reads as "billed a month after you come back" but
 * permanently shifts that family's billing date — repeated pauses walk it around
 * the calendar and make billing-date reporting meaningless. Keeping the anchor
 * means the next charge lands on the original date, and any period already paid
 * for is not re-charged.
 */
export async function resumeSubscription(
  admin: SupabaseClient,
  params: { enrolmentId: string }
): Promise<PauseOutcome> {
  const enrolment = await loadEnrolment(admin, params.enrolmentId);
  if (!enrolment) return { ok: false, reason: 'not_found' };
  if (enrolment.cancelled_at) return { ok: false, reason: 'already_cancelled' };
  if (!enrolment.paused_at) return { ok: true, alreadyInState: true };

  if (enrolment.stripe_subscription_id) {
    try {
      const stripe = getStripeClient();
      await stripe.subscriptions.update(enrolment.stripe_subscription_id, {
        // Clearing the field is how Stripe un-pauses; there is no explicit
        // "resume" verb.
        pause_collection: null,
      });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'stripe_resume_failed' };
    }
  }

  const { error } = await admin
    .from('group_enrollments')
    .update({ paused_at: null, paused_by: null, pause_reason: null, resume_at: null })
    .eq('id', params.enrolmentId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Cancels at period end, keeping the row restartable (§10.7).
 *
 * At period end rather than immediately, because the family has paid for the
 * current month and taking the class away mid-period would be charging for
 * something withdrawn. The reason is stored verbatim.
 */
export async function cancelSubscription(
  admin: SupabaseClient,
  params: { enrolmentId: string; actorId: string; reason?: string | null }
): Promise<PauseOutcome> {
  const enrolment = await loadEnrolment(admin, params.enrolmentId);
  if (!enrolment) return { ok: false, reason: 'not_found' };
  if (enrolment.cancelled_at) return { ok: true, alreadyInState: true };

  if (enrolment.stripe_subscription_id) {
    try {
      const stripe = getStripeClient();
      await stripe.subscriptions.update(enrolment.stripe_subscription_id, {
        cancel_at_period_end: true,
        // Un-pause on the way out: a cancellation scheduled on a paused
        // subscription would otherwise sit paused forever and never reach its
        // period end, so it would never actually cancel.
        ...(enrolment.paused_at ? { pause_collection: null } : {}),
      });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'stripe_cancel_failed' };
    }
  }

  const { error } = await admin
    .from('group_enrollments')
    .update({
      cancel_at_period_end: true,
      cancellation_reason: params.reason?.slice(0, 500) ?? null,
      // cancelled_at stays NULL until the period actually ends — the row is
      // scheduled to cancel, not cancelled, and §10.7 wants it restartable.
      paused_at: null,
      paused_by: null,
      pause_reason: null,
      resume_at: null,
    })
    .eq('id', params.enrolmentId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Undoes a scheduled cancellation. §10.7: "Cancelled rows stay restartable."
 */
export async function restartSubscription(
  admin: SupabaseClient,
  params: { enrolmentId: string }
): Promise<PauseOutcome> {
  const enrolment = await loadEnrolment(admin, params.enrolmentId);
  if (!enrolment) return { ok: false, reason: 'not_found' };

  if (enrolment.stripe_subscription_id) {
    try {
      const stripe = getStripeClient();
      await stripe.subscriptions.update(enrolment.stripe_subscription_id, {
        cancel_at_period_end: false,
      });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'stripe_restart_failed' };
    }
  }

  const { error } = await admin
    .from('group_enrollments')
    .update({ cancel_at_period_end: false, cancellation_reason: null })
    .eq('id', params.enrolmentId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
