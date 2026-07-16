import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import { resolveSeriesMeetingLink } from '@/lib/services/groupMeetingLink';

type Params = { params: Promise<{ groupId: string; sessionId: string; occurrenceId: string }> };

// POST /api/groups/[groupId]/sessions/[sessionId]/occurrences/[occurrenceId]
// Backward-compatible join endpoint (same behavior as /join-link): returns the
// SERIES meeting link (group_sessions.meeting_join_url), generating it via the
// tutor's connected provider when there is no valid (< 30-day) cached link.
// No join-window / time gating.
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

    // Access: tutor or approved member.
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
      tutorId: actor.group.tutor_id,
      sessionId,
      occurrenceId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await auditAdminOverride(actor, 'session.occurrence.update', { sessionId, occurrenceId });

    // Best-effort attendance mark for a joining student (non-critical).
    if (!isTutor) {
      try {
        await service.from('group_attendance_records').upsert(
          {
            session_id: occurrenceId,
            student_id: user.id,
            status: 'PRESENT',
            marked_at: new Date().toISOString(),
            marked_by_id: actor.group.tutor_id,
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
    console.error('[POST occurrence join]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/groups/[groupId]/sessions/[sessionId]/occurrences/[occurrenceId]
// Supports:
//   { action: 'restore' } — revert a soft-cancelled occurrence.
//   { title: string | null } — rename a single occurrence (null clears override).
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { groupId, sessionId, occurrenceId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const service = getServiceClient();
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!actor.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const update: Record<string, any> = {};
    if (body?.action === 'restore') {
      update.status = 'upcoming';
      update.cancelled_at = null;
      update.cancellation_note = null;
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'title')) {
      const raw = typeof body.title === 'string' ? body.title.trim() : null;
      update.title = raw && raw.length > 0 ? raw : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No supported fields provided' }, { status: 400 });
    }

    let { error } = await service
      .from('group_session_occurrences')
      .update(update)
      .eq('id', occurrenceId)
      .eq('group_session_id', sessionId);

    if (error && isPatchSchemaMismatch(error) && 'title' in update) {
      const { title: _drop, ...rest } = update;
      if (Object.keys(rest).length === 0) {
        return NextResponse.json({ success: true, warning: 'title column unavailable' });
      }
      ({ error } = await service
        .from('group_session_occurrences')
        .update(rest)
        .eq('id', occurrenceId)
        .eq('group_session_id', sessionId));
    }

    if (error) throw error;

    await auditAdminOverride(actor, 'session.occurrence.update', { sessionId, occurrenceId });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH occurrence]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function isPatchSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
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
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!actor.authorized) {
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

    await auditAdminOverride(actor, 'session.occurrence.delete', { sessionId, occurrenceId });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE occurrence]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
