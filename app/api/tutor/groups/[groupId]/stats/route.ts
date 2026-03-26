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
    const now = new Date().toISOString();

    const { data: enrollments } = await service
      .from('group_enrollments')
      .select('id, status, enrolled_at, student_id')
      .eq('group_id', groupId);

    const { data: waitlist } = await service
      .from('group_waitlist_entries')
      .select('id')
      .eq('group_id', groupId);

    const { data: sessions } = await service
      .from('group_session_occurrences')
      .select('id, scheduled_start_at, status')
      .in(
        'group_session_id',
        (
          await service.from('group_sessions').select('id').eq('group_id', groupId)
        ).data?.map((s: any) => s.id) ?? []
      );

    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    const { data: attendance } =
      sessionIds.length > 0
        ? await service
            .from('group_attendance_records')
            .select('id, session_id, status')
            .in('session_id', sessionIds)
        : { data: [] as any[] };

    const { data: reviews } = await service
      .from('group_reviews')
      .select('id, rating')
      .eq('group_id', groupId)
      .is('deleted_at', null);

    const present = (attendance ?? []).filter((a: any) => a.status === 'PRESENT').length;
    const averageAttendanceRate =
      (attendance ?? []).length === 0 ? 0 : Math.round((present / (attendance ?? []).length) * 100);
    const averageRating =
      (reviews ?? []).length === 0
        ? 0
        : Math.round(
            (((reviews ?? []).reduce((acc: number, r: any) => acc + Number(r.rating), 0) / (reviews ?? []).length) * 100)
          ) / 100;

    const payload = {
      enrollmentCount: (enrollments ?? []).filter((e: any) => e.status === 'ACTIVE').length,
      waitlistCount: (waitlist ?? []).length,
      completedSessions: (sessions ?? []).filter((s: any) => s.status !== 'upcoming' || s.scheduled_start_at < now).length,
      upcomingSessions: (sessions ?? []).filter((s: any) => s.status === 'upcoming' && s.scheduled_start_at >= now).length,
      averageAttendanceRate,
      averageRating,
      reviewCount: (reviews ?? []).length,
      enrollmentsByWeek: [],
      attendanceBySession: [],
    };

    return ok(payload);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

