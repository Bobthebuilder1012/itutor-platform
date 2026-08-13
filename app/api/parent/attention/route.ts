// GET /api/parent/attention — everything waiting on the parent, in one read.
//
// Handover §9.1: "Dashboard with a single 'what needs your attention' card —
// pending approvals, payment failures, new feedback. Nothing else."
//
// EXACTLY THREE KINDS, AND THE LIST IS CLOSED
// Parents get no session reminders (§22 — student and tutor only), no weekly
// digest (§21 — none exists) and no attendance alerts (§6 — on-platform only).
// Surfacing any of those here would imply a channel the product does not have,
// and an attention card that cries wolf stops being read — at which point the
// pending approval that expires in two hours goes unseen.
//
// One endpoint rather than three fetches because the card renders as a single
// count and a single ordered list; three round trips would let it render "2
// items" and then jump to 3.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { listParentRequests } from '@/lib/server/bookingRequests';
import { formatWhen } from '@/lib/server/bookingRequestContext';

export const dynamic = 'force-dynamic';

export type AttentionItem = {
  kind: 'approval' | 'payment' | 'feedback';
  id: string;
  childId: string | null;
  childName: string | null;
  title: string;
  detail: string;
  /** Where acting on it happens. */
  href: string;
  actionLabel: string;
  /** Only set on approvals, for the urgency line. */
  closesAt?: string | null;
  isFree?: boolean;
  amount?: number | null;
};

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const { pending, childIds } = await listParentRequests(admin, parentProfile.id);

    if (childIds.length === 0) {
      return NextResponse.json({ items: [], count: 0, hasChildren: false });
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name')
      .in('id', childIds);

    const nameById = new Map(
      ((profiles ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
      }>).map((p) => [p.id, p.display_name || p.full_name || 'Your child'])
    );

    const items: AttentionItem[] = [];

    // 1. Pending approvals. First because they expire — §4.2 closes them two
    //    hours before the session and sends no email when it does.
    for (const r of pending) {
      const childName = nameById.get(r.studentId) ?? 'Your child';
      items.push({
        kind: 'approval',
        id: r.id,
        childId: r.studentId,
        childName,
        title: `${childName.split(' ')[0]} wants to join a class`,
        detail: r.isFree ? 'Free class' : `$${Number(r.frozenPrice).toLocaleString()} TTD`,
        href: '/parent/approvals',
        actionLabel: r.isFree ? 'Approve' : 'Approve & pay',
        closesAt: r.expiresAt ? formatWhen(r.expiresAt) : null,
        isFree: r.isFree,
        amount: r.frozenPrice,
      });
    }

    // 2. Payment failures. A child is NOT enrolled while one is outstanding, and
    //    the place is open to others — so this belongs beside the approvals
    //    rather than buried in a billing page.
    const { data: failedBookings } = await admin
      .from('bookings')
      .select('id, student_id, price_ttd, frozen_price, payment_status, subject_id')
      .in('student_id', childIds)
      .eq('payment_status', 'failed')
      .limit(20);

    for (const b of (failedBookings ?? []) as unknown as Array<{
      id: string;
      student_id: string;
      price_ttd: number | null;
      frozen_price: number | null;
    }>) {
      const childName = nameById.get(b.student_id) ?? 'Your child';
      const amount = Number(b.frozen_price ?? b.price_ttd ?? 0);
      items.push({
        kind: 'payment',
        id: b.id,
        childId: b.student_id,
        childName,
        title: `Payment failed for ${childName.split(' ')[0]}`,
        detail: `$${amount.toLocaleString()} TTD — ${childName.split(' ')[0]} is not enrolled and the place is open to others.`,
        href: '/parent/approvals',
        actionLabel: 'Retry payment',
        amount,
      });
    }

    // 3. Feedback filed in the last fortnight. Not a task, but it is the one
    //    thing a parent asked for and would otherwise only see by email.
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: feedback } = await admin
      .from('feedback')
      .select('id, child_id, tutor_id, created_at')
      .in('child_id', childIds)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);

    const fbRows = (feedback ?? []) as unknown as Array<{
      id: string;
      child_id: string;
      tutor_id: string;
      created_at: string;
    }>;

    if (fbRows.length > 0) {
      const tutorIds = Array.from(new Set(fbRows.map((f) => f.tutor_id)));
      const { data: tutors } = await admin
        .from('profiles')
        .select('id, full_name, display_name')
        .in('id', tutorIds);

      const tutorName = new Map(
        ((tutors ?? []) as unknown as Array<{
          id: string;
          full_name: string | null;
          display_name: string | null;
        }>).map((t) => [t.id, t.display_name || t.full_name || 'A tutor'])
      );

      for (const f of fbRows) {
        const childName = nameById.get(f.child_id) ?? 'your child';
        items.push({
          kind: 'feedback',
          id: f.id,
          childId: f.child_id,
          childName,
          title: `${tutorName.get(f.tutor_id) ?? 'A tutor'} filed feedback`,
          detail: `for ${childName.split(' ')[0]}`,
          href: '/parent/feedback',
          actionLabel: 'Read feedback',
        });
      }
    }

    return NextResponse.json({ items, count: items.length, hasChildren: true });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/attention]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
