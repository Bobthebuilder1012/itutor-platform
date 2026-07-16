import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { resolveGroupActor } from '@/lib/auth/groupAccess';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from '@/lib/services/videoProviders';
import { isLinkStillValid } from '@/lib/utils/meetingLink';
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

    // Also allow the tutor themselves (or a superadmin acting as tutor)
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email, columns: 'meeting_link' });
    const group = actor.group;
    const isTutor = actor.actingAsTutor;
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
// Returns the cached link if it was generated less than 30 days ago, otherwise
// generates a fresh one. Stored on groups.meeting_link + the generated-at
// timestamp groups.meeting_link_generated_at (migration 188). If that column
// doesn't exist yet, falls back to reusing any stored link.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const service = getServiceClient();

    // Read cached link + when it was generated. meeting_link_generated_at may
    // not exist yet, in which case the combined select returns an error object
    // (PostgREST does NOT throw) — so fall back to reading meeting_link alone.
    let cachedLink: string | null = null;
    let cachedGeneratedAt: string | null = null;
    const cacheRead = await service
      .from('groups')
      .select('meeting_link, meeting_link_generated_at')
      .eq('id', groupId)
      .single();
    if (cacheRead.error) {
      const base = await service.from('groups').select('meeting_link').eq('id', groupId).single();
      cachedLink = (base.data as any)?.meeting_link ?? null;
    } else {
      cachedLink = (cacheRead.data as any)?.meeting_link ?? null;
      cachedGeneratedAt = (cacheRead.data as any)?.meeting_link_generated_at ?? null;
    }

    // Reuse the cached link for 30 days from when it was generated. When the
    // generated-at timestamp is missing (pre-migration rows) keep reusing any
    // stored link rather than minting a new one on every click.
    const stillValid = cachedGeneratedAt ? isLinkStillValid(cachedGeneratedAt) : Boolean(cachedLink);
    if (cachedLink && stillValid) {
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
      id: `group-${groupId}-meeting`,
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
      // Any failure generating the meeting link means the provider needs reconnecting
      return NextResponse.json(
        { error: 'token_expired', reconnectUrl: `/api/auth/google/connect?from=/tutor/classes/${groupId}` },
        { status: 401 }
      );
    }

    const joinUrl = meetingInfo.join_url;

    if (!joinUrl) {
      return NextResponse.json({ error: 'Meeting provider returned no link' }, { status: 500 });
    }

    // Persist the link + generated-at so students can read it and the 30-day
    // reuse window is anchored. meeting_link_generated_at may not exist yet;
    // supabase-js returns an { error } object (it does NOT throw), so check
    // .error explicitly and fall back to saving just the link — otherwise the
    // link is silently never persisted and students never receive it.
    const nowIso = new Date().toISOString();
    const withTs = await service
      .from('groups')
      .update({ meeting_link: joinUrl, meeting_link_generated_at: nowIso })
      .eq('id', groupId);
    if (withTs.error) {
      const baseSave = await service.from('groups').update({ meeting_link: joinUrl }).eq('id', groupId);
      if (baseSave.error) {
        console.error('[POST meeting-link] failed to persist meeting_link', baseSave.error);
        return NextResponse.json({ error: 'Failed to save meeting link' }, { status: 500 });
      }
    }

    return NextResponse.json({ join_url: joinUrl, cached: false });
  } catch (error: any) {
    console.error('[POST /api/groups/[groupId]/meeting-link]', error);
    return NextResponse.json({ error: error?.message ?? 'Failed to generate meeting link' }, { status: 500 });
  }
}
