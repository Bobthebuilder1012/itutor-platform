import { NextRequest } from 'next/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const service = getServiceClient();
    const { count, error } = await service
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) return fail(error.message, 500);
    return ok({ unreadCount: count ?? 0 });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

