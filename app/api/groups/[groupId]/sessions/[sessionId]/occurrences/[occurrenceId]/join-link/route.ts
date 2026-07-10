import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveSeriesMeetingLink } from '@/lib/services/groupMeetingLink';

type Params = {
  params: Promise<{ groupId: string; sessionId: string; occurrenceId: string }>;
};

// POST /api/groups/[groupId]/sessions/[sessionId]/occurrences/[occurrenceId]/join-link
// Returns the SERIES meeting link (group_sessions.meeting_join_url), generating
// it via the tutor's connected provider when there is no valid (< 30-day)
// cached link. There is NO join-window / time gating — a present, valid link is
// joinable at any time. Callable by the tutor or any approved member.
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, sessionId, occurrenceId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    const { data: group, error: groupError } = await service
      .from('groups')
      .select('id, tutor_id')
      .eq('id', groupId)
      .single();
    if (groupError || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Access: tutor or approved member.
    const isTutor = group.tutor_id === user.id;
    if (!isTutor) {
      const { data: membership } = await service
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();
      if (!membership || membership.status !== 'approved') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const result = await resolveSeriesMeetingLink({
      groupId,
      tutorId: group.tutor_id,
      sessionId,
      occurrenceId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Best-effort attendance mark for a joining student (non-critical).
    if (!isTutor) {
      try {
        await service.from('group_attendance_records').upsert(
          {
            session_id: occurrenceId,
            student_id: user.id,
            status: 'PRESENT',
            marked_at: new Date().toISOString(),
            marked_by_id: group.tutor_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'session_id,student_id' }
        );
      } catch {
        // Attendance table may not exist in every environment.
      }
    }

    return NextResponse.json({
      provider: result.provider,
      join_url: result.join_url,
      meeting_external_id: result.meeting_external_id,
      cached: result.cached,
    });
  } catch (err) {
    console.error('[POST /api/groups/.../join-link]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
