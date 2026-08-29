// Linked children + their class counts for the parent dashboard/children list.
// Server-side (service client) so the child-scoped group_members rows are
// actually visible — a parent can't read them from the browser (RLS).

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, getParentChildIds } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const childIds = await getParentChildIds(parentProfile.id);
    if (childIds.length === 0) return NextResponse.json({ children: [] });

    const [{ data: profiles }, { data: mems }, { data: joinReqs }] = await Promise.all([
      // form_level added for §5's child picker: showing the level on the chip
      // lets a parent spot a mismatch before the confirmation warns them.
      admin.from('profiles').select('id, full_name, display_name, form_level').in('id', childIds),
      admin.from('group_members').select('user_id, status').in('user_id', childIds),
      // Waiting on the PARENT, not on the tutor. group_members only holds the
      // tutor's queue, so a child who had asked their parent to enrol them
      // counted as nothing anywhere and the dashboard read "Pending 0" beside
      // an approval sitting on /parent/approvals.
      admin
        .from('class_join_requests')
        .select('student_id')
        .in('student_id', childIds)
        .eq('status', 'PENDING'),
    ]);

    const memsByChild = new Map<string, string[]>();
    (mems ?? []).forEach((m: any) => {
      const arr = memsByChild.get(m.user_id) ?? [];
      arr.push(m.status);
      memsByChild.set(m.user_id, arr);
    });

    const askedByChild = new Map<string, number>();
    (joinReqs ?? []).forEach((r: any) => {
      askedByChild.set(r.student_id, (askedByChild.get(r.student_id) ?? 0) + 1);
    });

    const children = (profiles ?? []).map((p: any) => {
      const statuses = memsByChild.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.display_name || p.full_name || 'Child',
        form_level: p.form_level ?? null,
        activeClasses: statuses.filter((s) => s === 'approved' || s === 'active').length,
        // Both queues. "Pending" on the dashboard sits beside Children and
        // Active classes, where it reads as enrolments that are not live yet —
        // and that is true whether the tutor or the parent is the one who has
        // not answered. No double count: a request only becomes a group_members
        // row once it has been approved and paid for.
        pendingCount:
          statuses.filter((s) => s === 'pending').length + (askedByChild.get(p.id) ?? 0),
      };
    });

    return NextResponse.json({ children });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
