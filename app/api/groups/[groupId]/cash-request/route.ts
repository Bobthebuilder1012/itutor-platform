// /api/groups/[groupId]/cash-request — a student asks to join paying cash.
//
//   GET     the caller's open request for this class, if any
//   POST    ask. { seatType?: 'online' | 'physical', note?: string }
//   DELETE  withdraw an open request
//
// ── REPLACES THE INSTANT CASH HOLD ─────────────────────────────────────────
// The old `cash-hold` route put the student straight into a PENDING_PAYMENT
// seat on one tap. For a physical room that meant a stranger could occupy a
// scarce seat with no money and nobody's say-so. Now nothing is held: the
// tutor decides (`/cash-requests/[requestId]`), and only an acceptance
// creates the enrolment.
//
// Every guard the hold applied is still applied here — the tutor's cash
// switch, the seat rule, the parent gate, the duplicate and the schedule
// clash — so a request the tutor sees is one they could actually accept. The
// seat CAPACITY check is advisory here and binding at acceptance, because the
// room can fill while the request waits.

import { NextRequest, NextResponse } from 'next/server';
import { isPhysicalClassesEnabled, PHYSICAL_CLASSES_DISABLED_MESSAGE } from '@/lib/featureFlags/physicalClasses';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { canTakeSeat, seatConfigFromRow } from '@/lib/services/seatOccupancy';
import { formatOffersSeat, type SeatType } from '@/lib/utils/seatCapacity';
import { findGroupEnrollmentConflict, conflictMessage } from '@/lib/services/scheduleConflict';
import { resolveClassJoinGate } from '@/lib/server/classJoinRequests';
import { notifyTutorOfCashRequest } from '@/lib/server/cashJoinNotify';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

const GROUP_COLUMNS = `
  id, tutor_id, name, status, price_monthly, max_students, archived_at,
  class_format, accepts_cash, max_students_online, max_students_physical,
  price_online_ttd, price_physical_ttd
`;

async function caller() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { groupId } = await params;
  const user = await caller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await getServiceClient()
    .from('cash_join_requests')
    .select('id, status, seat_type, created_at')
    .eq('group_id', groupId)
    .eq('student_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  // 261 unapplied: there can be no request, so there is none.
  if (error) return NextResponse.json({ request: null });
  return NextResponse.json({ request: data ?? null });
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await caller();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isPhysicalClassesEnabled()) {
      return NextResponse.json({ error: PHYSICAL_CLASSES_DISABLED_MESSAGE }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { seatType?: string; note?: string };
    const requestedSeat: SeatType = body.seatType === 'online' ? 'online' : 'physical';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;

    const admin = getServiceClient();

    // A dependent child cannot commit their parent to paying, and a promise to
    // hand over cash is still a commitment.
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
      console.error('[cash-request] group read failed:', groupErr.message);
      return NextResponse.json({ error: 'Cash payment is not available.' }, { status: 503 });
    }
    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    const g = group as any;
    if (g.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'This class is not open for enrolment.' }, { status: 404 });
    }
    // Server-side, never trusted from the client: this is what decides whether
    // money may bypass the gateway at all.
    if (g.accepts_cash !== true) {
      return NextResponse.json({ error: 'This class does not take cash.' }, { status: 400 });
    }
    if (g.tutor_id === user.id) {
      return NextResponse.json({ error: 'You cannot join your own class.' }, { status: 403 });
    }

    const seatConfig = seatConfigFromRow(g);
    if (!formatOffersSeat(seatConfig.class_format, requestedSeat)) {
      return NextResponse.json({ error: 'This class does not offer that seat.' }, { status: 400 });
    }
    try {
      if (!(await canTakeSeat(admin, groupId, g, requestedSeat))) {
        return NextResponse.json(
          { error: 'Those seats are full right now.', reason: 'seat_full' },
          { status: 409 }
        );
      }
    } catch (seatErr: any) {
      console.warn('[cash-request] seat check unavailable:', seatErr?.message);
    }

    const { data: existing } = await admin
      .from('group_enrollments')
      .select('id')
      .eq('group_id', groupId)
      .eq('student_id', user.id)
      .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT'])
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'You are already in this class.' }, { status: 409 });
    }

    const conflict = await findGroupEnrollmentConflict(admin, user.id, groupId);
    if (conflict) {
      return NextResponse.json({ error: conflictMessage(conflict) }, { status: 409 });
    }

    const { data: inserted, error: insErr } = await admin
      .from('cash_join_requests')
      .insert({ group_id: groupId, student_id: user.id, seat_type: requestedSeat, note })
      .select('id')
      .single();

    if (insErr) {
      // The one-pending index: they already asked. Answer as a success so a
      // double tap reads as "sent", and do not email the tutor a second time.
      if (String(insErr.code) === '23505') {
        return NextResponse.json({ requested: true, already: true });
      }
      console.error('[cash-request] insert failed:', insErr.message);
      return NextResponse.json({ error: 'Could not send your request.' }, { status: 500 });
    }

    const requestId = (inserted as { id: string }).id;

    const { data: me } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const studentName = (me as any)?.display_name || (me as any)?.full_name || 'A student';
    const price =
      requestedSeat === 'physical'
        ? (g.price_physical_ttd ?? g.price_monthly ?? 0)
        : (g.price_online_ttd ?? g.price_monthly ?? 0);

    // Non-fatal: the request exists and shows on the tutor's Payments screen
    // whether or not the email lands.
    try {
      await notifyTutorOfCashRequest(admin, {
        tutorId: g.tutor_id,
        groupId,
        className: g.name,
        studentName,
        seatType: requestedSeat,
        priceTtd: Number(price) || 0,
        note,
        requestId,
      });
    } catch (err) {
      console.error('[cash-request] tutor notify failed:', err);
    }

    return NextResponse.json({ requested: true, request_id: requestId });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/cash-request]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { groupId } = await params;
  const user = await caller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await getServiceClient()
    .from('cash_join_requests')
    .update({ status: 'cancelled', decided_at: new Date().toISOString(), decided_by: user.id })
    .eq('group_id', groupId)
    .eq('student_id', user.id)
    .eq('status', 'pending');
  if (error) return NextResponse.json({ error: 'Could not withdraw.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
