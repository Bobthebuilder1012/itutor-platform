/**
 * Row types for the Class Match Week tables (migration 232).
 *
 * Hand-written rather than generated, matching the rest of `lib/types` — the
 * Supabase clients in this repo are not typed with a `Database` generic, so
 * these describe rows for call sites rather than constraining queries.
 */

import type { CanonicalLevel } from './levels';

export type CampaignStatus = 'draft' | 'live' | 'ended';
export type SessionStatus = 'draft' | 'published' | 'cancelled';
export type ReservationStatus = 'reserved' | 'cancelled' | 'requested' | 'declined';
export type SubmissionRole = 'parent' | 'student';
/**
 * Only two outcomes exist. Subject is the single hard filter, so a supported
 * subject always produces teachers; 'subject_unsupported' means nobody on the
 * platform teaches what they asked for — a supply fact, and the demand signal
 * worth recruiting against. The older 'exact' | 'fallback' | 'none' vocabulary
 * described a three-tier filter that no longer exists (migration 234).
 */
export type MatchOutcome = 'matched' | 'subject_unsupported';

/**
 * Discount bounds (migration 235). The teacher names their own number now;
 * 232's fixed 10/15/20 tiers were widened on the owner's decision.
 *
 * `DISCOUNT_MAX` is a typo guard, not a product rule — nothing downstream
 * questions this percentage before it is spent against real money.
 */
export const DISCOUNT_MIN = 10;
export const DISCOUNT_MAX = 50;

/**
 * Retained as a plain number so existing call sites keep compiling. It is no
 * longer a union of literals: the DB CHECK is now a range, and a type that
 * still said `10 | 15 | 20` would be a lie the compiler enforced.
 */
export type DiscountTier = number;

export interface ClassMatchCampaign {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: CampaignStatus;
  created_at: string;
}

export interface ClassMatchParticipation {
  id: string;
  campaign_id: string;
  tutor_id: string;
  opted_in_at: string;
  /** The gate as evaluated at opt-in. Every clause is mutable afterwards. */
  gate_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface ClassMatchSession {
  id: string;
  campaign_id: string;
  group_id: string;
  tutor_id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  /** Per-session room. Null until minted. */
  meet_link: string | null;
  /** NULL means unlimited — not 0, and not `groups.max_students`, which cannot express it. */
  max_attendees: number | null;
  status: SessionStatus;
  cancelled_at: string | null;
  published_at: string | null;
  created_at: string;
  /** Teacher-set, 10–50 (migration 235). */
  discount_percent: DiscountTier;
  /** How long the coupon stays claimable after the attendee joins, 7–30 days. */
  redemption_window_days: number;
  /**
   * How long the reduced price holds once enrolled, counted from the enrolment
   * — not from when the class starts. Finite by design.
   *
   * CAPTURED BUT NOT YET ENFORCED. The value reaches the coupon and the savings
   * quote, and checkout then ignores it: `groupSubscriptionCheckout` selects
   * `price_duration_months` and computes the price-hold from `duration_days`
   * instead, which campaign coupons never set. Nothing reads
   * `group_enrollments.promotion_expires_at` either, and Stripe owns the billing
   * cycle, so a discounted subscription currently stays discounted. Tracked in
   * docs 03; do not present this to a teacher as a guarantee until that lands.
   */
  price_duration_months: number;
  /**
   * Optional hard deadline for claiming the discount (migration 235). NULL means
   * `redemption_window_days` alone decides. When set, an issued coupon expires at
   * whichever comes first — see `issueCouponForJoin`.
   */
  discount_expires_at: string | null;
}

export interface ClassMatchReservation {
  id: string;
  session_id: string;
  user_id: string;
  status: ReservationStatus;
  created_at: string;
  cancelled_at: string | null;
}

/**
 * A row means the user opened the session link. It does not mean they attended.
 * Report it as "join clicked".
 */
export interface ClassMatchJoinClick {
  id: string;
  session_id: string;
  user_id: string;
  clicked_at: string;
}

export interface ClassMatchSubmission {
  id: string;
  campaign_id: string;
  /** The unique key. Present before any account exists. */
  token: string;
  /** Null until the token row is claimed at sign-in, and forever for non-signups. */
  user_id: string | null;
  role: SubmissionRole;
  level: CanonicalLevel | null;
  subjects: string[];
  availability: string[];
  support_needed: string[];
  teacher_preferences: string[];
  match_outcome: MatchOutcome | null;
  /** Snapshot of what was shown, so the export can reproduce it. */
  recommended_session_ids: string[];
  created_at: string;
  claimed_at: string | null;
  /**
   * Set when the last question is answered. The questionnaire is one-time: a
   * row with this set is closed to edits and its owner is routed to their
   * matches rather than the form.
   */
  completed_at: string | null;
}

/**
 * The six availability blocks the questionnaire offers. Measured against the
 * paid class schedule, these cover 100% of current supply — there is no
 * weekday-morning or weekend-evening class the questionnaire cannot express.
 */
export type AvailabilityBlock =
  | 'weekday_afternoon'
  | 'weekday_evening'
  | 'saturday_morning'
  | 'saturday_afternoon'
  | 'sunday_morning'
  | 'sunday_afternoon';

export const AVAILABILITY_BLOCKS: ReadonlyArray<{ value: AvailabilityBlock; label: string }> = [
  { value: 'weekday_afternoon', label: 'Weekday afternoons' },
  { value: 'weekday_evening', label: 'Weekday evenings' },
  { value: 'saturday_morning', label: 'Saturday mornings' },
  { value: 'saturday_afternoon', label: 'Saturday afternoons' },
  { value: 'sunday_morning', label: 'Sunday mornings' },
  { value: 'sunday_afternoon', label: 'Sunday afternoons' },
];
