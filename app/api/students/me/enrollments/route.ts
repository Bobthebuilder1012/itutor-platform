import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

const querySchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED', 'COMPLETED']).optional(),
});

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const query = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    if (!query.success) return fail('Invalid query', 400);

    const service = getServiceClient();
    let enrollmentsQuery = service
      .from('group_enrollments')
      .select(`
        id, status, enrollment_type, payment_status, enrolled_at, expires_at, group_id,
        group:groups!inner(id, name, subject, tutor_id, cover_image, status, tutor:profiles!groups_tutor_id_fkey(full_name)),
        session:group_session_occurrences(id, scheduled_start_at)
      `)
      .eq('student_id', user.id)
      .order('enrolled_at', { ascending: false });

    if (query.data.status) {
      enrollmentsQuery = enrollmentsQuery.eq('status', query.data.status);
    }

    const { data, error } = await enrollmentsQuery;
    if (error) return fail(error.message, 500);

    return ok(data ?? []);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

