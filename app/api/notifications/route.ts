import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!parsed.success) return fail('Invalid query', 400);

    const { page, limit } = parsed.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const service = getServiceClient();
    const { data, count, error } = await service
      .from('notifications')
      .select('id, type, title, message, is_read, created_at, metadata, group_id, session_occurrence_id', {
        count: 'exact',
      })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) return fail(error.message, 500);

    return ok({ items: data ?? [], pagination: { page, limit, total: count ?? 0 } });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

export async function PATCH() {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const service = getServiceClient();
    const { error } = await service
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) return fail(error.message, 500);

    return ok({ markedAllRead: true });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

