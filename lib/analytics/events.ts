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
   * A tutor sent a class invitation from the share sheet. `channel` is the
   * only way to tell whether the social targets earn their place or whether
   * everyone simply copies the link.
   */
  CLASS_SHARED: 'class_shared',
  /**
   * Someone accepted a class invitation. Server-emitted only: it asserts a
   * seat was granted, so it is deliberately absent from CLIENT_EMITTABLE.
   */
  CLASS_INVITE_ACCEPTED: 'class_invite_accepted',

  /**
   * The teacher activation funnel. Four events for one journey because the
   * gaps between them are the product question: sent → opened says whether the
   * email lands, opened → accepted whether signup is the wall, and accepted →
   * joined whether the class itself is.
   *
   * teacher_invite_joined is the TDR numerator. It is emitted from the server
   * only, for the same reason `paid` is: a browser must not be able to assert
   * that a teacher earned a student.
   */
  TEACHER_INVITE_SENT: 'teacher_invite_sent',
  TEACHER_INVITE_OPENED: 'teacher_invite_opened',
  TEACHER_INVITE_ACCEPTED: 'teacher_invite_accepted',
  TEACHER_INVITE_JOINED: 'teacher_invite_joined',
  TEACHER_INVITE_FAILED: 'teacher_invite_failed',

  /** The 14-day launch goal was shown, and reached. */
  LAUNCH_GOAL_VIEWED: 'launch_goal_viewed',
  LAUNCH_GOAL_MET: 'launch_goal_met',
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

export type MatchClass = 'exact' | 'near' | 'none';

/** Where a tutor sent a class invitation. */
export type ShareChannel =
  | 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'sms' | 'email'
  | 'copy_link' | 'copy_invite' | 'native';

/** Outcome of resolving a /r/[code] link. */
export type RefResolution = 'resolved' | 'unresolved' | 'unvalidated' | 'invalid';

/** Who a teacher addressed an invitation to, as the teacher described them. */
export type InviteeKind = 'student' | 'parent' | 'unknown';

/** How an invitation was created. */
export type InviteSource = 'single' | 'csv' | 'link' | 'direct_add';

/**
 * Why an invitation needs the teacher's attention. 'stale' is the honest
 * stand-in for a bounce until delivery webhooks exist: an address with no
 * engagement after a week is where bounces actually live.
 */
export type InviteFailureReason =
  | 'invalid_email' | 'send_failed' | 'suppressed' | 'duplicate'
  | 'self_invite' | 'stale' | 'parent_declined';

/** Which route carried a student over the line into a class. */
export type JoinRoute = 'student' | 'parent' | 'link' | 'direct_add';

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
  [PRODUCT_EVENTS.CLASS_SHARED]: { group_id: string; channel: ShareChannel };
  [PRODUCT_EVENTS.CLASS_INVITE_ACCEPTED]: {
    group_id: string;
    outcome: 'joined' | 'requested' | 'pending_payment';
    source: string | null;
  };

  [PRODUCT_EVENTS.TEACHER_INVITE_SENT]: {
    invite_id: string;
    group_id: string | null;
    kind: InviteeKind;
    source: InviteSource;
    /** Rows in the same send. 1 for a single invite; the file size for a CSV. */
    batch_size: number;
  };
  [PRODUCT_EVENTS.TEACHER_INVITE_OPENED]: {
    invite_id: string | null;
    group_id: string | null;
  };
  [PRODUCT_EVENTS.TEACHER_INVITE_ACCEPTED]: {
    invite_id: string;
    tutor_id: string;
    role: string;
  };
  [PRODUCT_EVENTS.TEACHER_INVITE_JOINED]: {
    invite_id: string;
    tutor_id: string;
    group_id: string | null;
    student_id: string;
    via: JoinRoute;
    /** Sent-to-joined latency. The number that says how long the funnel takes. */
    days_since_sent: number;
  };
  [PRODUCT_EVENTS.TEACHER_INVITE_FAILED]: {
    invite_id: string;
    reason: InviteFailureReason;
  };
  [PRODUCT_EVENTS.LAUNCH_GOAL_VIEWED]: {
    joined: number;
    target: number;
    days_left: number;
  };
  [PRODUCT_EVENTS.LAUNCH_GOAL_MET]: {
    joined: number;
    days_to_goal: number;
  };
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
  PRODUCT_EVENTS.CLASS_SHARED,
  // The banner reporting that it rendered is the one thing in the teacher
  // activation set a browser may assert. Everything else in that funnel —
  // sent, opened, accepted, joined, failed, goal met — is server-emitted,
  // because teacher_invite_joined IS the TDR numerator and the rest are the
  // trail that explains it.
  PRODUCT_EVENTS.LAUNCH_GOAL_VIEWED,
]);

export const ALL_EVENT_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(PRODUCT_EVENTS)
);
