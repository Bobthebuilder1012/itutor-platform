import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from '@/lib/services/videoProviders';
import { isLinkStillValid } from '@/lib/utils/meetingLink';
import { readClassLinkState, canSeeClassLink } from '@/lib/classes/classLinkState';
import type { Session, VideoProvider } from '@/lib/types/sessions';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

/**
 * Custom mode's answer to "give me the join link": the tutor's own link, or a
 * plain explanation of why there is none. It never falls back to minting a Meet
 * link — a tutor who chose their own room has said students should not land in
 * a different one.
 */
function customLinkResponse(link: string | null) {
  if (link) return NextResponse.json({ join_url: link, cached: true, mode: 'custom' });
  return NextResponse.json(
    {
      error: "This class uses your own class link, but none is saved yet. Add it on the class's Sessions tab.",
      code: 'no_class_link',
    },
    { status: 422 },
  );
}

// GET — the class link, for the tutor, a superadmin acting as tutor, or a
// student enrolled in the class. canSeeClassLink is the one rule every surface
// uses; the check this replaced looked only at group_members, so a student who
// enrolled by paying (group_enrollments only, no group_members row) was told
// Forbidden by their own class's Join button.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const service = getServiceClient();

    const state = await readClassLinkState(service, groupId);
    const allowed = await canSeeClassLink(
      service,
      { userId: user.id, email: user.email },
      { groupId, tutorId: state.tutorId },
    );
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!state.link) {
      return NextResponse.json({ error: "Your tutor hasn't shared the class link yet." }, { status: 404 });
    }

    return NextResponse.json({ join_url: state.link });
  } catch (err) {
    console.error('[GET meeting-link]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/meeting-link — the tutor's Join.
//
// Custom mode: returns the tutor's own link as it is. No provider is checked
// and nothing is generated.
//
// Generated mode: returns the cached Meet / Zoom link if it was generated less
// than 30 days ago, otherwise generates a fresh one. Stored on
// groups.meeting_link + the generated-at timestamp groups.meeting_link_generated_at
// (migration 188). If that column doesn't exist yet, falls back to reusing any
// stored link.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const service = getServiceClient();

    // Tolerant read: on a database without migration 262 there is no mode
    // column and every class is in 'generated' mode, which is what they all
    // were before it. See lib/classes/classLinkState.ts.
    const state = await readClassLinkState(service, groupId);
    if (!state.found || !state.tutorId) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    if (state.mode === 'custom') return customLinkResponse(state.link);

    // Reuse the cached link for 30 days from when it was generated. When the
    // generated-at timestamp is missing (pre-migration rows) keep reusing any
    // stored link rather than minting a new one on every click.
    const stillValid = state.generatedAt ? isLinkStillValid(state.generatedAt) : Boolean(state.link);
    if (state.link && stillValid) {
      return NextResponse.json({ join_url: state.link, cached: true, mode: 'generated' });
    }

    // The meeting is hosted on the CLASS'S TUTOR's account, not the caller's.
    // requireGroupOwner also admits a superadmin acting as tutor, and minting
    // on their account would put the admin's Google identity on a room every
    // student of the class then joins — and leave the class dependent on an
    // account that has nothing to do with it.
    const tutorId = state.tutorId;
    const actingForTutor = tutorId !== user.id;

    // Get the tutor's connected video provider
    const { data: connection } = await service
      .from('tutor_video_provider_connections')
      .select('provider, connection_status, is_active')
      .eq('tutor_id', tutorId)
      .eq('is_active', true)
      .eq('connection_status', 'connected')
      .single();

    if (!connection) {
      return NextResponse.json(
        {
          error: actingForTutor
            ? "This class's tutor has no video provider connected, so a meeting link can't be generated for them."
            : 'No video provider connected. Go to Settings → Video Setup to connect Google Meet or Zoom.',
        },
        { status: 422 }
      );
    }

    const provider = connection.provider as VideoProvider;
    const now = new Date();

    const sessionForMeeting = {
      id: `group-${groupId}-meeting`,
      booking_id: '',
      tutor_id: tutorId,
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
      // A superadmin acting as tutor can't reconnect on the tutor's behalf:
      // /connect requires the tutor role, and would bind the admin's own
      // account even if it didn't. Say what has to happen instead.
      if (actingForTutor) {
        return NextResponse.json(
          {
            error: `This class's tutor needs to reconnect ${provider === 'zoom' ? 'Zoom' : 'Google Meet'} before a link can be generated.`,
          },
          { status: 422 },
        );
      }
      // Any failure generating the meeting link means the provider needs
      // reconnecting. The reconnect comes back to this class's Sessions tab —
      // where the tutor pressed Join — rather than to the class's first tab,
      // and the path is encoded so its ?tab= survives as part of `from`.
      const from = encodeURIComponent(`/tutor/classes/${groupId}?tab=sessions`);
      const connectPath = provider === 'zoom' ? '/api/auth/zoom/connect' : '/api/auth/google/connect';
      return NextResponse.json(
        { error: 'token_expired', reconnectUrl: `${connectPath}?from=${from}` },
        { status: 401 }
      );
    }

    const joinUrl = meetingInfo.join_url;

    if (!joinUrl) {
      return NextResponse.json({ error: 'Meeting provider returned no link' }, { status: 500 });
    }

    // Persist the link + generated-at so students can read it and the 30-day
    // reuse window is anchored.
    const nowIso = new Date().toISOString();

    if (state.modeColumn) {
      // Conditional on the class still being in generated mode. Minting a
      // meeting takes a provider round trip, and a tutor who switched the class
      // to their own link in that window must not have it overwritten by a Meet
      // link they have just said they don't want. Every database with the mode
      // column (262) also has meeting_link_generated_at (188).
      const saved = await service
        .from('groups')
        .update({ meeting_link: joinUrl, meeting_link_generated_at: nowIso })
        .eq('id', groupId)
        .eq('meeting_link_mode', 'generated')
        .select('id');
      if (saved.error) {
        console.error('[POST meeting-link] failed to persist meeting_link', saved.error);
        return NextResponse.json({ error: 'Failed to save meeting link' }, { status: 500 });
      }
      if ((saved.data ?? []).length === 0) {
        // Nothing matched: the class switched to custom mode meanwhile. The
        // tutor's own link is the answer now; the minted meeting is discarded.
        const latest = await readClassLinkState(service, groupId);
        if (!latest.found) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        if (latest.mode === 'custom') return customLinkResponse(latest.link);
        // Back in generated mode with no row matched is not a state we can
        // explain; don't hand out a link nobody else will see.
        return NextResponse.json({ error: 'Failed to save meeting link' }, { status: 500 });
      }
      return NextResponse.json({ join_url: joinUrl, cached: false, mode: 'generated' });
    }

    // No mode column (pre-262), so no custom mode to race with.
    // meeting_link_generated_at may not exist yet either; supabase-js returns an
    // { error } object (it does NOT throw), so check .error explicitly and fall
    // back to saving just the link — otherwise the link is silently never
    // persisted and students never receive it.
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

    return NextResponse.json({ join_url: joinUrl, cached: false, mode: 'generated' });
  } catch (error: any) {
    console.error('[POST /api/groups/[groupId]/meeting-link]', error);
    return NextResponse.json({ error: error?.message ?? 'Failed to generate meeting link' }, { status: 500 });
  }
}
