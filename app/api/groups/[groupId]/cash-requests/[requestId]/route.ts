// PATCH /api/groups/[groupId]/cash-requests/[requestId] — accept or decline.
//   { action: 'approve' } | { action: 'decline', reason?: string }
//
// ── WHAT ACCEPTING CREATES ─────────────────────────────────────────────────
// An ACTIVE cash enrolment and this month's PENDING cash payment row. The
// student is IN the class from this moment; paying is between them and the
// tutor, who marks each month paid or missed on the Cash tab.
//
// `next_payment_due_at` and `current_period_end` are left NULL, and that is
// load-bearing: every dunning task in /api/cron/process-subscriptions filters
// on one of them, so a NULL keeps the cron from sliding a cash student into
// GRACE and SUSPENDED because the tutor had not clicked yet. For cash the
// tutor's bookkeeping is the only authority on who has paid.
//
// ── CAPACITY IS BINDING HERE ───────────────────────────────────────────────
// The request only checked it advisorily. The room may have filled since, and
// this is the step that actually takes a seat.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { canTakeSeat, seatConfigFromRow } from '@/lib/services/seatOccupancy';
import { formatOffersSeat, type SeatType } from '@/lib/utils/seatCapacity';
import { currentMonth, monthEndIso, monthStartIso } from '@/lib/server/cashLedger';
import { notifyStudentOfCashDecision } from '@/lib/server/cashJoinNotify';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string; requestId: string }> };

const GROUP_COLUMNS = `
  id, tutor_id, name, status, price_monthly, max_students, archived_at,
  class_format, accepts_cash, max_students_online, max_students_physical,
  price_online_ttd, price_physical_ttd
`;

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { groupId, requestId } = await params;
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const admin = getServiceClient();
    const { data: group } = await admin
      .from('groups')
      .select(GROUP_COLUMNS)
      .eq('id', groupId)
      .maybeSingle();
    if (!group || (group as any).tutor_id !== user.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const g = group as any;

    const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
    if (body.action !== 'approve' && body.action !== 'decline') {
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
    }

    // Scoped to the class as well as the id, so a request from another class
    // cannot be settled by a tutor who owns a different one.
    const { data: request } = await admin
      .from('cash_join_requests')
      .select('id, student_id, seat_type, status')
      .eq('id', requestId)
      .eq('group_id', groupId)
      .maybeSingle();
    if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const r = request as { id: string; student_id: string; seat_type: SeatType; status: string };
    if (r.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been answered.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { data: tutorProfile } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const tutorName =
      (tutorProfile as any)?.display_name || (tutorProfile as any)?.full_name || 'Your tutor';
    const price = Number(
      r.seat_type === 'physical'
        ? (g.price_physical_ttd ?? g.price_monthly ?? 0)
        : (g.price_online_ttd ?? g.price_monthly ?? 0)
    ) || 0;

    if (body.action === 'decline') {
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null;
      const { error } = await admin
        .from('cash_join_requests')
        .update({ status: 'declined', decline_reason: reason, decided_by: user.id, decided_at: now })
        .eq('id', r.id)
        .eq('status', 'pending');
      if (error) return NextResponse.json({ error: 'could_not_save' }, { status: 500 });

      try {
        await notifyStudentOfCashDecision(admin, {
          studentId: r.student_id,
          groupId,
          className: g.name,
          tutorName,
          priceTtd: price,
          approved: false,
          reason,
        });
      } catch (err) {
        console.error('[cash-requests] decline notify failed:', err);
      }
      return NextResponse.json({ ok: true, status: 'declined' });
    }

    // ── approve ──
    if (g.archived_at || g.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'This class is not open for enrolment.' }, { status: 409 });
    }
    if (!formatOffersSeat(seatConfigFromRow(g).class_format, r.seat_type)) {
      return NextResponse.json(
        { error: 'This class no longer offers that seat. Decline the request instead.' },
        { status: 409 }
      );
    }
    if (!(await canTakeSeat(admin, groupId, g, r.seat_type))) {
      return NextResponse.json(
        {
          error:
            r.seat_type === 'physical'
              ? 'Your in-person seats are full. Raise the limit in Settings, or decline.'
              : 'Your online seats are full. Raise the limit in Settings, or decline.',
        },
        { status: 409 }
      );
    }

    const { data: existing } = await admin
      .from('group_enrollments')
      .select('id')
      .eq('group_id', groupId)
      .eq('student_id', r.student_id)
      .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT'])
      .maybeSingle();

    let enrollmentId: string | null = (existing as any)?.id ?? null;

    if (!enrollmentId) {
      const { data: enrolment, error: enrolErr } = await admin
        .from('group_enrollments')
        .insert({
          group_id: groupId,
          student_id: r.student_id,
          enrollment_type: 'SUBSCRIPTION',
          status: 'ACTIVE',
          payment_status: 'PENDING',
          plan_price_ttd: price,
          seat_type: r.seat_type,
          billing_provider: 'cash',
          // NULL on purpose — see the header. The cron must not dun cash.
          pending_payment_expires_at: null,
          next_payment_due_at: null,
        })
        .select('id')
        .single();
      if (enrolErr || !enrolment) {
        console.error('[cash-requests] enrolment insert failed:', enrolErr?.message);
        return NextResponse.json({ error: 'Could not add them to the class.' }, { status: 500 });
      }
      enrollmentId = (enrolment as { id: string }).id;

      // This month's open row, so the Cash tab shows them as owing from day
      // one. Non-fatal: the tab creates a month's row on first mark anyway.
      const month = currentMonth();
      const { error: payErr } = await admin.from('subscription_payments').insert({
        enrollment_id: enrollmentId,
        group_id: groupId,
        student_id: r.student_id,
        type: 'subscription_initial',
        amount_ttd: price,
        status: 'PENDING',
        payment_method: 'cash',
        period_start: monthStartIso(month),
        period_end: monthEndIso(month),
      });
      if (payErr) console.error('[cash-requests] first payment row failed:', payErr.message);
    }

    await admin
      .from('cash_join_requests')
      .update({ status: 'approved', enrollment_id: enrollmentId, decided_by: user.id, decided_at: now })
      .eq('id', r.id)
      .eq('status', 'pending');

    try {
      await notifyStudentOfCashDecision(admin, {
        studentId: r.student_id,
        groupId,
        className: g.name,
        tutorName,
        priceTtd: price,
        approved: true,
      });
    } catch (err) {
      console.error('[cash-requests] approve notify failed:', err);
    }

    return NextResponse.json({ ok: true, status: 'approved', enrollment_id: enrollmentId });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]/cash-requests/[requestId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
