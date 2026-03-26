import { NextRequest } from 'next/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { groupId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return fail('Forbidden', 403);

    const service = getServiceClient();
    const { data, error } = await service
      .from('group_waitlist_entries')
      .select(`
        id, student_id, position, joined_at,
        student:profiles!group_waitlist_entries_student_id_fkey(id, full_name, avatar_url)
      `)
      .eq('group_id', groupId)
      .order('position', { ascending: true });
    if (error) return fail(error.message, 500);
    return ok(data ?? []);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

