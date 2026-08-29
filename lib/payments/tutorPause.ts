// Tutor-initiated class pause — the spec resolving §12.4.
//
// THE PRINCIPLE
// "A family pays for a quantity of teaching, not a block of calendar." When a
// tutor pauses, the teaching still arrives — the dates shift. Nothing is
// refunded and nothing is prorated: time already paid for and undelivered is
// added to the far end by moving the renewal date.
//
// Two decisions are load-bearing TOGETHER: billing extends rather than refunds,
// and seats are held. Release the seats and a returning family finds the class
// full, so the time they paid for has nowhere to happen. Do not revise one
// without the other.
//
// WHY NO MAXIMUM PAUSE LENGTH IS NEEDED
// pause_end is mandatory and auto-resume fires on it with no action from anyone.
// There is nothing to restart, so nobody needs authority to restart it, so a
// runaway pause is not reachable.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from './stripeClient';

/** Minimum notice before a pause starts, extends, or ends early. */
export const PAUSE_NOTICE_DAYS = 7;

/**
 * At or above this length the pause email carries a prominent cancel option.
 * With no platform cap on pause length, informed family choice is the substitute.
 */
export const LONG_PAUSE_WEEKS = 6;

const DAY_MS = 86_400_000;

export function pauseLengthDays(start: string | Date, end: string | Date): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / DAY_MS);
}

export function isLongPause(start: string | Date, end: string | Date): boolean {
  return pauseLengthDays(start, end) >= LONG_PAUSE_WEEKS * 7;
}

/** Has the caller given enough notice for a change taking effect at `when`? */
export function hasSufficientNotice(when: string | Date, now: Date = new Date()): boolean {
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) return false;
  return t - now.getTime() >= PAUSE_NOTICE_DAYS * DAY_MS;
}

/**
 * The renewal date after a pause.
 *
 * ALWAYS original + total pause days, never previous-adjusted + delta. Build
 * note: "Incremental adjustment accumulates drift across extensions." Three
 * extensions computed incrementally land days away from the truth, and the family
 * has been emailed each wrong date.
 */
export function computeAdjustedRenewal(params: {
  originalRenewal: string | Date;
  pauseStart: string | Date;
  pauseEnd: string | Date;
}): string {
  const base = new Date(params.originalRenewal).getTime();
  const days = pauseLengthDays(params.pauseStart, params.pauseEnd);
  return new Date(base + days * DAY_MS).toISOString();
}

/**
 * Undelivered time inside the period the family has already paid for.
 *
 * Informational — it is the justification for extending rather than refunding,
 * and the number support quotes when a parent asks what happened to their
 * December. It does NOT drive the renewal shift, which is the full pause length:
 * the family is owed the whole gap, not just the tail of one period.
 */
export function undeliveredDaysInPaidPeriod(params: {
  periodEnd: string | Date | null;
  pauseStart: string | Date;
}): number {
  if (!params.periodEnd) return 0;
  return pauseLengthDays(params.pauseStart, params.periodEnd);
}

// ---------------------------------------------------------------------------

export type TutorPauseOutcome =
  | { ok: true; affected: number; adjustedRenewalByEnrolment: Record<string, string | null> }
  | { ok: false; reason: string };

type EnrolmentRow = {
  id: string;
  student_id: string;
  status: string;
  cancelled_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  stripe_subscription_id: string | null;
  next_payment_due_at: string | null;
  current_period_end: string | null;
  original_renewal_date: string | null;
};

const COLUMNS =
  'id, student_id, status, cancelled_at, paused_at, pause_reason, stripe_subscription_id, next_payment_due_at, current_period_end, original_renewal_date' as const;

/** Families whose billing a class pause should touch. */
const BILLABLE_STATUSES = ['ACTIVE', 'GRACE'];

async function loadClassEnrolments(
  admin: SupabaseClient,
  groupId: string
): Promise<EnrolmentRow[]> {
  const { data } = await admin
    .from('group_enrollments')
    .select(COLUMNS)
    .eq('group_id', groupId)
    .in('status', BILLABLE_STATUSES)
    .is('cancelled_at', null)
    .limit(500);
  return (data ?? []) as unknown as EnrolmentRow[];
}

function renewalBaseline(row: EnrolmentRow): string | null {
  // On a fresh pause the current renewal becomes the baseline; on an extension
  // the stored original is kept, which is what makes recomputation drift-free.
  return row.original_renewal_date ?? row.next_payment_due_at ?? row.current_period_end ?? null;
}

/**
 * Schedules (announces) a tutor break across every billable family in a class.
 *
 * Seats close from ANNOUNCEMENT, not from pause start — build note: "enrolling
 * into a class that is about to stop is a poor first experience", and it removes
 * the fan-out race entirely, since no family can join between announcement and
 * start and miss the email.
 *
 * Stripe is NOT paused here. The pause is in the future; collection is suspended
 * when it actually begins (activateDuePauses), so a family's December charge on a
 * pause announced in November still goes through as they were told it would.
 */
