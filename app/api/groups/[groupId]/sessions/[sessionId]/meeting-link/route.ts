import { NextRequest } from 'next/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import { fail, ok } from '@/lib/api/http';
import { resolveSeriesMeetingLink } from '@/lib/services/groupMeetingLink';

type Params = { params: Promise<{ groupId: string; sessionId: string }> };

export const dynamic = 'force-dynamic';

// POST /api/groups/[groupId]/sessions/[sessionId]/meeting-link
// Tutor-only. Returns the SERIES meeting link (group_sessions.meeting_join_url),
// generating it via the tutor's provider when there is no valid (< 30-day)
// cached link. `sessionId` may be a group_sessions id or an occurrence id — the
// series resolver accepts either. Storage is per-series; the old per-occurrence
// copy is no longer written.
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { groupId, sessionId } = await params;
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) return fail('Group not found', 404);
    if (!actor.authorized) return fail('Forbidden', 403);

    const result = await resolveSeriesMeetingLink({
      groupId,
      tutorId: user.id,
      sessionId,
      occurrenceId: sessionId,
    });
    if (!result.ok) return fail(result.error, result.status);

    await auditAdminOverride(actor, 'session.meeting_link.update', { sessionId });

    return ok({ meeting_link: result.join_url, join_url: result.join_url, cached: result.cached });
  } catch (error: any) {
    console.error('[POST session meeting-link]', error);
    return fail(error?.message ?? 'Failed to generate meeting link', 500);
  }
}
