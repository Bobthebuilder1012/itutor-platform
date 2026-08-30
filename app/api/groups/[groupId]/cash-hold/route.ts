// POST /api/groups/[groupId]/cash-hold — hold a seat, pay the tutor in person.
//
// §4 of the physical-classes spec. Creates a PENDING_PAYMENT enrolment and a
// PENDING cash `subscription_payments` row, and takes no money: the student
// hands it to the tutor, who records it on the class Payments screen.
//
// ── THE HOLD HAS NO EXPIRY, AND THAT IS THE POINT ──────────────────────────
// A card checkout parks the seat for 30 minutes and a cron reclaims it. This
// one is written with `pending_payment_expires_at: null`, because the student
// is going to hand over cash in person and that may be days away. The tutor
// releases it. Migration 248 records the same thing on the column comment,
// because the column's meaning now differs by payment method and any reclaim
// query must filter on a non-null value rather than comparing NULL to now().
//
// The confirmation therefore says "Your place is held. Pay your tutor to
// confirm." and shows no date — inventing a deadline the system does not
// enforce would be worse than showing none.
//
// ── WHY THIS IS NOT PART OF THE STRIPE CHECKOUT ────────────────────────────
// createGroupSubscriptionCheckout does fourteen things, most of which exist to
// get money from a card: the Stripe customer, the price object, the gross-up,
// the payment intent, the cancel_at rounding. None applies here. What DOES
// apply — the capacity gate, the seat rule, the duplicate check, the schedule
// clash — is re-run below rather than skipped, because those protect the class
// rather than the payment.

import { NextRequest, NextResponse } from 'next/server';
import { isPhysicalClassesEnabled, PHYSICAL_CLASSES_DISABLED_MESSAGE } from '@/lib/featureFlags/physicalClasses';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { canTakeSeat, seatConfigFromRow } from '@/lib/services/seatOccupancy';
import { formatOffersSeat, type SeatType } from '@/lib/utils/seatCapacity';
import { findGroupEnrollmentConflict, conflictMessage } from '@/lib/services/scheduleConflict';
import { resolveClassJoinGate } from '@/lib/server/classJoinRequests';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

