import { NextRequest } from 'next/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from '@/lib/services/videoProviders';
import type { Session, VideoProvider } from '@/lib/types/sessions';

type Params = { params: Promise<{ groupId: string; sessionId: string }> };

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { groupId, sessionId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return fail('Forbidden', 403);

    const service = getServiceClient();

    // Look up the occurrence
    const { data: occurrence, error: occErr } = await service
      .from('group_session_occurrences')
      .select(`
        id, scheduled_start_at,
        session:group_sessions!inner(id, title, duration_minutes, group_id)
      `)
      .eq('id', sessionId)
      .single();

    if (occErr || !occurrence) {
      return fail('Session occurrence not found — make sure this session has a scheduled date.', 404);
    }

    const sessionData = (occurrence as any).session;
    if (sessionData?.group_id !== groupId) {
      return fail('Forbidden', 403);
    }

    // If a meeting link is already stored, return it
    const { data: existing } = await service
      .from('group_session_occurrences')
      .select('meeting_link, meeting_join_url')
      .eq('id', sessionId)
      .single();

    const existingLink = (existing as any)?.meeting_join_url || (existing as any)?.meeting_link;
    if (existingLink) {
      return ok({ meeting_link: existingLink, join_url: existingLink });
    }

    // Get the tutor's connected video provider
    const { data: connection, error: connErr } = await service
      .from('tutor_video_provider_connections')
      .select('provider, connection_status, is_active')
      .eq('tutor_id', user.id)
      .eq('is_active', true)
      .eq('connection_status', 'connected')
      .single();

    if (connErr || !connection) {
      return fail('No video provider connected. Go to Settings → Video Setup to connect Google Meet or Zoom.', 422);
    }

    const provider = connection.provider as VideoProvider;
    const durationMinutes = sessionData?.duration_minutes ?? 60;
    const scheduledAt = occurrence.scheduled_start_at;

    // Build a session-like object for createMeeting
    const sessionForMeeting: Session = {
      id: occurrence.id,
      booking_id: '',
      tutor_id: user.id,
      student_id: '',
      provider,
      meeting_external_id: null,
      join_url: null,
      scheduled_start_at: scheduledAt,
      scheduled_end_at: new Date(new Date(scheduledAt).getTime() + durationMinutes * 60000).toISOString(),
      duration_minutes: durationMinutes,
      no_show_wait_minutes: 10,
      min_payable_minutes: 30,
      meeting_created_at: null,
      meeting_started_at: null,
      meeting_ended_at: null,
      tutor_marked_no_show_at: null,
      status: 'SCHEDULED',
      charge_scheduled_at: scheduledAt,
      charged_at: null,
    } as any;

    // Generate the meeting via real OAuth
    const meetingInfo = await createMeeting(sessionForMeeting);

    // Save the link back to the occurrence
    await service
      .from('group_session_occurrences')
      .update({
        meeting_link: meetingInfo.join_url,
        meeting_platform: provider,
        meeting_join_url: meetingInfo.join_url,
      })
      .eq('id', occurrence.id);

    return ok({ meeting_link: meetingInfo.join_url, join_url: meetingInfo.join_url });
  } catch (error: any) {
    console.error('[POST meeting-link]', error);
    return fail(error?.message ?? 'Failed to generate meeting link', 500);
  }
}
