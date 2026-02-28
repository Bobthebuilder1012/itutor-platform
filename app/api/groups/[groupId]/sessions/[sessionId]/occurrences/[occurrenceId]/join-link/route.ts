import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { ensureTutorConnected, createMeeting } from '@/lib/services/videoProviders';

type Params = {
  params: Promise<{ groupId: string; sessionId: string; occurrenceId: string }>;
};

// POST /api/groups/[groupId]/sessions/[sessionId]/occurrences/[occurrenceId]/join-link
// Creates a meeting using the tutor's configured provider (Zoom/Google Meet) and returns a join URL.
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

    // Access: tutor or approved member
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

    // Session-level cache first: if this session already has a provider link, reuse it.
    const { data: requestedSessionCache } = await service
      .from('group_sessions')
      .select('id, meeting_provider, meeting_external_id, meeting_join_url, duration_minutes')
      .eq('id', sessionId)
      .eq('group_id', groupId)
      .maybeSingle();
    if (requestedSessionCache?.meeting_join_url) {
      return NextResponse.json({
        provider: requestedSessionCache.meeting_provider ?? null,
        join_url: requestedSessionCache.meeting_join_url,
        meeting_external_id: requestedSessionCache.meeting_external_id ?? null,
        cached: true,
        cache_level: 'session',
      });
    }

    // Resolve occurrence first (by ID only) to avoid false negatives from stale/mismatched sessionId in URL.
    let { data: occurrence, error: occError } = await service
      .from('group_session_occurrences')
      .select(`
        id, group_session_id, scheduled_start_at, scheduled_end_at, status,
        meeting_provider, meeting_external_id, meeting_join_url, meeting_created_at
      `)
      .eq('id', occurrenceId)
      .single();

    // Fallback: if this exact occurrence id no longer exists, use the next upcoming occurrence
    // for the URL session. This handles stale client data after session edits/regeneration.
    if (occError || !occurrence) {
      // Fallback 1: look up latest occurrence for requested session
      const { data: fallbackOccurrence } = await service
        .from('group_session_occurrences')
        .select(`
          id, group_session_id, scheduled_start_at, scheduled_end_at, status,
          meeting_provider, meeting_external_id, meeting_join_url, meeting_created_at
        `)
        .eq('group_session_id', sessionId)
        .order('scheduled_start_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallbackOccurrence) {
        occurrence = fallbackOccurrence;
      } else {
        // Fallback 2: stale sessionId; search all occurrences within this group
        const { data: groupSessions } = await service
          .from('group_sessions')
          .select('id')
          .eq('group_id', groupId);

        const groupSessionIds = (groupSessions ?? []).map((s: any) => s.id);
        if (groupSessionIds.length === 0) {
          // Last-resort fallback: generate a meeting from session context even when occurrence IDs are stale.
          const { data: directSession } = await service
            .from('group_sessions')
            .select('id, group_id, duration_minutes, meeting_provider, meeting_external_id, meeting_join_url')
            .eq('id', sessionId)
            .eq('group_id', groupId)
            .single();

          const durationMinutes = directSession?.duration_minutes ?? 60;
          if (directSession?.meeting_join_url) {
            return NextResponse.json({
              provider: directSession.meeting_provider ?? null,
              join_url: directSession.meeting_join_url,
              meeting_external_id: directSession.meeting_external_id ?? null,
              cached: true,
              cache_level: 'session',
            });
          }
          const { provider } = await ensureTutorConnected(group.tutor_id);
          const syntheticStart = new Date();
          const syntheticEnd = new Date(syntheticStart.getTime() + durationMinutes * 60 * 1000);
          const meeting = await createMeeting({
            id: `group-session-fallback-${directSession?.id ?? sessionId}`,
            booking_id: `group-${groupId}`,
            tutor_id: group.tutor_id,
            student_id: user.id,
            provider,
            meeting_external_id: null,
            join_url: null,
            scheduled_start_at: syntheticStart.toISOString(),
            scheduled_end_at: syntheticEnd.toISOString(),
            duration_minutes: durationMinutes,
            no_show_wait_minutes: 0,
            min_payable_minutes: 0,
            meeting_created_at: null,
            meeting_started_at: null,
            meeting_ended_at: null,
            tutor_marked_no_show_at: null,
            status: 'SCHEDULED',
            charge_scheduled_at: syntheticEnd.toISOString(),
            charged_at: null,
            charge_amount_ttd: 0,
            payout_amount_ttd: 0,
            platform_fee_ttd: 0,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any);

          const { error: sessionCacheError } = await service
            .from('group_sessions')
            .update({
              meeting_provider: provider,
              meeting_external_id: meeting.meeting_external_id,
              meeting_join_url: meeting.join_url,
              meeting_created_at: meeting.meeting_created_at,
            })
            .eq('id', directSession?.id ?? sessionId)
            .eq('group_id', groupId);

          if (sessionCacheError) {
            console.error('[join-link] failed to cache session fallback meeting link', sessionCacheError);
            return NextResponse.json(
              { error: 'Session meeting cache is not configured. Please run migration 090_group_session_meeting_cache.sql.' },
              { status: 500 }
            );
          }

          return NextResponse.json({
            provider,
            join_url: meeting.join_url,
            meeting_external_id: meeting.meeting_external_id,
            cached: false,
          });
        }

        const { data: groupFallbackOccurrence } = await service
          .from('group_session_occurrences')
          .select(`
            id, group_session_id, scheduled_start_at, scheduled_end_at, status,
            meeting_provider, meeting_external_id, meeting_join_url, meeting_created_at
          `)
          .in('group_session_id', groupSessionIds)
          .order('scheduled_start_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!groupFallbackOccurrence) {
          // Last-resort fallback: generate a meeting from session context even when occurrence IDs are stale.
          const { data: directSession } = await service
            .from('group_sessions')
            .select('id, group_id, duration_minutes, meeting_provider, meeting_external_id, meeting_join_url')
            .eq('id', sessionId)
            .eq('group_id', groupId)
            .single();

          const durationMinutes = directSession?.duration_minutes ?? 60;
          if (directSession?.meeting_join_url) {
            return NextResponse.json({
              provider: directSession.meeting_provider ?? null,
              join_url: directSession.meeting_join_url,
              meeting_external_id: directSession.meeting_external_id ?? null,
              cached: true,
              cache_level: 'session',
            });
          }
          const { provider } = await ensureTutorConnected(group.tutor_id);
          const syntheticStart = new Date();
          const syntheticEnd = new Date(syntheticStart.getTime() + durationMinutes * 60 * 1000);
          const meeting = await createMeeting({
            id: `group-session-fallback-${directSession?.id ?? sessionId}`,
            booking_id: `group-${groupId}`,
            tutor_id: group.tutor_id,
            student_id: user.id,
            provider,
            meeting_external_id: null,
            join_url: null,
            scheduled_start_at: syntheticStart.toISOString(),
            scheduled_end_at: syntheticEnd.toISOString(),
            duration_minutes: durationMinutes,
            no_show_wait_minutes: 0,
            min_payable_minutes: 0,
            meeting_created_at: null,
            meeting_started_at: null,
            meeting_ended_at: null,
            tutor_marked_no_show_at: null,
            status: 'SCHEDULED',
            charge_scheduled_at: syntheticEnd.toISOString(),
            charged_at: null,
            charge_amount_ttd: 0,
            payout_amount_ttd: 0,
            platform_fee_ttd: 0,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any);

          const { error: sessionCacheError } = await service
            .from('group_sessions')
            .update({
              meeting_provider: provider,
              meeting_external_id: meeting.meeting_external_id,
              meeting_join_url: meeting.join_url,
              meeting_created_at: meeting.meeting_created_at,
            })
            .eq('id', directSession?.id ?? sessionId)
            .eq('group_id', groupId);

          if (sessionCacheError) {
            console.error('[join-link] failed to cache session fallback meeting link', sessionCacheError);
            return NextResponse.json(
              { error: 'Session meeting cache is not configured. Please run migration 090_group_session_meeting_cache.sql.' },
              { status: 500 }
            );
          }

          return NextResponse.json({
            provider,
            join_url: meeting.join_url,
            meeting_external_id: meeting.meeting_external_id,
            cached: false,
          });
        }

        occurrence = groupFallbackOccurrence;
      }
    }

    // Validate parent session belongs to this group and derive duration from actual parent session.
    const { data: session, error: sessionError } = await service
      .from('group_sessions')
      .select('id, group_id, duration_minutes, meeting_provider, meeting_external_id, meeting_join_url')
      .eq('id', occurrence.group_session_id)
      .eq('group_id', groupId)
      .single();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Optional consistency check: if URL sessionId doesn't match actual parent, continue with canonical parent.
    if (sessionId !== occurrence.group_session_id) {
      // Continue with canonical parent session from occurrence.
    }
    if (occurrence.status !== 'upcoming') {
      return NextResponse.json({ error: 'Occurrence is not joinable' }, { status: 400 });
    }

    // Reuse any cached link for the whole session to keep tutor/student on one room.
    const { data: sessionCachedOccurrence } = await service
      .from('group_session_occurrences')
      .select('meeting_provider, meeting_external_id, meeting_join_url')
      .eq('group_session_id', session.id)
      .not('meeting_join_url', 'is', null)
      .order('scheduled_start_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionCachedOccurrence?.meeting_join_url) {
      return NextResponse.json({
        provider: sessionCachedOccurrence.meeting_provider ?? null,
        join_url: sessionCachedOccurrence.meeting_join_url,
        meeting_external_id: sessionCachedOccurrence.meeting_external_id ?? null,
        cached: true,
      });
    }

    // Reuse existing cached link for this occurrence so everyone joins the same room.
    if (occurrence.meeting_join_url) {
      return NextResponse.json({
        provider: occurrence.meeting_provider ?? null,
        join_url: occurrence.meeting_join_url,
        meeting_external_id: occurrence.meeting_external_id ?? null,
        cached: true,
      });
    }

    // Enforce join window: 15 min before start until 30 min after end
    const now = Date.now();
    const startMs = new Date(occurrence.scheduled_start_at).getTime();
    const endMs = new Date(occurrence.scheduled_end_at).getTime();
    if (now < startMs - 15 * 60 * 1000) {
      return NextResponse.json({ error: 'Join window not open yet' }, { status: 400 });
    }
    if (now > endMs + 30 * 60 * 1000) {
      return NextResponse.json({ error: 'Session has ended' }, { status: 400 });
    }

    // Use tutor's configured provider
    const { provider } = await ensureTutorConnected(group.tutor_id);

    // Create provider-native meeting on demand
    const meeting = await createMeeting({
      id: `group-occ-${occurrence.id}`,
      booking_id: `group-${groupId}`,
      tutor_id: group.tutor_id,
      student_id: user.id,
      provider,
      meeting_external_id: null,
      join_url: null,
      scheduled_start_at: occurrence.scheduled_start_at,
      scheduled_end_at: occurrence.scheduled_end_at,
      duration_minutes: session.duration_minutes,
      no_show_wait_minutes: 0,
      min_payable_minutes: 0,
      meeting_created_at: null,
      meeting_started_at: null,
      meeting_ended_at: null,
      tutor_marked_no_show_at: null,
      status: 'SCHEDULED',
      charge_scheduled_at: occurrence.scheduled_end_at,
      charged_at: null,
      charge_amount_ttd: 0,
      payout_amount_ttd: 0,
      platform_fee_ttd: 0,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    // Cache the link on the occurrence so tutor + all students receive the same URL.
    const { error: cacheError } = await service
      .from('group_session_occurrences')
      .update({
        meeting_provider: provider,
        meeting_external_id: meeting.meeting_external_id,
        meeting_join_url: meeting.join_url,
        meeting_created_at: meeting.meeting_created_at,
      })
      .eq('id', occurrence.id);

    if (cacheError) {
      console.error('[join-link] cache update failed', cacheError);
      return NextResponse.json(
        { error: 'Meeting link cache missing. Run migration 089_group_occurrence_meeting_cache.sql.' },
        { status: 500 }
      );
    }

    // Also cache at session level to guarantee single link in stale-ID fallbacks.
    const { error: sessionCacheError } = await service
      .from('group_sessions')
      .update({
        meeting_provider: provider,
        meeting_external_id: meeting.meeting_external_id,
        meeting_join_url: meeting.join_url,
        meeting_created_at: meeting.meeting_created_at,
      })
      .eq('id', session.id)
      .eq('group_id', groupId);
    if (sessionCacheError) {
      console.error('[join-link] failed to cache session-level meeting link', sessionCacheError);
      return NextResponse.json(
        { error: 'Session meeting cache is not configured. Please run migration 090_group_session_meeting_cache.sql.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      provider,
      join_url: meeting.join_url,
      meeting_external_id: meeting.meeting_external_id,
      cached: false,
    });
  } catch (err) {
    console.error('[POST /api/groups/.../join-link]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

