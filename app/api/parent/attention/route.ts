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
import { listParentClassRequests } from '@/lib/server/classJoinRequests';
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

    // 1b. GROUP CLASS approvals. Same kind, different record — and they were
    //     missing entirely, so a parent with a child waiting on them was told
    //     "Nothing needs you" while /parent/approvals showed the request. The
    //     approvals page had always fetched both queues; this card fetched one.
    //
    //     No closesAt: a class request has no closing window (there is no single
    //     session to close two hours before). The card says the place is not
    //     held without naming a deadline, rather than inventing one.
    const { pending: classPending } = await listParentClassRequests(admin, parentProfile.id);
    for (const r of classPending) {
      items.push({
        kind: 'approval',
        id: r.id,
        childId: r.childId,
        childName: r.childName,
        title: `${r.childName.split(' ')[0]} wants to join ${r.className}`,
        detail: r.isFree ? 'Free class' : `$${Number(r.priceTtd).toLocaleString()} TTD`,
        href: '/parent/approvals',
        // A priced class is not approved into a seat — the parent enrols and
        // pays in one step. The label says which of the two this is.
        actionLabel: r.isFree ? 'Approve' : 'Review & pay',
        closesAt: null,
        isFree: r.isFree,
        amount: r.priceTtd,
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

    // 3. Feedback filed in the last fortnight AND not yet seen. Not a task, but
    //    it is the one thing a parent asked for and would otherwise only see by
    //    email.
    //
    //    The fortnight alone used to decide this, which made the item
    //    undismissable: "Read feedback" opened the page and the card kept
    //    counting until the report aged out. `feedback_seen_at` (migration 236)
    //    is stamped when the parent opens /parent/feedback, and anything at or
    //    before it is read. The age window still applies on top — a parent
    //    returning after a month should not meet a fortnight of history.
    const { data: seenRow } = await admin
      .from('profiles')
      .select('feedback_seen_at')
      .eq('id', parentProfile.id)
      .maybeSingle();
    const seenAt = (seenRow as { feedback_seen_at: string | null } | null)?.feedback_seen_at ?? null;

    const fortnightAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
    // Whichever is later: the parent's own high-water mark, or the age window.
    const since = seenAt && seenAt > fortnightAgo ? seenAt : fortnightAgo;

    const { data: feedback } = await admin
      .from('feedback')
      .select('id, child_id, tutor_id, created_at')
      .in('child_id', childIds)
      .gt('created_at', since)
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
