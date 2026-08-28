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
}

/**
 * Events a browser is allowed to emit through /api/events. Server-authoritative
 * events — paid, retained_30d — are deliberately excluded: they are money and
 * retention facts and must not be assertable by a client.
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