export async function scheduleTutorPause(
  admin: SupabaseClient,
  params: {
    groupId: string;
    tutorId: string;
    pauseStart: string;
    pauseEnd: string;
    now?: Date;
  }
): Promise<TutorPauseOutcome> {
  const now = params.now ?? new Date();

  if (pauseLengthDays(params.pauseStart, params.pauseEnd) <= 0) {
    return { ok: false, reason: 'pause_end_must_be_after_start' };
  }
  if (!hasSufficientNotice(params.pauseStart, now)) {
    return { ok: false, reason: 'insufficient_notice' };
  }

  const enrolments = await loadClassEnrolments(admin, params.groupId);

  const adjusted: Record<string, string | null> = {};

  for (const row of enrolments) {
    const baseline = renewalBaseline(row);
    const adjustedRenewal = baseline
      ? computeAdjustedRenewal({
          originalRenewal: baseline,
          pauseStart: params.pauseStart,
          pauseEnd: params.pauseEnd,
        })
      : null;

    await admin
      .from('group_enrollments')
      .update({
        pause_reason: 'tutor_break',
        paused_by: params.tutorId,
        pause_start: params.pauseStart,
        pause_end: params.pauseEnd,
        original_renewal_date: baseline,
        adjusted_renewal_date: adjustedRenewal,
        // Cleared so the fan-out re-notifies for this announcement; extensions
        // and early resumes rely on the same reset.
        pause_notified_at: null,
      })
      .eq('id', row.id);

    adjusted[row.id] = adjustedRenewal;
  }

  // Seats held: new enrolment shut until the class comes back.
  await admin
    .from('groups')
    .update({ enrolment_closed_until: params.pauseEnd })
    .eq('id', params.groupId);

  return { ok: true, affected: enrolments.length, adjustedRenewalByEnrolment: adjusted };
}

/**
 * Extends a running or announced pause. Same 7 days' notice, because families
 * were given a resume date that is no longer true.
 */
export async function extendTutorPause(
  admin: SupabaseClient,
  params: { groupId: string; tutorId: string; newPauseEnd: string; now?: Date }
): Promise<TutorPauseOutcome> {
  const now = params.now ?? new Date();

  if (!hasSufficientNotice(params.newPauseEnd, now)) {
    return { ok: false, reason: 'insufficient_notice' };
  }

  const enrolments = await loadClassEnrolments(admin, params.groupId);
  const paused = enrolments.filter((r) => r.pause_reason === 'tutor_break');
  if (paused.length === 0) return { ok: false, reason: 'no_active_tutor_pause' };

  const adjusted: Record<string, string | null> = {};

  for (const row of paused) {
    const { data: current } = await admin
      .from('group_enrollments')
      .select('pause_start, original_renewal_date')
      .eq('id', row.id)
      .maybeSingle();

    const c = current as { pause_start: string | null; original_renewal_date: string | null } | null;
    if (!c?.pause_start) continue;

    if (new Date(params.newPauseEnd).getTime() <= new Date(c.pause_start).getTime()) {
      return { ok: false, reason: 'pause_end_must_be_after_start' };
    }

    // From the ORIGINAL, always. This is the line the build note is about.
    const adjustedRenewal = c.original_renewal_date
      ? computeAdjustedRenewal({
          originalRenewal: c.original_renewal_date,
          pauseStart: c.pause_start,
          pauseEnd: params.newPauseEnd,
        })
      : null;

    await admin
      .from('group_enrollments')
      .update({
        pause_end: params.newPauseEnd,
        adjusted_renewal_date: adjustedRenewal,
        pause_notified_at: null, // re-notify: the date they were told changed
      })
      .eq('id', row.id);

    adjusted[row.id] = adjustedRenewal;
  }

  await admin
    .from('groups')
    .update({ enrolment_closed_until: params.newPauseEnd })
    .eq('id', params.groupId);

  return { ok: true, affected: paused.length, adjustedRenewalByEnrolment: adjusted };
}

/**
 * Brings the class back sooner than advertised.
 *
 * Also requires notice: "billing restarting unannounced is its own complaint — a
 * family charged ahead of schedule has a legitimate grievance." So this only
 * moves pause_end; the actual resume happens on that date through the same
 * auto-resume path, after the email has gone out.
 */
