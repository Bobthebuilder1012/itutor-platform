// GET /api/parent/billing — subscriptions and recent transactions for Settings.
//
// The design kit puts billing INSIDE Settings rather than as its own destination,
// so this backs that section. It also gives the payer pause/resume/cancel API
// (migration 227) its first reachable surface — until now it existed with nothing
// able to call it.
//
// Pause state is reported per subscription, including WHO paused it. A parent who
// sees "paused" without knowing the tutor did it will look for the control to
// resume and not find one — tutor breaks resume automatically on their own date
// and a parent cannot end one early.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const { data: links } = await admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', parentProfile.id);

    const childIds = ((links ?? []) as unknown as Array<{ child_id: string }>).map(
      (l) => l.child_id
    );
    if (childIds.length === 0) {
      return NextResponse.json({ subscriptions: [], transactions: [], children: [] });
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name')
      .in('id', childIds);

    const children = ((profiles ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
    }>).map((p, i) => ({
      id: p.id,
      name: p.display_name || p.full_name || 'Child',
      color: ['#9333EA', '#3B82F6', '#10B981', '#F59E0B'][i % 4],
    }));

    const nameById = new Map(children.map((c) => [c.id, c.name]));

    const { data: enrolments } = await admin
      .from('group_enrollments')
      .select(
        'id, student_id, group_id, status, plan_price_ttd, next_payment_due_at, current_period_end, cancel_at_period_end, cancelled_at, paused_at, pause_reason, pause_end, adjusted_renewal_date'
      )
      .in('student_id', childIds)
      .not('status', 'in', '("WAITLISTED","PENDING_PAYMENT")')
      .limit(100);

    const rows = (enrolments ?? []) as unknown as Array<{
      id: string;
      student_id: string;
      group_id: string;
      status: string;
      plan_price_ttd: number | null;
      next_payment_due_at: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean | null;
      cancelled_at: string | null;
      paused_at: string | null;
      pause_reason: string | null;
      pause_end: string | null;
      adjusted_renewal_date: string | null;
    }>;

    const groupIds = Array.from(new Set(rows.map((r) => r.group_id)));
    const groupName = new Map<string, string>();
    const groupTutor = new Map<string, string>();

    if (groupIds.length > 0) {
      const { data: groups } = await admin
        .from('groups')
        .select('id, name, subject, tutor_id')
        .in('id', groupIds);
      for (const g of (groups ?? []) as unknown as Array<{
        id: string;
        name: string | null;
        subject: string | null;
        tutor_id: string;
      }>) {
        groupName.set(g.id, g.name || g.subject || 'Class');
        groupTutor.set(g.id, g.tutor_id);
      }
    }

    const tutorIds = Array.from(new Set([...groupTutor.values()]));
    const { data: tutors } = tutorIds.length
      ? await admin.from('profiles').select('id, full_name, display_name').in('id', tutorIds)
      : { data: [] };

    const tutorName = new Map(
      ((tutors ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
      }>).map((t) => [t.id, t.display_name || t.full_name || 'Tutor'])
    );

    const fmt = (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleDateString('en-TT', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Port_of_Spain',
          })
        : null;

    const subscriptions = rows.map((r) => {
      const tutorId = groupTutor.get(r.group_id);
      // A tutor break is not the parent's to end: it resumes on its own date, so
      // the UI must not offer them a Resume button for it.
      const pausedByTutor = r.pause_reason === 'tutor_break';
      return {
        id: r.id,
        childId: r.student_id,
        childName: nameById.get(r.student_id) ?? 'Child',
        className: groupName.get(r.group_id) ?? 'Class',
        tutorName: tutorId ? (tutorName.get(tutorId) ?? null) : null,
        status: r.status,
        amount: Number(r.plan_price_ttd ?? 0),
        cancelled: Boolean(r.cancelled_at),
        cancelScheduled: Boolean(r.cancel_at_period_end) && !r.cancelled_at,
        paused: Boolean(r.paused_at) || Boolean(r.pause_reason),
        pausedByTutor,
        pauseEnds: fmt(r.pause_end),
        // The renewal, adjusted if a pause moved it. Surfaced as a date, never as
        // a credit balance.
        nextCharge: fmt(r.adjusted_renewal_date ?? r.next_payment_due_at ?? r.current_period_end),
      };
    });

    const { data: bookings } = await admin
      .from('bookings')
      .select('id, student_id, price_ttd, frozen_price, payment_status, created_at, status')
      .in('student_id', childIds)
      .order('created_at', { ascending: false })
      .limit(25);

    const transactions = ((bookings ?? []) as unknown as Array<{
      id: string;
      student_id: string;
      price_ttd: number | null;
      frozen_price: number | null;
      payment_status: string | null;
      created_at: string;
      status: string;
    }>)
      .filter((b) => Number(b.frozen_price ?? b.price_ttd ?? 0) > 0)
      .map((b) => ({
        id: b.id,
        childName: nameById.get(b.student_id) ?? 'Child',
        amount: Number(b.frozen_price ?? b.price_ttd ?? 0),
        status:
          b.status === 'SEAT_UNAVAILABLE_REFUNDED'
            ? 'Refunded'
            : b.payment_status === 'paid'
              ? 'Paid'
              : b.payment_status === 'failed'
                ? 'Failed'
                : b.payment_status === 'refunded'
                  ? 'Refunded'
                  : 'Pending',
        date: fmt(b.created_at),
      }));

    return NextResponse.json({ subscriptions, transactions, children });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/billing]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
