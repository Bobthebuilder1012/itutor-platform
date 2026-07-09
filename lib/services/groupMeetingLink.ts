// =====================================================
// GROUP (Groups/Lessons) SERIES MEETING LINK
// =====================================================
// One meeting link per SERIES (group_sessions row), reused for 30 days.
//
//  - The canonical link lives on group_sessions.meeting_join_url (+ provider,
//    external id, and meeting_link_generated_at). Per-occurrence copies on
//    group_session_occurrences are no longer read or written.
//  - A cached link is returned unchanged while it is < 30 days old
//    (isLinkStillValid). Older than that → a fresh provider meeting is created
//    and the series row is overwritten.
//  - There is NO join-window / time-proximity gating: a present, valid link is
//    joinable at any time.
//
// Used by both the /join-link route and the backward-compatible occurrence
// join route so there is a single source of truth for link resolution.

import { getServiceClient } from '@/lib/supabase/server';
import { ensureTutorConnected, createMeeting } from '@/lib/services/videoProviders';
import { isLinkStillValid } from '@/lib/utils/meetingLink';
import type { Session, VideoProvider } from '@/lib/types/sessions';

export type SeriesLinkResult =
  | { ok: true; join_url: string; provider: string | null; meeting_external_id: string | null; cached: boolean }
  | { ok: false; status: number; error: string };

// meeting_link_generated_at (migration 188) and the cache columns (migration
// 090) may not exist on every environment yet. supabase-js returns an { error }
// object (it does NOT throw) when a column is missing, so every select/update
// that references those columns falls back to a legacy variant on mismatch.
function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205' ||
    msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')
  );
}

const SERIES_COLS =
  'id, group_id, duration_minutes, meeting_provider, meeting_external_id, meeting_join_url, meeting_created_at, meeting_link_generated_at';
const SERIES_COLS_LEGACY =
  'id, group_id, duration_minutes, meeting_provider, meeting_external_id, meeting_join_url, meeting_created_at';

type SeriesRow = {
  id: string;
  group_id: string;
  duration_minutes: number | null;
  meeting_provider: string | null;
  meeting_external_id: string | null;
  meeting_join_url: string | null;
  meeting_created_at: string | null;
  meeting_link_generated_at?: string | null;
};

