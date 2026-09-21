// =====================================================
// PRODUCT EVENT TAXONOMY — FROZEN
// =====================================================
// Find Your iTutor Build Plan §2.4. Item 3 of the plan's immediate next
// actions is "freeze the event taxonomy — renaming an event after data
// accumulates is expensive". This file is that freeze.
//
// Adding an event is cheap. Renaming or repurposing one invalidates every
// historical row and every query built on it. If a new fact is needed about
// an existing event, add a prop; do not fork the event name.

export const PRODUCT_EVENTS = {
  /**
   * A printed / QR / creator link was followed. Pre-signup and anon-keyed —
   * the only record that an offline asset was ever scanned. Not in the plan's
   * §2.4 table, which starts at signup, but required by §2.1's "anon_id is
   * retained only for pre-signup landing-page events".
   */
  REF_CLICK: 'ref_click',
  SIGNUP_COMPLETED: 'signup_completed',
  FINDER_PROMPTED: 'finder_prompted',
  FINDER_SKIPPED: 'finder_skipped',
  FINDER_STARTED: 'finder_started',
  FINDER_STEP: 'finder_step',
  FINDER_COMPLETED: 'finder_completed',
  MATCH_RETURNED: 'match_returned',
  MATCH_VIEWED: 'match_viewed',
  ENROLMENT_STARTED: 'enrolment_started',
  PAID: 'paid',
  RETAINED_30D: 'retained_30d',
  DEMAND_RECORDED: 'demand_recorded',
  NOTIFY_ME_CLICKED: 'notify_me_clicked',

  /**
   * Activation events, added for the Customer.io onboarding ladders.
   *
   * There is deliberately no `class_published` and no `account_created`.
   * "Created but not published" is `classes_created_count > 0 AND
   * published_classes_count = 0` — an attribute check, which is what the
   * campaign's "re-check the target action before sending" rule wants anyway;
   * and account creation is already `signup_completed` above. Two fewer names
   * in a taxonomy whose whole point is that names are expensive.
   */
  CLASS_VIEWED: 'class_viewed',
  CLASS_CREATED: 'class_created',
  CLASS_JOINED: 'class_joined',
} as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[keyof typeof PRODUCT_EVENTS];

/**
 * How a user arrived at the Finder. Separates forced first runs from voluntary
 * re-runs — the number that shows whether the feature has ongoing pull or only
 * works because it is mandatory (plan §2.4).
 */
export type FinderEntryRoute = 'forced' | 'nav' | 'dashboard' | 'email';

/** Why the interstitial fired. */
export type FinderTrigger = 'signup' | 'login_backfill';

export type MatchClass = 'exact' | 'near' | 'fallback' | 'none';

/** Outcome of resolving a /r/[code] link. */
export type RefResolution = 'resolved' | 'unresolved' | 'unvalidated' | 'invalid';

/**
 * Which path produced a seat. The platform has two membership tables and
 * several write paths into them; without this, `class_joined` cannot tell a
 * student who chose a class from one a tutor added, and the two deserve
 * different follow-ups.
 */
export type SeatSource =
  | 'free_join'
  | 'tutor_approval'
  | 'tutor_invite'
  | 'parent_approval'
  | 'parent_enrol'
  | 'subscription'
  | 'secure_spot'
  | 'cash';

/**
 * Required props per event, per the plan §2.4 table. Typed so a caller cannot
 * emit `match_returned` without a match_class — a missing required prop is
 * silent at write time and only discovered when the funnel query returns nulls
 * weeks later.
 */
