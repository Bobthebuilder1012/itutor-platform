import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ sessions: [] }, { status: 401 });

    const service = getServiceClient();
    const now = new Date().toISOString();

    // Get tutor's groups
    const { data: groups } = await service
      .from('groups')
      .select('id, name, subject, meeting_link')
      .eq('tutor_id', user.id)
      .is('archived_at', null);

    if (!groups?.length) return NextResponse.json({ sessions: [] });

    const groupIds = groups.map((g: any) => g.id);
    const groupMap = new Map(groups.map((g: any) => [g.id, g]));

    // Get sessions for those groups
    const { data: groupSessions } = await service
      .from('group_sessions')
      .select('id, group_id, duration_minutes')
      .in('group_id', groupIds);

    if (!groupSessions?.length) return NextResponse.json({ sessions: [] });

    const sessionIds = groupSessions.map((s: any) => s.id);
    const sessionMap = new Map(groupSessions.map((s: any) => [s.id, s]));

    // Get upcoming occurrences
    const { data: occs } = await service
      .from('group_session_occurrences')
      .select('id, scheduled_start_at, group_session_id')
      .in('group_session_id', sessionIds)
      .gte('scheduled_start_at', now)
      .order('scheduled_start_at', { ascending: true })
      .limit(10);

    const sessions = (occs ?? []).map((o: any) => {
      const s = sessionMap.get(o.group_session_id);
      const g = groupMap.get(s?.group_id);
      return {
        id: o.id,
        date: o.scheduled_start_at,
        className: g?.name ?? 'Class',
        durationMin: s?.duration_minutes ?? 60,
        joinUrl: g?.meeting_link ?? null,
        groupId: g?.id ?? null,
      };
    }).filter((s: any) => s.groupId);

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('[GET /api/tutor/upcoming-class-sessions]', err);
    return NextResponse.json({ sessions: [] });
  }
}
