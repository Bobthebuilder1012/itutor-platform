import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { generateMeetingLink } from '@/lib/meetingLinks';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; sessionId: string }> };

const schema = z.object({
  platform: z.enum(['ZOOM', 'GOOGLE_MEET', 'INTERNAL']).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { groupId, sessionId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return fail('Forbidden', 403);

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid body', 400);

    const service = getServiceClient();
    const { data: session, error } = await service
      .from('group_session_occurrences')
      .select(`
        id, scheduled_start_at,
        session:group_sessions!inner(id, title, duration_minutes, meeting_platform, group_id),
        group:groups!inner(id, name, tutor:profiles!groups_tutor_id_fkey(full_name))
      `)
      .eq('id', sessionId)
      .eq('session.group_id', groupId)
      .single();

    if (error || !session) return fail('Session not found', 404);

    const platform = parsed.data.platform ?? (session as any).session?.meeting_platform ?? 'INTERNAL';
    const link = await generateMeetingLink({
      platform,
      sessionId: session.id,
      scheduledAt: new Date(session.scheduled_start_at),
      durationMinutes: (session as any).session?.duration_minutes ?? 60,
      tutorName: (session as any).group?.tutor?.full_name ?? 'Tutor',
      groupTitle: (session as any).group?.name ?? (session as any).session?.title ?? 'Group Session',
    });

    const { data: updated, error: updateError } = await service
      .from('group_session_occurrences')
      .update({
        meeting_link: link,
        meeting_platform: platform,
        meeting_join_url: link,
      })
      .eq('id', session.id)
      .select('id, meeting_link, meeting_platform, meeting_join_url')
      .single();

    if (updateError) return fail(updateError.message, 500);
    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

