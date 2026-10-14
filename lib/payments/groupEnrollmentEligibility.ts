// Can this student enrol in this class right now? Steps 2–8 of the group
// checkout, shared by every way of buying a seat: a monthly subscription
// (lib/payments/groupSubscriptionCheckout.ts) and a one-month credit purchase
// (lib/credits/creditMonthCheckout.ts).
//
// Extracted rather than copied, for the reason the checkout's own header
// gives: copies drift, and the way they drift is a student holding a seat the
// capacity check does not count. These functions only READ. Everything that
// writes — the waitlist entry, the enrolment row, the payment row — stays with
// the caller, because the two callers do different things when a class is
// full (a subscription joins the waitlist; a credit month is refused).
//
//   loadCheckoutContext   steps 2–7b + seat validation
//   checkCapacity         step 8

import type { SupabaseClient } from '@supabase/supabase-js';
import { findGroupEnrollmentConflict, conflictMessage } from '@/lib/services/scheduleConflict';
import { isPaidGroup } from '@/lib/payments/groupPricing';
import { canTakeSeat, seatConfigFromRow } from '@/lib/services/seatOccupancy';
import { formatOffersSeat, type SeatType } from '@/lib/utils/seatCapacity';

export type CheckoutRefusal = { ok: false; status: number; body: Record<string, unknown> };

export interface CheckoutContext {
  group: any;
  /** A SECURED / ACTIVE / GRACE / SUSPENDED subscription enrolment, if any. */
  activeEnrollment: { id: string; status: string; payment_status: string; billing_provider: string | null } | null;
  /** An unfinished checkout's enrolment, reused rather than duplicated. */
  pendingEnrollment: { id: string; pending_payment_expires_at: string | null } | null;
  /** Converting a paid-up-front secured spot into a monthly subscription. */
  continuingFromSecured: boolean;
  /**
   * Converting an ACTIVE one-month credit purchase into a monthly
   * subscription. Treated exactly like a secured spot: the row is reused and
   * the first paid period starts when the credit month ends.
   */
  continuingFromCreditMonth: boolean;
  /** The enrolment row this checkout will reuse, if any. */
  enrollmentId: string | null;
  isReusingEnrollment: boolean;
  requestedSeat: SeatType;
  seatConfig: ReturnType<typeof seatConfigFromRow>;
}

/**
 * Steps 2–7b. `requireStripe: false` skips the payment-configuration checks,
 * for a purchase credits cover entirely.
 */
