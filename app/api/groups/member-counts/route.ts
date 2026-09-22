// GET /api/groups/member-counts?ids=id1,id2,...
// Returns how many students hold a seat in each group, using the service client
// (bypasses RLS so students get accurate counts for all visible groups).
//
// A student counts once, whichever way they joined: group_enrollments with
// status SECURED | ACTIVE | GRACE | SUSPENDED, or group_members with status
// active | approved. A paid student is in BOTH tables — activation and
// secure_spot_confirm each grant membership — so summing the two counted every
// paying student twice, and a class with 3 students read "Only 9 spots left"
// out of 15. Same rule as lib/services/classOccupancy.ts.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ids = req.nextUrl.searchParams.get('ids');
    if (!ids) return NextResponse.json({ counts: {} });

    const groupIds = ids.split(',').filter(Boolean).slice(0, 100);
    if (groupIds.length === 0) return NextResponse.json({ counts: {} });

    const admin = getServiceClient();

    // Count both subscription enrollments AND direct group members
    const [{ data: enrollmentRows, error: eErr }, { data: memberRows, error: mErr }] = await Promise.all([
      admin
        .from('group_enrollments')
        .select('group_id, student_id')
        .in('group_id', groupIds)
        .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED']),
      admin
        .from('group_members')
        .select('group_id, user_id')
        .in('group_id', groupIds)
        .in('status', ['active', 'approved']),
    ]);

    if (eErr) console.error('[member-counts] enrollments error:', eErr.message);
    if (mErr) console.error('[member-counts] members error:', mErr.message);

    const studentsByGroup = new Map<string, Set<string>>();
    const add = (groupId: string, studentId: string | null) => {
      if (!studentId) return;
      let set = studentsByGroup.get(groupId);
      if (!set) studentsByGroup.set(groupId, (set = new Set()));
      set.add(studentId);
    };
    for (const row of enrollmentRows ?? []) add(row.group_id, row.student_id);
    for (const row of memberRows ?? []) add(row.group_id, row.user_id);

    const counts: Record<string, number> = {};
    for (const [groupId, students] of studentsByGroup) counts[groupId] = students.size;

    return NextResponse.json({ counts });
  } catch (err) {
    console.error('[GET /api/groups/member-counts]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
