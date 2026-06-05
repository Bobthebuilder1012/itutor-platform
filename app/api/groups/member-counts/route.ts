// GET /api/groups/member-counts?ids=id1,id2,...
// Returns the count of active subscribers per group using the service client
// (bypasses RLS so students get accurate counts for all visible groups).
// Counts group_enrollments with status ACTIVE | GRACE | SUSPENDED.

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
        .select('group_id')
        .in('group_id', groupIds)
        .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED']),
      admin
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds)
        .in('status', ['active', 'approved']),
    ]);

    if (eErr) console.error('[member-counts] enrollments error:', eErr.message);
    if (mErr) console.error('[member-counts] members error:', mErr.message);

    const counts: Record<string, number> = {};
    for (const row of [...(enrollmentRows ?? []), ...(memberRows ?? [])]) {
      counts[row.group_id] = (counts[row.group_id] ?? 0) + 1;
    }

    return NextResponse.json({ counts });
  } catch (err) {
    console.error('[GET /api/groups/member-counts]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
