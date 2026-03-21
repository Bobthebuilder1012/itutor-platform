import { NextRequest } from 'next/server';
import { authenticateUser, requireTutor } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const isTutor = await requireTutor(user.id);
    if (!isTutor) return fail('Tutor role required', 403);

    const service = getServiceClient();
    const now = new Date();
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: groups } = await service
      .from('groups')
      .select('id, name, subject, status, tutor_id')
      .eq('tutor_id', user.id)
      .is('archived_at', null);

    const groupIds = (groups ?? []).map((g) => g.id);

    const { data: enrollments } = groupIds.length
      ? await service
          .from('group_enrollments')
          .select('id, group_id, student_id, enrolled_at, payment_status')
          .in('group_id', groupIds)
      : { data: [] as any[] };

    const { data: upcomingSessions } = groupIds.length
      ? await service
          .from('group_session_occurrences')
          .select(`
            id, scheduled_start_at, meeting_link, group_session_id,
            session:group_sessions!inner(id, title, duration_minutes, group_id)
          `)
          .gte('scheduled_start_at', now.toISOString())
          .lte('scheduled_start_at', in7days)
          .eq('status', 'upcoming')
          .order('scheduled_start_at', { ascending: true })
      : { data: [] as any[] };

    const { data: reviews } = await service
      .from('group_reviews')
      .select('id, rating')
      .eq('tutor_id', user.id)
      .is('deleted_at', null);

    const uniqueStudents = new Set((enrollments ?? []).map((e: any) => e.student_id));
    const totalReviews = (reviews ?? []).length;
    const averageRating =
      totalReviews === 0
        ? 0
        : Math.round(
            (((reviews ?? []).reduce((acc: number, r: any) => acc + Number(r.rating), 0) / totalReviews) * 100)
          ) / 100;

    const groupsPayload = (groups ?? []).map((group: any) => {
      const groupEnrollments = (enrollments ?? []).filter((e: any) => e.group_id === group.id && e.status !== 'CANCELLED');
      const nextSession = (upcomingSessions ?? []).find((s: any) => s.session?.group_id === group.id)?.scheduled_start_at ?? null;
      return {
        id: group.id,
        title: group.name,
        subject: group.subject,
        status: group.status,
        enrollmentCount: groupEnrollments.length,
        nextSession,
        averageRating,
      };
    });

    const recentEnrollments = (enrollments ?? [])
      .sort((a: any, b: any) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime())
      .slice(0, 5)
      .map((e: any) => ({
        studentName: e.student_id,
        groupTitle: groupsPayload.find((g: any) => g.id === e.group_id)?.title ?? 'Group',
        enrolledAt: e.enrolled_at,
        paymentStatus: e.payment_status,
      }));

    const payload = {
      groups: groupsPayload,
      stats: {
        totalStudents: uniqueStudents.size,
        totalGroups: (groups ?? []).length,
        publishedGroups: (groups ?? []).filter((g: any) => g.status === 'PUBLISHED').length,
        upcomingSessions: (upcomingSessions ?? []).length,
        averageRating,
        totalReviews,
      },
      upcomingSessions: (upcomingSessions ?? []).slice(0, 5).map((s: any) => ({
        id: s.id,
        groupTitle: groupsPayload.find((g: any) => g.id === s.session?.group_id)?.title ?? 'Group',
        scheduledAt: s.scheduled_start_at,
        durationMinutes: s.session?.duration_minutes ?? 60,
        enrolledCount: (enrollments ?? []).filter((e: any) => e.group_id === s.session?.group_id && e.status === 'ACTIVE').length,
        meetingLink: s.meeting_link ?? null,
      })),
      recentEnrollments,
      enrollmentTrend: [],
    };

    return ok(payload);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}