export interface EventProps {
  [PRODUCT_EVENTS.REF_CLICK]: {
    code: string;
    resolution: RefResolution;
    kind: string | null;
    destination: string;
  };
  [PRODUCT_EVENTS.SIGNUP_COMPLETED]: { role: string };
  [PRODUCT_EVENTS.FINDER_PROMPTED]: { trigger: FinderTrigger };
  [PRODUCT_EVENTS.FINDER_SKIPPED]: { step_reached: number };
  [PRODUCT_EVENTS.FINDER_STARTED]: { entry_route: FinderEntryRoute };
  [PRODUCT_EVENTS.FINDER_STEP]: { step: number; value: unknown };
  [PRODUCT_EVENTS.FINDER_COMPLETED]: { answers: Record<string, unknown>; run_number: number };
  [PRODUCT_EVENTS.MATCH_RETURNED]: { match_class: MatchClass; count: number };
  [PRODUCT_EVENTS.MATCH_VIEWED]: { group_id: string; rank: number };
  [PRODUCT_EVENTS.ENROLMENT_STARTED]: { group_id: string };
  [PRODUCT_EVENTS.PAID]: { group_id: string; amount: number };
  [PRODUCT_EVENTS.RETAINED_30D]: { group_id: string };
  [PRODUCT_EVENTS.DEMAND_RECORDED]: { subject: string; level: string };
  [PRODUCT_EVENTS.NOTIFY_ME_CLICKED]: { demand_id: string };

  /**
   * A class page was opened. The campaign this drives writes "still interested
   * in <class> with <tutor>?", so the human-readable names are not optional
   * decoration — without them the reminder cannot name what it is about and
   * the whole class-view nudge is unbuildable.
   *
   * `class_url` is deliberately absent here and added at the Customer.io
   * boundary instead: the database should not store an origin that differs per
   * environment. See forwardEvent.
   */
  [PRODUCT_EVENTS.CLASS_VIEWED]: {
    group_id: string;
    class_name: string | null;
    tutor_id: string | null;
    tutor_name: string | null;
    subject: string | null;
    viewed_at: string;
  };
  [PRODUCT_EVENTS.CLASS_CREATED]: {
    group_id: string;
    class_name: string | null;
    subject: string | null;
    pricing_model: string | null;
    status: string | null;
    created_at: string;
  };
  [PRODUCT_EVENTS.CLASS_JOINED]: {
    group_id: string;
    /** Nullable only because a couple of join paths do not load the row. */
    class_name: string | null;
    tutor_id: string | null;
    tutor_name: string | null;
    subject: string | null;
    joined_at: string;
    /**
     * 'pending' means the seat is awaiting tutor approval, which is NOT an
     * activation — and `classes_joined_count` in customerio_profiles_v1
     * excludes it for the same reason. Emitted rather than dropped because
     * "requested, still waiting" is its own campaign, aimed at the tutor.
     */
    membership: 'enrolled' | 'pending';
    seat_source: SeatSource;
    is_paid: boolean;
    /** Set when a parent's action created a child's seat. */
    on_behalf_of?: string;
  };
}

/**
 * Events a browser is allowed to emit through /api/events. Server-authoritative
 * events — paid, retained_30d — are deliberately excluded: they are money and
 * retention facts and must not be assertable by a client.
 *
 * None of the three activation events is here. class_created and class_joined
 * are money-and-roster facts for the same reason as `paid`. class_viewed looks
 * like a browser event and is not: it is emitted server-side from
 * GET /api/groups/[groupId], where the group_id can be checked against a real
 * class and the 30-minute dedupe bucket is minted out of reach of the caller.
 * A client-supplied bucket would let one tab reset it at will.
 */
export const CLIENT_EMITTABLE: ReadonlySet<string> = new Set<string>([
  PRODUCT_EVENTS.FINDER_PROMPTED,
  PRODUCT_EVENTS.FINDER_SKIPPED,
  PRODUCT_EVENTS.FINDER_STARTED,
  PRODUCT_EVENTS.FINDER_STEP,
  PRODUCT_EVENTS.MATCH_VIEWED,
  PRODUCT_EVENTS.ENROLMENT_STARTED,
  PRODUCT_EVENTS.NOTIFY_ME_CLICKED,
]);

export const ALL_EVENT_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(PRODUCT_EVENTS)
);
