// GET /api/parent/classes/[groupId]/secure-spot
//
// Which of this parent's children hold a Secure-your-spot place in this class,
// and what state it is in. One row per child who has one; an empty list is the
// normal answer and means there is nothing to say.
//
// WHY THIS IS NOT PART OF THE CLASS ROUTE
// /api/groups/[groupId] answers for the VIEWER — `viewer_membership` is the
// viewer's own enrolment — and on a parent's class page the viewer is the
// parent, who is never in the class. Teaching that route to resolve children
// would put two parent-only queries on the path of every anonymous, student and
// tutor class view to serve one page. The parent's page is a client component
// and can ask for what only it needs.
//
// Authorization is the parent link, proven here by requireParentContext +
// getParentChildIds: the enrolments are read with the service client, so the
// child id list is the entire boundary and is never taken from the request.

import { NextRequest, NextResponse } from 'next/server';
import {
  ParentAccessError,
  requireParentContext,
  getParentChildIds,
} from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const { admin, parentProfile } = await requireParentContext();

    const childIds = await getParentChildIds(parentProfile.id);
    if (childIds.length === 0) return NextResponse.json({ children: [] });

    const [{ data: enrolments }, { data: profiles }, { data: group }] = await Promise.all([
      admin
        .from('group_enrollments')
        .select('id, student_id, status, release_date, plan_price_ttd')
        .eq('group_id', groupId)
        .in('student_id', childIds)
        // SECURED is a place running on its paid month; COMPLETED is one that
        // ran out. Everything else is an ordinary subscription this endpoint
        // has nothing to say about — release_date below is what separates a
        // lapsed secure-spot from a subscription that simply finished.
        .in('status', ['SECURED', 'COMPLETED']),
      admin.from('profiles').select('id, full_name, display_name').in('id', childIds),
      admin.from('groups').select('end_date, price_monthly').eq('id', groupId).maybeSingle(),
    ]);

    const nameOf = new Map(
      (profiles ?? []).map((p: any) => [p.id, p.display_name || p.full_name || 'Your child'])
    );
    const endDate = (group as { end_date: string | null } | null)?.end_date ?? null;
    const priceMonthly = Number((group as { price_monthly: number | null } | null)?.price_monthly) || null;

    const children = (enrolments ?? [])
      .filter((e: any) => !!e.release_date)
      .map((e: any) => ({
        enrolmentId: e.id as string,
        childId: e.student_id as string,
        childName: nameOf.get(e.student_id) ?? 'Your child',
        status: e.status as 'SECURED' | 'COMPLETED',
        releaseDate: e.release_date as string,
        // The whole class finishes inside the paid month — bought outright, so
        // there is no second month to sell and the page must not ask.
        shortClass: !!(endDate && endDate <= e.release_date),
        priceMonthly,
      }));

    return NextResponse.json({ children });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/classes/[groupId]/secure-spot]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
