import { NextRequest } from 'next/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { generateUpcomingSessions } from '@/lib/recurrence';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { groupId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return fail('Forbidden', 403);

    const service = getServiceClient();

    const { data: group } = await service
      .from('groups')
      .select('id, name, subject')
      .eq('id', groupId)
      .single();

    if (!group) return fail('Group not found', 404);
    if (!group.name || !group.subject) return fail('Group missing required fields', 400);

    const { data: sessions } = await service
      .from('group_sessions')
      .select('id')
      .eq('group_id', groupId)
      .limit(1);

    if (!sessions || sessions.length === 0) return fail('At least one session is required before publishing', 400);

    const { data: updated, error } = await service
      .from('groups')
      .update({ status: 'PUBLISHED', updated_at: new Date().toISOString(), archived_at: null })
      .eq('id', groupId)
      .select()
      .single();

    if (error) return fail(error.message, 500);

    await generateUpcomingSessions(groupId, 60);
    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