async function loadSeriesById(
  service: ReturnType<typeof getServiceClient>,
  seriesId: string,
  groupId: string,
): Promise<SeriesRow | null> {
  let res = await service
    .from('group_sessions')
    .select(SERIES_COLS)
    .eq('id', seriesId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (res.error && isSchemaMismatch(res.error)) {
    res = await service
      .from('group_sessions')
      .select(SERIES_COLS_LEGACY)
      .eq('id', seriesId)
      .eq('group_id', groupId)
      .maybeSingle();
  }
  return (res.data as SeriesRow | null) ?? null;
}

async function loadPrimarySeries(
  service: ReturnType<typeof getServiceClient>,
  groupId: string,
): Promise<SeriesRow | null> {
  let res = await service
    .from('group_sessions')
    .select(SERIES_COLS)
    .eq('group_id', groupId)
    .order('starts_on', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (res.error && isSchemaMismatch(res.error)) {
    res = await service
      .from('group_sessions')
      .select(SERIES_COLS_LEGACY)
      .eq('group_id', groupId)
      .order('starts_on', { ascending: true })
      .limit(1)
      .maybeSingle();
  }
  return (res.data as SeriesRow | null) ?? null;
}

/**
 * Resolve (and if needed generate + persist) the series-level meeting link for
 * a group. `sessionId` is the group_sessions (series) id; `occurrenceId` is
 * used only to recover the series when `sessionId` is stale/missing.
 */
export async function resolveSeriesMeetingLink(opts: {
  groupId: string;
  tutorId: string;
  sessionId?: string | null;
  occurrenceId?: string | null;
}): Promise<SeriesLinkResult> {
  const { groupId, tutorId, sessionId, occurrenceId } = opts;
  const service = getServiceClient();

  // Resolve the series row: by sessionId, else via the occurrence's parent,
  // else the group's earliest series (handles stale ids after edits).
  let series: SeriesRow | null = sessionId ? await loadSeriesById(service, sessionId, groupId) : null;
  if (!series && occurrenceId) {
    const { data: occ } = await service
      .from('group_session_occurrences')
      .select('group_session_id')
      .eq('id', occurrenceId)
      .maybeSingle();
    const parentId = (occ as { group_session_id?: string } | null)?.group_session_id;
    if (parentId) series = await loadSeriesById(service, parentId, groupId);
  }
  if (!series) series = await loadPrimarySeries(service, groupId);
  if (!series) return { ok: false, status: 404, error: 'Session not found' };

  // 30-day cache: reuse an existing link while it is still valid. Fall back to
  // meeting_created_at when meeting_link_generated_at is not populated yet.
  const generatedAt = series.meeting_link_generated_at ?? series.meeting_created_at ?? null;
  if (series.meeting_join_url && isLinkStillValid(generatedAt)) {
    return {
      ok: true,
      join_url: series.meeting_join_url,
      provider: series.meeting_provider ?? null,
      meeting_external_id: series.meeting_external_id ?? null,
      cached: true,
    };
  }

  // Generate a fresh provider meeting under the tutor's connected account.
  let provider: VideoProvider;
  try {
    ({ provider } = await ensureTutorConnected(tutorId));
  } catch {
    return {
      ok: false,
      status: 422,
      error:
        'The tutor has not connected a video provider (Zoom or Google Meet). Please connect one in Settings before joining.',
    };
  }

  const durationMinutes = series.duration_minutes ?? 60;
  const start = new Date();
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  let meeting: Awaited<ReturnType<typeof createMeeting>>;
  try {
    meeting = await createMeeting({
      id: `group-series-${series.id}`,
      booking_id: `group-${groupId}`,
      tutor_id: tutorId,
      student_id: '',
      provider,
      meeting_external_id: null,
      join_url: null,
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
      duration_minutes: durationMinutes,
      no_show_wait_minutes: 0,
      min_payable_minutes: 0,
      meeting_created_at: null,
      meeting_started_at: null,
      meeting_ended_at: null,
      tutor_marked_no_show_at: null,
      status: 'SCHEDULED',
      charge_scheduled_at: end.toISOString(),
      charged_at: null,
    } as unknown as Session);
  } catch (err: any) {
    const message = String(err?.message ?? '');
    if (message.includes('No video provider') || message.includes('needs reauth') || message.includes('reconnect')) {
      return {
        ok: false,
        status: 422,
        error:
          'The tutor has not connected a video provider (Zoom or Google Meet). Please connect one in Settings before joining.',
      };
    }
    console.error('[groupMeetingLink] createMeeting failed', err);
    return { ok: false, status: 500, error: 'Failed to generate meeting link' };
  }

  if (!meeting.join_url) {
    return { ok: false, status: 500, error: 'Meeting provider returned no link' };
  }

  // Persist onto the SERIES row so tutor + all students resolve one link, with
  // the generated-at timestamp driving the 30-day reuse window.
  const nowIso = new Date().toISOString();
  const fullUpdate = {
    meeting_provider: provider,
    meeting_external_id: meeting.meeting_external_id,
    meeting_join_url: meeting.join_url,
    meeting_created_at: meeting.meeting_created_at,
    meeting_link_generated_at: nowIso,
  };
  let up = await service.from('group_sessions').update(fullUpdate).eq('id', series.id).eq('group_id', groupId);
  if (up.error && isSchemaMismatch(up.error)) {
    const { meeting_link_generated_at: _drop, ...legacy } = fullUpdate;
    up = await service.from('group_sessions').update(legacy).eq('id', series.id).eq('group_id', groupId);
  }
  if (up.error) {
    // Non-fatal: the link was generated; caching just isn't available on this
    // environment. Returning it still lets everyone join the same room now.
    console.warn('[groupMeetingLink] series cache write unavailable', up.error);
  }

  return {
    ok: true,
    join_url: meeting.join_url,
    provider,
    meeting_external_id: meeting.meeting_external_id,
    cached: false,
  };
}
