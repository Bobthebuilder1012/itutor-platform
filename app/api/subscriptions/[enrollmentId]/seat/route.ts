// POST /api/subscriptions/[enrollmentId]/seat — move between an online seat
// and a seat in the room.
//
// §9. A family's circumstances change mid-term: transport falls through, an
// exam gets close, a sibling's schedule shifts. Today the only way to change
// how you attend is to cancel and re-enrol, which loses the place entirely on a
// class where the room is full.
//
// ── THE SEAT MOVES NOW; THE PRICE MOVES AT RENEWAL ─────────────────────────
// The student has to know where to be on Tuesday, so the seat changes
// immediately. The money does not: a mid-cycle re-charge or refund is the part
// of a switch that goes wrong, and the period has already been paid for at the
// old price. `plan_price_ttd` is set to the new seat's price, which is what the
// next renewal charges — so the difference is at most one period, in one
// direction or the other, and the UI says so before the student confirms.
//
// This is a deliberate choice and not an oversight. Pro-rating would mean
// issuing a partial refund or a partial charge against a payment the platform
// may never have handled at all — a cash payment goes tutor to student, and
// there is nothing to pro-rate against.
//
// ── THE TARGET SEAT MUST BE FREE ───────────────────────────────────────────
// Checked with the same canTakeSeat() the join paths use, so a switch cannot do
// what a join is refused. A room with twelve chairs does not gain a thirteenth
// because the person taking it was already in the class.
//
// ── A HELD OR CANCELLED PLACE CANNOT SWITCH ────────────────────────────────
// PENDING_PAYMENT means the seat is not theirs yet; the answer there is to pay
// or to release, not to move. A cancelled enrolment has no seat to move.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { canTakeSeat, seatConfigFromRow } from '@/lib/services/seatOccupancy';
import { formatOffersSeat, type SeatType } from '@/lib/utils/seatCapacity';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ enrollmentId: string }> };

/** Statuses that hold a live seat. Anything else has nothing to move. */
const LIVE = ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'];

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { enrollmentId } = await params;

    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { seatType?: string };
    const target: SeatType = body.seatType === 'physical' ? 'physical' : 'online';

    const admin = getServiceClient();

    const { data: enrolment, error: enrolErr } = await admin
      .from('group_enrollments')
      .select('id, group_id, student_id, status, seat_type, plan_price_ttd')
      .eq('id', enrollmentId)
      .maybeSingle();

    if (enrolErr) {
      // 242 unapplied: seat_type does not exist, so there is nothing to switch.
      console.error('[seat] enrolment read failed:', enrolErr.message);
      return NextResponse.json({ error: 'Changing seats is not available.' }, { status: 503 });
    }
    if (!enrolment || (enrolment as any).student_id !== user.id) {
      // Same answer for "not yours" and "does not exist".
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const e = enrolment as any;
    if (!LIVE.includes(String(e.status))) {
      return NextResponse.json(
        {
          error:
            e.status === 'PENDING_PAYMENT'
              ? 'Your place is still being held. Pay for it first, then you can change seats.'
              : 'This enrolment is no longer active.',
        },
        { status: 409 }
      );
    }

    const current: SeatType = e.seat_type === 'physical' ? 'physical' : 'online';
    if (current === target) {
      return NextResponse.json({ ok: true, seat_type: current, unchanged: true });
    }

    const { data: group } = await admin
      .from('groups')
      .select(
        'id, tutor_id, name, price_monthly, max_students, class_format, ' +
          'max_students_online, max_students_physical, price_online_ttd, price_physical_ttd'
      )
      .eq('id', e.group_id)
      .maybeSingle();
    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    const g = group as any;
    const seatConfig = seatConfigFromRow(g);
    if (!formatOffersSeat(seatConfig.class_format, target)) {
      return NextResponse.json(
        {
          error:
            target === 'physical'
              ? 'This class does not meet in person.'
              : 'This class does not have online seats.',
        },
        { status: 400 }
      );
    }

    if (!(await canTakeSeat(admin, e.group_id, g, target))) {
      return NextResponse.json(
        {
          error:
            target === 'physical'
              ? 'The in-person seats are full. Ask your tutor to let you know when one frees up.'
              : 'The online seats are full.',
          reason: 'seat_full',
        },
        { status: 409 }
      );
    }

    const newPrice =
      target === 'physical'
        ? (g.price_physical_ttd ?? g.price_monthly ?? e.plan_price_ttd ?? 0)
        : (g.price_online_ttd ?? g.price_monthly ?? e.plan_price_ttd ?? 0);

    // Guarded on the seat we read, so two taps in quick succession cannot both
    // pass the capacity check and both write.
    const { error: updateErr } = await admin
      .from('group_enrollments')
      .update({ seat_type: target, plan_price_ttd: newPrice })
      .eq('id', enrollmentId)
      .eq('seat_type', e.seat_type ?? 'online');

    if (updateErr) {
      console.error('[seat] switch failed:', updateErr.message);
      return NextResponse.json({ error: 'Could not change your seat.' }, { status: 500 });
    }

    // The tutor has to know: the room count changed, and on a physical seat
    // they are expecting a face. Non-fatal — the seat has already moved, and
    // failing here would leave the student unsure whether it did.
    try {
      await admin.from('notifications').insert({
        user_id: g.tutor_id,
        type: 'group_session_updated',
        title: 'A student changed seats',
        message:
          target === 'physical'
            ? `A student in "${g.name}" moved from an online seat to an in-person one.`
            : `A student in "${g.name}" moved from an in-person seat to an online one.`,
        group_id: e.group_id,
        metadata: { groupId: e.group_id, enrollmentId, from: current, to: target },
      });
    } catch (notifyErr) {
      console.error('[seat] tutor notification failed:', notifyErr);
    }

    return NextResponse.json({
      ok: true,
      seat_type: target,
      /** What the NEXT renewal will charge — not a charge being made now. */
      next_price_ttd: newPrice,
      previous_price_ttd: e.plan_price_ttd ?? null,
    });
  } catch (err) {
    console.error('[POST /api/subscriptions/[enrollmentId]/seat]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
