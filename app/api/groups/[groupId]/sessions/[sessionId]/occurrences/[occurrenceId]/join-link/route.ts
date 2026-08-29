import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor } from '@/lib/auth/groupAccess';
import { resolveSeriesMeetingLink } from '@/lib/services/groupMeetingLink';
import { recordStudentJoin, recordTutorJoin } from '@/lib/server/attendance';

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

    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    const group = actor.group;

    // Access: tutor (or superadmin acting as tutor) or approved member.
    const isTutor = actor.actingAsTutor;
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
      // Click-based attendance (mig 196), now with the §6 derived status
      // (mig 220). The scheduled start comes from the occurrence itself, so
      // attended-vs-late is decided against the real timetable.
      try {
        const { data: occ } = await service
          .from('group_session_occurrences')
          .select('scheduled_start_at')
          .eq('id', occurrenceId)
          .maybeSingle();

        if (occ?.scheduled_start_at) {
          await recordStudentJoin(service, {
            studentId: user.id,
            occurrenceType: 'group_occurrence',
            occurrenceId,
            groupId,
            scheduledStart: occ.scheduled_start_at,
            joinSource: 'group-join-link',
          });
        }
      } catch { /* non-critical */ }
    } else {
      // §6 tutor-absent guard: this is the tutor's own join event, and the only
      // record that the session actually happened. Without it every student in a
      // class the tutor never opened is marked absent — silently, and against
      // the party at no fault. Recorded for the acting tutor (a superadmin
      // acting as tutor is deliberately attributed to the tutor, since what is
      // being recorded is that the class ran).
      try {
        await recordTutorJoin(service, {
          tutorId: group.tutor_id,
          occurrenceType: 'group_occurrence',
          occurrenceId,
          groupId,
          joinSource: 'group-join-link',
        });
      } catch { /* non-critical */ }
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
