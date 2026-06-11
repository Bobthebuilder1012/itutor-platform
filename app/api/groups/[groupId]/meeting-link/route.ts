import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from '@/lib/services/videoProviders';
import type { Session, VideoProvider } from '@/lib/types/sessions';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

// GET — students read the cached meeting link for a group they're enrolled in
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const service = getServiceClient();

    // Verify the student is an active member
    const { data: membership } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Also allow the tutor themselves
    const { data: group } = await service
      .from('groups')
      .select('tutor_id, meeting_link')
      .eq('id', groupId)
      .single();

    const isTutor = group?.tutor_id === user.id;
    const isMember = membership && ['approved', 'active'].includes(membership.status);

    if (!isTutor && !isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const link = (group as any)?.meeting_link;
    if (!link) {
      return NextResponse.json({ error: 'No meeting link available yet. Your tutor will generate one before the session.' }, { status: 404 });
    }

    return NextResponse.json({ join_url: link });
  } catch (err) {
    console.error('[GET meeting-link]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/meeting-link
// Returns the current month's cached link, or generates a new one.
// Stored on groups.meeting_link + groups.meeting_link_month ('YYYY-MM').
// If meeting_link_month column doesn't exist yet, falls back to always generating.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const service = getServiceClient();
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    // Try to read cached link + month (meeting_link_month may not exist yet)
    const { data: group } = await service
      .from('groups')
      .select('meeting_link, meeting_link_month')
      .eq('id', groupId)
      .single();

    const cachedLink = (group as any)?.meeting_link;
    const cachedMonth = (group as any)?.meeting_link_month;

    // Return cached link if it's from the current month
    if (cachedLink && cachedMonth === currentMonth) {
      return NextResponse.json({ join_url: cachedLink, cached: true });
    }

    // Get the tutor's connected video provider
    const { data: connection } = await service
      .from('tutor_video_provider_connections')
      .select('provider, connection_status, is_active')
      .eq('tutor_id', user.id)
      .eq('is_active', true)
      .eq('connection_status', 'connected')
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: 'No video provider connected. Go to Settings → Video Setup to connect Google Meet or Zoom.' },
        { status: 422 }
      );
    }

    const provider = connection.provider as VideoProvider;
    const now = new Date();

    const sessionForMeeting = {
      id: `${groupId}-${currentMonth}`,
      booking_id: '',
      tutor_id: user.id,
      student_id: '',
      provider,
      meeting_external_id: null,
      join_url: null,
      scheduled_start_at: now.toISOString(),
      scheduled_end_at: new Date(now.getTime() + 60 * 60000).toISOString(),
      duration_minutes: 60,
      no_show_wait_minutes: 10,
      min_payable_minutes: 30,
      meeting_created_at: null,
      meeting_started_at: null,
      meeting_ended_at: null,
      tutor_marked_no_show_at: null,
      status: 'SCHEDULED',
      charge_scheduled_at: now.toISOString(),
      charged_at: null,
    } as unknown as Session;

    let meetingInfo: Awaited<ReturnType<typeof createMeeting>>;
    try {
      meetingInfo = await createMeeting(sessionForMeeting);
    } catch (tokenErr: any) {
      const msg: string = tokenErr?.message ?? '';
      if (msg.toLowerCase().includes('refresh') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('auth')) {
        return NextResponse.json(
          { error: 'token_expired', reconnectUrl: `/api/auth/google/connect?from=/tutor/classes/${groupId}` },
          { status: 401 }
        );
      }
      throw tokenErr;
    }

    const joinUrl = meetingInfo.join_url;

    if (!joinUrl) {
      return NextResponse.json({ error: 'Meeting provider returned no link' }, { status: 500 });
    }

    // Save back to groups — try with meeting_link_month first, fall back without it
    const updatePayload: Record<string, string> = { meeting_link: joinUrl };
    try {
      await service.from('groups').update({ ...updatePayload, meeting_link_month: currentMonth }).eq('id', groupId);
    } catch {
      await service.from('groups').update(updatePayload).eq('id', groupId);
    }

    return NextResponse.json({ join_url: joinUrl, cached: false });
  } catch (error: any) {
    console.error('[POST /api/groups/[groupId]/meeting-link]', error);
    return NextResponse.json({ error: error?.message ?? 'Failed to generate meeting link' }, { status: 500 });
  }
}
