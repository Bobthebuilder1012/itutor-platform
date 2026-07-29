// GET /api/groups/schedules?ids=id1,id2,...
// Returns each group's recurring weekly pattern (day + AST start time + duration)
// using the service client, mirroring /api/groups/member-counts.
//
// Why server-side: occurrences and sessions are RLS-scoped, so a student who
// isn't enrolled can't read them from the browser — which is exactly the student
// who needs to see "Recurring every Monday and Wednesday" before joining.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveScheduleEntries, type ScheduleEntry } from '@/lib/utils/scheduleFormat';

export const dynamic = 'force-dynamic';

function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === 'PGRST201' ||
    msg.includes('does not exist') ||
    msg.includes('could not find') ||
    msg.includes('could not embed')
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ids = req.nextUrl.searchParams.get('ids');
    if (!ids) return NextResponse.json({ schedules: {} });

    const groupIds = ids.split(',').filter(Boolean).slice(0, 100);
    if (groupIds.length === 0) return NextResponse.json({ schedules: {} });

    const admin = getServiceClient();

    const { data: groupRows } = await admin
      .from('groups')
      .select('id, schedule_data')
      .in('id', groupIds);
    const scheduleDataById = new Map<string, string | null>(
      (groupRows ?? []).map((g: any) => [String(g.id), g.schedule_data ?? null])
    );

    // Sessions carry the recurrence rule; occurrences cover classes scheduled as
    // individual dates with no rule (recurrence_type NONE / no recurrence_days).
    let sessionRows: any[] | null = null;
    let sessionsError: any = null;
    ({ data: sessionRows, error: sessionsError } = await admin
      .from('group_sessions')
      .select(
        'group_id, start_time, recurrence_type, recurrence_days, duration_minutes, ' +
          'group_session_occurrences(scheduled_start_at, scheduled_end_at, cancelled_at, status)'
      )
      .in('group_id', groupIds));

    if (sessionsError && isSchemaMismatch(sessionsError)) {
      ({ data: sessionRows, error: sessionsError } = await admin
        .from('group_sessions')
        .select('group_id, start_time, recurrence_type, recurrence_days, duration_minutes')
        .in('group_id', groupIds));
    }
    if (sessionsError) {
      console.warn('[GET /api/groups/schedules] sessions load failed:', sessionsError?.message ?? sessionsError);
      sessionRows = [];
    }

    const byGroup = new Map<string, { rules: any[]; occurrences: any[] }>();
    for (const row of sessionRows ?? []) {
      const key = String(row.group_id);
      const bucket = byGroup.get(key) ?? { rules: [], occurrences: [] };
      bucket.rules.push(row);
      bucket.occurrences.push(...((row.group_session_occurrences as any[]) ?? []));
      byGroup.set(key, bucket);
    }

    const schedules: Record<string, ScheduleEntry[]> = {};
    for (const groupId of groupIds) {
      const bucket = byGroup.get(groupId);
      const entries = resolveScheduleEntries({
        scheduleData: scheduleDataById.get(groupId) ?? null,
        sessionRows: bucket?.rules ?? [],
        occurrences: bucket?.occurrences ?? [],
      });
      if (entries.length > 0) schedules[groupId] = entries;
    }

    return NextResponse.json({ schedules });
  } catch (err) {
    console.error('[GET /api/groups/schedules]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
