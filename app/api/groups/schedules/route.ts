// GET /api/groups/schedules?ids=id1,id2,...
// Returns the recurring schedule per group, derived from group_sessions.
//
// Why this can't be read from the browser: group_sessions' RLS SELECT policy
// subqueries group_members, and group_members' own SELECT policy references
// group_members — so Postgres aborts with 42P17 "infinite recursion detected in
// policy for relation group_members" for anyone who isn't the tutor. Every
// student-side schedule read therefore failed and the UI fell back to
// "Schedule TBD" even though the tutor had set a weekly session.
//
// Same shape/auth as /api/groups/member-counts: service client, login required.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  sessionPatternsToDisplay,
  sessionPatternWeekdays,
  sessionPatternsDuration,
  type SessionPattern,
} from '@/lib/utils/scheduleFormat';

export const dynamic = 'force-dynamic';

export type GroupSchedule = {
  display: string | null;
  days: number[];
  sessionLength: number | null;
};

const PATTERN_COLUMNS = 'group_id, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ids = req.nextUrl.searchParams.get('ids');
    if (!ids) return NextResponse.json({ schedules: {} });

    const groupIds = Array.from(new Set(ids.split(',').map((s) => s.trim()).filter(Boolean))).slice(0, 100);
    if (groupIds.length === 0) return NextResponse.json({ schedules: {} });

    const admin = getServiceClient();
    let rows: any[] | null = null;
    let error: any = null;

    ({ data: rows, error } = await admin
      .from('group_sessions')
      .select(PATTERN_COLUMNS)
      .in('group_id', groupIds)
      .order('starts_on', { ascending: true }));

    // Older deployments predate starts_on/ends_on — degrade instead of 500ing.
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      ({ data: rows, error } = await admin
        .from('group_sessions')
        .select('group_id, recurrence_type, recurrence_days, start_time, duration_minutes')
        .in('group_id', groupIds));
    }

    if (error) {
      console.error('[groups/schedules] sessions error:', error.message);
      return NextResponse.json({ schedules: {} });
    }

    const byGroup = new Map<string, SessionPattern[]>();
    for (const row of rows ?? []) {
      const list = byGroup.get(row.group_id) ?? [];
      list.push(row as SessionPattern);
      byGroup.set(row.group_id, list);
    }

    const schedules: Record<string, GroupSchedule> = {};
    for (const [groupId, patterns] of byGroup) {
      const display = sessionPatternsToDisplay(patterns);
      if (!display) continue;
      schedules[groupId] = {
        display,
        days: sessionPatternWeekdays(patterns),
        sessionLength: sessionPatternsDuration(patterns),
      };
    }

    return NextResponse.json({ schedules });
  } catch (err) {
    console.error('[GET /api/groups/schedules]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
