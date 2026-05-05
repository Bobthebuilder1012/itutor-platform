import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const INACTIVE_DAYS = 90;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: activeGroups } = await service
      .from('groups')
      .select('id, name, tutor_id, created_at')
      .is('archived_at', null);

    if (!activeGroups || activeGroups.length === 0) {
      return NextResponse.json({ archived: 0, groups: [] });
    }

    const groupIds = activeGroups.map((g) => g.id);

    // Groups where tutor visited in the last 90 days
    const { data: recentVisits } = await service
      .from('group_visits')
      .select('group_id')
      .in('group_id', groupIds)
      .gte('visited_at', cutoff);

    const visitedGroupIds = new Set((recentVisits ?? []).map((v) => v.group_id));

    // Groups with sessions created or scheduled in the last 90 days
    const { data: recentSessions } = await service
      .from('group_sessions')
      .select('group_id, created_at')
      .in('group_id', groupIds)
      .gte('created_at', cutoff);

    const { data: recentOccurrences } = await service
      .from('group_session_occurrences')
      .select('group_session_id, scheduled_start_at, group_sessions!inner(group_id)')
      .gte('scheduled_start_at', cutoff);

    const sessionGroupIds = new Set((recentSessions ?? []).map((s) => s.group_id));
    for (const occ of recentOccurrences ?? []) {
      const gid = (occ as any).group_sessions?.group_id;
      if (gid) sessionGroupIds.add(gid);
    }

    const inactiveGroups = activeGroups.filter(
      (g) =>
        !visitedGroupIds.has(g.id) &&
        !sessionGroupIds.has(g.id) &&
        new Date(g.created_at).toISOString() < cutoff
    );

    if (inactiveGroups.length === 0) {
      return NextResponse.json({ archived: 0, groups: [] });
    }

    const inactiveIds = inactiveGroups.map((g) => g.id);
    const now = new Date().toISOString();

    const { error: archiveError } = await service
      .from('groups')
      .update({
        archived_at: now,
        status: 'ARCHIVED',
        archived_reason: 'auto_inactive',
      })
      .in('id', inactiveIds);

    if (archiveError) throw archiveError;

    const logRows = inactiveGroups.map((g) => ({
      group_id: g.id,
      tutor_id: g.tutor_id,
      action: 'auto_archived',
      details: { reason: 'inactive_90_days', archived_at: now },
    }));

    await service.from('group_activity_log').insert(logRows);

    return NextResponse.json({
      success: true,
      archived: inactiveGroups.length,
      groups: inactiveGroups.map((g) => ({ id: g.id, name: g.name })),
      timestamp: now,
    });
  } catch (err) {
    console.error('[GET /api/cron/archive-groups]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