const GROUP_COLUMNS = `
  id, tutor_id, name, status, pricing_model, price_monthly, max_students,
  grace_period_days, require_join_requests, visibility, archived_at, end_date,
  class_format, accepts_cash, max_students_online, max_students_physical,
  price_online_ttd, price_physical_ttd
`;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Cash IS the physical-classes feature; with the flag off there is no
    // supported way to reach this, so it refuses rather than holding a seat
    // nobody can settle.
    if (!isPhysicalClassesEnabled()) {
      return NextResponse.json({ error: PHYSICAL_CLASSES_DISABLED_MESSAGE }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { seatType?: string };
    const requestedSeat: SeatType = body.seatType === 'physical' ? 'physical' : 'online';

    const admin = getServiceClient();

    // The parent gate, before anything is held. Same check and same reason as
    // the card paths: a dependent child cannot commit their parent to a payment,
    // and a cash hold is still a commitment to hand over money.
    const gate = await resolveClassJoinGate(admin, user.id);
    if (gate.needsParentApproval) {
      return NextResponse.json(
        { parent_approval_required: true, error: 'Your parent needs to approve this.' },
        { status: 202 }
      );
    }

    const { data: group, error: groupErr } = await admin
      .from('groups')
      .select(GROUP_COLUMNS)
      .eq('id', groupId)
      .is('archived_at', null)
      .maybeSingle();

    if (groupErr) {
      // 242 unapplied: the cash columns do not exist, so cash cannot be on.
      console.error('[cash-hold] group read failed:', groupErr.message);
      return NextResponse.json({ error: 'Cash payment is not available.' }, { status: 503 });
    }
    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    const g = group as any;
    if (g.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'This class is not open for enrolment.' }, { status: 404 });
    }
    // The tutor's own switch. Checked server-side rather than trusted from the
    // client, because it is what decides whether money may bypass the gateway.
    if (g.accepts_cash !== true) {
      return NextResponse.json({ error: 'This class does not take cash.' }, { status: 400 });
    }
    if (g.tutor_id === user.id) {
      return NextResponse.json({ error: 'You cannot enrol in your own class.' }, { status: 403 });
    }

    // Seat rules, the same two the card path applies.
    const seatConfig = seatConfigFromRow(g);
    if (!formatOffersSeat(seatConfig.class_format, requestedSeat)) {
      return NextResponse.json({ error: 'This class does not offer that seat.' }, { status: 400 });
    }
    try {
      if (!(await canTakeSeat(admin, groupId, g, requestedSeat))) {
        return NextResponse.json(
          {
            error:
              requestedSeat === 'physical'
                ? 'The in-person seats for this class are full.'
                : 'The online seats for this class are full.',
            reason: 'seat_full',
          },
          { status: 409 }
        );
      }
    } catch (seatErr: any) {
      console.warn('[cash-hold] seat check unavailable:', seatErr?.message);
    }

    // Already in, or already holding.
    const { data: existing } = await admin
      .from('group_enrollments')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('student_id', user.id)
      .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT'])
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          error:
            (existing as any).status === 'PENDING_PAYMENT'
              ? 'You already have a place held in this class.'
              : 'You are already in this class.',
          enrollment_id: (existing as any).id,
        },
        { status: 409 }
      );
    }

    const conflict = await findGroupEnrollmentConflict(admin, user.id, groupId);
    if (conflict) {
      return NextResponse.json({ error: conflictMessage(conflict) }, { status: 409 });
    }

    // The seat's own price when the tutor set one, otherwise the class price.
    const seatPrice =
      requestedSeat === 'physical'
        ? (g.price_physical_ttd ?? g.price_monthly ?? 0)
        : (g.price_online_ttd ?? g.price_monthly ?? 0);

    const { data: enrolment, error: enrolErr } = await admin
      .from('group_enrollments')
      .insert({
        group_id: groupId,
        student_id: user.id,
        enrollment_type: 'SUBSCRIPTION',
        status: 'PENDING_PAYMENT',
        payment_status: 'PENDING',
        plan_price_ttd: seatPrice,
        seat_type: requestedSeat,
        // NULL, and load-bearing — see the header. A cash hold has no timer.
        pending_payment_expires_at: null,
        billing_provider: 'cash',
      })
      .select('id')
      .single();

    if (enrolErr || !enrolment) {
      console.error('[cash-hold] enrolment insert failed:', enrolErr?.message);
      return NextResponse.json({ error: 'Could not hold your place.' }, { status: 500 });
    }

    const enrollmentId = (enrolment as { id: string }).id;

    // The unpaid row the tutor will later mark as received. Created now rather
    // than at payment time so the Payments grid can show the hold as
    // outstanding — a held physical seat occupies a scarce resource, and the
    // spec surfaces those above the grid for exactly that reason.
    const { error: payErr } = await admin.from('subscription_payments').insert({
      enrollment_id: enrollmentId,
      group_id: groupId,
      student_id: user.id,
      type: 'subscription_initial',
      amount_ttd: seatPrice,
      status: 'PENDING',
      payment_method: 'cash',
    });

    if (payErr) {
      // Roll the hold back rather than leave a seat occupied by an enrolment
      // with no payment row behind it — nothing would ever settle it, and the
      // tutor would have no way to see why the seat was gone.
      console.error('[cash-hold] payment row failed, releasing hold:', payErr.message);
      await admin.from('group_enrollments').delete().eq('id', enrollmentId);
      return NextResponse.json({ error: 'Could not hold your place.' }, { status: 500 });
    }

    await track(PRODUCT_EVENTS.ENROLMENT_STARTED, { group_id: groupId }, { userId: user.id });

    return NextResponse.json({
      held: true,
      enrollment_id: enrollmentId,
      seat_type: requestedSeat,
      amount_ttd: seatPrice,
    });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/cash-hold]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
