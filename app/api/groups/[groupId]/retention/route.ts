import { NextRequest } from 'next/server';
import { authenticateUser, requireGroupOwner } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { buildMonthlyEnrollmentRetentionSeries, type EnrollmentRetentionRow } from '@/lib/utils/groupEnrollmentRetention';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { groupId } = await params;
    const isOwner = await requireGroupOwner(groupId, user.id);
    if (!isOwner) return fail('Forbidden', 403);

    const monthsParam = req.nextUrl.searchParams.get('months');
    const monthsBack = monthsParam ? Number.parseInt(monthsParam, 10) : 12;
    if (!Number.isFinite(monthsBack) || monthsBack < 1) return fail('Invalid months', 400);

    const service = getServiceClient();
    const { data, error } = await service
      .from('group_enrollments')
      .select('student_id, session_id, enrolled_at, updated_at, status')
      .eq('group_id', groupId)
      .is('session_id', null);

    if (error) {
      console.warn('[GET /api/groups/[groupId]/retention] enrollment query failed, returning empty series:', error.message);
      return ok({ months: buildMonthlyEnrollmentRetentionSeries([], monthsBack) });
    }

    const rows = (data ?? []) as EnrollmentRetentionRow[];
    const series = buildMonthlyEnrollmentRetentionSeries(rows, monthsBack);

    return ok({ months: series });
  } catch (err: unknown) {
    console.error('[GET /api/groups/[groupId]/retention]', err);
    return fail('Internal server error', 500);
  }
}