export async function resumeTutorPauseEarly(
  admin: SupabaseClient,
  params: { groupId: string; tutorId: string; newResumeAt: string; now?: Date }
): Promise<TutorPauseOutcome> {
  const now = params.now ?? new Date();

  if (!hasSufficientNotice(params.newResumeAt, now)) {
    return { ok: false, reason: 'insufficient_notice' };
  }

  const enrolments = await loadClassEnrolments(admin, params.groupId);
  const paused = enrolments.filter((r) => r.pause_reason === 'tutor_break');
  if (paused.length === 0) return { ok: false, reason: 'no_active_tutor_pause' };

  const adjusted: Record<string, string | null> = {};

  for (const row of paused) {
    const { data: current } = await admin
      .from('group_enrollments')
      .select('pause_start, pause_end, original_renewal_date')
      .eq('id', row.id)
      .maybeSingle();

    const c = current as {
      pause_start: string | null;
      pause_end: string | null;
      original_renewal_date: string | null;
    } | null;
    if (!c?.pause_start || !c.pause_end) continue;

    if (new Date(params.newResumeAt).getTime() >= new Date(c.pause_end).getTime()) {
      return { ok: false, reason: 'not_earlier_than_current_end' };
    }

    // A shorter pause means a shorter extension: recomputed from the original so
    // the family is not credited days they are getting taught after all.
    const adjustedRenewal = c.original_renewal_date
      ? computeAdjustedRenewal({
          originalRenewal: c.original_renewal_date,
          pauseStart: c.pause_start,
          pauseEnd: params.newResumeAt,
        })
      : null;

    await admin
      .from('group_enrollments')
      .update({
        pause_end: params.newResumeAt,
        adjusted_renewal_date: adjustedRenewal,
        pause_notified_at: null,
      })
      .eq('id', row.id);

    adjusted[row.id] = adjustedRenewal;
  }

  await admin
    .from('groups')
    .update({ enrolment_closed_until: params.newResumeAt })
    .eq('id', params.groupId);

  return { ok: true, affected: paused.length, adjustedRenewalByEnrolment: adjusted };
}

// ---------------------------------------------------------------------------
// Cron: activation and auto-resume
// ---------------------------------------------------------------------------

/**
 * Suspends collection on pauses whose start date has arrived.
 *
 * Idempotent by the paused_at IS NULL filter: a retried job finds nothing to do
 * rather than pausing twice.
 */
export async function activateDuePauses(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ activated: number; failed: number }> {
  const { data } = await admin
    .from('group_enrollments')
    .select('id, stripe_subscription_id')
    .eq('pause_reason', 'tutor_break')
    .is('paused_at', null)
    .not('pause_start', 'is', null)
    .lte('pause_start', now.toISOString())
    .limit(500);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    stripe_subscription_id: string | null;
  }>;

  let activated = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.stripe_subscription_id) {
      try {
        const stripe = getStripeClient();
        await stripe.subscriptions.update(row.stripe_subscription_id, {
          // void, not keep_as_draft: a paused family must not return to arrears.
          pause_collection: { behavior: 'void' },
        });
      } catch (e) {
        // Log and carry on — one unreachable subscription must not stop the rest
        // of the class being paused.
        console.error(`[tutorPause] activate failed for ${row.id}:`, e);
        failed += 1;
        continue;
      }
    }

    await admin
      .from('group_enrollments')
      .update({ paused_at: now.toISOString() })
      .eq('id', row.id)
      .is('paused_at', null);

    activated += 1;
  }

  return { activated, failed };
}

/**
 * Resumes pauses whose end date has arrived. No action required from anyone —
 * this is why an open-ended tutor pause is forbidden and no cap is needed.
 *
 * Idempotent: the paused_at NOT NULL filter plus clearing the pause fields means
 * a retry finds nothing, so the renewal date cannot be double-adjusted.
 */
export async function resumeDuePauses(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ resumed: number; failed: number }> {
  const { data } = await admin
    .from('group_enrollments')
    .select('id, stripe_subscription_id, adjusted_renewal_date')
    .eq('pause_reason', 'tutor_break')
    .not('paused_at', 'is', null)
    .not('pause_end', 'is', null)
    .lte('pause_end', now.toISOString())
    .limit(500);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    stripe_subscription_id: string | null;
    adjusted_renewal_date: string | null;
  }>;

  let resumed = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.stripe_subscription_id) {
      try {
        const stripe = getStripeClient();
        const update: Record<string, unknown> = { pause_collection: null };

        // The anchor IS the extension. Without moving it the family would be
        // charged on the original date and the paused weeks would simply have
        // been taken from them.
        if (row.adjusted_renewal_date) {
          update.trial_end = Math.floor(new Date(row.adjusted_renewal_date).getTime() / 1000);
          update.proration_behavior = 'none';
        }

        await stripe.subscriptions.update(row.stripe_subscription_id, update);
      } catch (e) {
        console.error(`[tutorPause] resume failed for ${row.id}:`, e);
        failed += 1;
        continue;
      }
    }

    await admin
      .from('group_enrollments')
      .update({
        paused_at: null,
        pause_reason: null,
        pause_start: null,
        pause_end: null,
        resume_at: now.toISOString(),
        // next_payment_due_at follows the adjustment so our own billing paths
        // agree with Stripe's anchor.
        ...(row.adjusted_renewal_date
          ? { next_payment_due_at: row.adjusted_renewal_date }
          : {}),
      })
      .eq('id', row.id)
      .not('paused_at', 'is', null);

    resumed += 1;
  }

  return { resumed, failed };
}