export async function loadCheckoutContext(params: {
  admin: SupabaseClient;
  groupId: string;
  studentId: string;
  seatType?: SeatType | null;
  requireStripe?: boolean;
}): Promise<{ ok: true; ctx: CheckoutContext } | CheckoutRefusal> {
  const { admin, groupId, studentId, seatType } = params;
  const requireStripe = params.requireStripe !== false;

  // Step 2: Group must exist and be PUBLISHED
  //
  // Two select tiers: the seat columns arrive in migration 242, which is not on
  // every environment, and a missing column 42703s the WHOLE select — which here
  // would mean nobody can enrol in anything.
  const GROUP_BASE = `
      id, tutor_id, name, status, pricing_model, price_monthly,
      max_students, grace_period_days, require_join_requests,
      visibility, archived_at,
      end_date, stripe_price_id, stripe_price_amount_ttd
    `;
  const GROUP_SEATS =
    'class_format, max_students_online, max_students_physical, price_online_ttd, price_physical_ttd';

  let group: any = null;
  let groupErr: any = null;
  for (const select of [`${GROUP_BASE}, ${GROUP_SEATS}`, GROUP_BASE]) {
    const res = await admin
      .from('groups')
      .select(select)
      .eq('id', groupId)
      .is('archived_at', null)
      .single();
    if (!res.error) {
      group = res.data;
      groupErr = null;
      break;
    }
    groupErr = res.error;
    const missingColumn =
      String(res.error.code) === '42703' || String(res.error.code) === 'PGRST204';
    if (!missingColumn) break;
  }

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

  if (requireStripe) {
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
    .select('id, status, payment_status, billing_provider')
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
  // The same for a month bought with credits (migration 268): it never
  // renews, so subscribing is how the student keeps their seat.
  const continuingFromCreditMonth =
    activeEnrollment?.status === 'ACTIVE' && activeEnrollment?.billing_provider === 'credits';

  if (activeEnrollment && !continuingFromSecured && !continuingFromCreditMonth) {
    return { ok: false as const, status: 409, body: {
      error: 'You already have an active subscription for this group',
      enrollment_id: activeEnrollment.id,
      status: activeEnrollment.status,
    } };
  }

  // Step 6b: Child schedule conflict — the student's own upcoming schedule
  // (1:1 + group) vs this class's occurrences. Block before creating a checkout.
  // Skipped for a student continuing from a credit month: they are an ACTIVE
  // member, so findGroupEnrollmentConflict would find this very class in their
  // schedule and report it clashing with itself.
  if (!continuingFromCreditMonth) {
    const conflict = await findGroupEnrollmentConflict(admin, studentId, groupId);
    if (conflict) {
      return { ok: false as const, status: 409, body: { error: conflictMessage(conflict) } };
    }
  }

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
  } else if ((continuingFromSecured || continuingFromCreditMonth) && activeEnrollment) {
    // Converting a held spot into a subscription. Reused, and treated as an
    // existing enrolment for the capacity check below — the student is
    // already occupying this seat, so counting them against capacity would
    // refuse them their own place in a full class.
    enrollmentId = activeEnrollment.id;
    isReusingEnrollment = true;
  }

  // Step 7b: An OPEN SECURE-SPOT HOLD blocks the insert below, invisibly.
  //
  // secure_spot_claim writes enrollment_type 'SUBSCRIPTION' with status
  // SECURED_PENDING_PAYMENT. That status is in neither list above — step 6 looks
  // for SECURED/ACTIVE/GRACE/SUSPENDED and step 7 for PENDING_PAYMENT — but it
  // IS covered by the unique index over (student_id, group_id), which excludes
  // only CANCELLED/COMPLETED/ACTIVATION_FAILED. So the row is invisible here and
  // fatal at the insert, and the caller was told "Failed to create enrollment",
  // which names neither the cause nor anything they can do.
  //
  // Not reused: an unpaid preorder hold and a monthly subscription are different
  // products on different terms, and quietly converting one into the other is
  // how someone is charged for something they did not choose. The reservation is
  // theirs to finish or abandon first. A preorder class does not reach here at
  // all — both the student and the parent are routed to the secure-spot
  // checkout, whose claim RPC resumes the student's own hold (migration 214).
  if (!isReusingEnrollment) {
    const { data: heldSpot } = await admin
      .from('group_enrollments')
      .select('id, pending_payment_expires_at')
      .eq('group_id', groupId)
      .eq('student_id', studentId)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .eq('status', 'SECURED_PENDING_PAYMENT')
      .maybeSingle();

    if (heldSpot) {
      return { ok: false as const, status: 409, body: {
        error:
          'There is already a reservation in progress for this class. Finish that payment, or let it expire, before subscribing.',
        reason: 'secure_spot_hold_open',
        enrollment_id: (heldSpot as { id: string }).id,
        expires_at: (heldSpot as { pending_payment_expires_at: string | null }).pending_payment_expires_at,
      } };
    }
  }

  // ── The seat this student is buying ──────────────────────────────────────
  //
  // Defaults to 'online', which is what every enrolment before migration 242
  // was and what an online-only class can only ever be. A caller that asks for
  // 'physical' on a class with no physical seats is refused rather than silently
  // downgraded: someone who chose "in person" and got an online seat would find
  // out by turning up at a venue that is not expecting them.
  const requestedSeat: SeatType = seatType === 'physical' ? 'physical' : 'online';
  const seatConfig = seatConfigFromRow(group as any);
  if (!formatOffersSeat(seatConfig.class_format, requestedSeat)) {
    return {
      ok: false as const,
      status: 400,
      body: {
        error:
          requestedSeat === 'physical'
            ? 'This class does not have in-person seats.'
            : 'This class does not have online seats.',
      },
    };
  }

  return {
    ok: true,
    ctx: {
      group,
      activeEnrollment: (activeEnrollment as CheckoutContext['activeEnrollment']) ?? null,
      pendingEnrollment: (pendingEnrollment as CheckoutContext['pendingEnrollment']) ?? null,
      continuingFromSecured,
      continuingFromCreditMonth,
      enrollmentId,
      isReusingEnrollment,
      requestedSeat,
      seatConfig,
    },
  };
}

