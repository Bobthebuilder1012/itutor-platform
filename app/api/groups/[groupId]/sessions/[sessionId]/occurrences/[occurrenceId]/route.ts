import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { ensureTutorConnected, createMeeting } from '@/lib/services/videoProviders';

type Params = { params: Promise<{ groupId: string; sessionId: string; occurrenceId: string }> };

// POST /api/groups/[groupId]/sessions/[sessionId]/occurrences/[occurrenceId]
// Backward-compatible join endpoint (same behavior as /join-link).
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

    let { data: occurrence } = await service
      .from('group_session_occurrences')
      .select(`
        id, group_session_id, scheduled_start_at, scheduled_end_at, status,
        meeting_provider, meeting_external_id, meeting_join_url, meeting_created_at
      `)
      .eq('id', occurrenceId)
      .single();

    if (!occurrence) {
      // Fallback 1: latest occurrence for requested session
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
        // Fallback 2: stale sessionId; search all occurrences in group
        const { data: groupSessions } = await service
          .from('group_sessions')
          .select('id')
          .eq('group_id', groupId);

        const groupSessionIds = (groupSessions ?? []).map((s: any) => s.id);
        if (groupSessionIds.length === 0) {
          const { data: directSession } = await service
            .from('group_sessions')
            .select('id, group_id, duration_minutes')
            .eq('id', sessionId)
            .eq('group_id', groupId)
            .single();

          const durationMinutes = directSession?.duration_minutes ?? 60;
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
          const { data: directSession } = await service
            .from('group_sessions')
            .select('id, group_id, duration_minutes')
            .eq('id', sessionId)
            .eq('group_id', groupId)
            .single();

          const durationMinutes = directSession?.duration_minutes ?? 60;
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

    const { data: session } = await service
      .from('group_sessions')
      .select('id, group_id, duration_minutes')
      .eq('id', occurrence.group_session_id)
      .eq('group_id', groupId)
      .single();
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (occurrence.status !== 'upcoming') {
      return NextResponse.json({ error: 'Occurrence is not joinable' }, { status: 400 });
    }

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

    if (occurrence.meeting_join_url) {
      return NextResponse.json({
        provider: occurrence.meeting_provider ?? null,
        join_url: occurrence.meeting_join_url,
        meeting_external_id: occurrence.meeting_external_id ?? null,
        cached: true,
      });
    }

    const now = Date.now();
    const startMs = new Date(occurrence.scheduled_start_at).getTime();
    const endMs = new Date(occurrence.scheduled_end_at).getTime();
    if (now < startMs - 15 * 60 * 1000) {
      return NextResponse.json({ error: 'Join window not open yet' }, { status: 400 });
    }
    if (now > endMs + 30 * 60 * 1000) {
      return NextResponse.json({ error: 'Session has ended' }, { status: 400 });
    }

    const { provider } = await ensureTutorConnected(group.tutor_id);
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
      console.warn(
        '[occurrence join] occurrence cache unavailable; returning generated link without cache',
        cacheError
      );
    }

    return NextResponse.json({
      provider,
      join_url: meeting.join_url,
      meeting_external_id: meeting.meeting_external_id,
      cached: false,
    });
  } catch (err) {
    console.error('[POST occurrence join]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/sessions/[sessionId]/occurrences/[occurrenceId] — cancel one occurrence
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, sessionId, occurrenceId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await service
      .from('group_session_occurrences')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', occurrenceId)
      .eq('group_session_id', sessionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE occurrence]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
