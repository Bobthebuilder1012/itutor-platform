import { NextRequest } from 'next/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ notificationId: string }> };

export async function PATCH(_req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const { notificationId } = await params;

    const service = getServiceClient();
    const { data, error } = await service
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id)
      .select('id, is_read')
      .single();

    if (error) return fail(error.message, 500);
    return ok(data);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