/**
 * Step 8: is there a seat? Only for a NEW enrolment — a reused one already
 * holds its place. 'full' means the class as a whole is full (the caller may
 * offer the waitlist); a full SEAT TYPE on a hybrid class is a refusal, since
 * the other kind of seat may still be open.
 */
export async function checkCapacity(
  admin: SupabaseClient,
  ctx: CheckoutContext,
  groupId: string,
  now: Date = new Date()
): Promise<{ ok: true } | { ok: false; full: true } | CheckoutRefusal> {
  if (ctx.isReusingEnrollment) return { ok: true };
  const { group, requestedSeat, seatConfig } = ctx;

  // ── PER-SEAT capacity, before the class-level check ────────────────────
  //
  // The class-level test below compares against `max_students`, which a
  // trigger keeps as the SUM of the two seat caps. On a hybrid class that sum
  // having room says nothing about whether the seat this student wants has
  // room — so without this a full physical room keeps selling in-person seats
  // right up until the class total fills. This is the bug
  // lib/utils/seatCapacity.ts was written to fix, and it can only be fixed
  // here, before money is taken.
  //
  // Non-fatal on a read failure: it falls through to the class-level check,
  // which is still correct for an online-only class — every class on
  // production today.
  // Set once the per-seat gate has actually run and approved. See the
  // class-level check below for why that then supersedes it.
  let perSeatApproved = false;
  try {
    const allowed = await canTakeSeat(admin, groupId, group as any, requestedSeat);
    perSeatApproved = allowed;
    if (!allowed) {
      return {
        ok: false as const,
        status: 409,
        body: {
          error:
            requestedSeat === 'physical'
              ? 'The in-person seats for this class are full. Online seats may still be open.'
              : 'The online seats for this class are full.',
          reason: 'seat_full',
          seat_type: requestedSeat,
        },
      };
    }
  } catch (seatErr: any) {
    console.warn('[checkout] per-seat capacity unavailable:', seatErr?.message);
  }

  // ── The class-level total, which is DERIVED and lossy ─────────────────
  //
  // Skipped once the per-seat gate has approved a non-online class, and that
  // is a correctness fix rather than an optimisation.
  //
  // A trigger keeps `max_students` as the SUM of the two seat caps, and
  // COALESCEs a NULL cap to 0 — so a hybrid class with ten online seats and
  // UNLIMITED physical ones stores max_students = 10. Once those ten online
  // seats sell, `used >= max_students` is true and this block would refuse an
  // in-person enrolment that the per-seat gate had just correctly allowed,
  // offering a waitlist for a room with space in it.
  //
  // The caps are the fact; the total is a convenience for everything written
  // before migration 242. Where the two disagree, the caps win.
  const skipClassTotal = perSeatApproved && seatConfig.class_format !== 'online';

  if (group.max_students && !skipClassTotal) {
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
    if (used >= group.max_students) return { ok: false, full: true };
  }

  return { ok: true };
}

/** The 202 a full class answers a subscriber with: join (or report) the waitlist. */
export async function joinWaitlist(
  admin: SupabaseClient,
  groupId: string,
  studentId: string
): Promise<{ ok: false; status: number; body: Record<string, unknown> }> {
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
