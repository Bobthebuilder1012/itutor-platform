import { redirect } from 'next/navigation';
import GroupDetailClient from '@/app/(student)/tutors/[tutorId]/GroupDetailClient';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/DashboardLayout';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';

async function getGroup(groupId: string) {
  const service = getServiceClient();
  const { data: group } = await service
    .from('groups')
    .select(`
      id, name, description, subject, timezone, content_blocks, tutor_id,
      tutor:profiles!groups_tutor_id_fkey(full_name, response_time_minutes),
      sessions:group_sessions(
        id,
        occurrences:group_session_occurrences(id, scheduled_start_at, meeting_link)
      )
    `)
    .eq('id', groupId)
    .eq('status', 'PUBLISHED')
    .single();

  if (!group) return null;

  const { data: reviews } = await service
    .from('group_reviews')
    .select(`
      id, rating, comment, created_at,
      reviewer:profiles!group_reviews_reviewer_id_fkey(full_name, avatar_url)
    `)
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5);

  const { count } = await service
    .from('group_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('status', 'ACTIVE');

  const { data: ratingRows } = await service
    .from('group_reviews')
    .select('rating')
    .eq('group_id', groupId)
    .is('deleted_at', null);
  const ratings = (ratingRows ?? []).map((row: any) => Number(row.rating)).filter((n) => Number.isFinite(n));
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((acc, n) => acc + n, 0) / ratings.length) * 100) / 100
    : 0;

  const flattenedSessions = ((group as any).sessions ?? []).flatMap((session: any) => session.occurrences ?? []);
  const upcomingSessions = flattenedSessions
    .filter((session: any) => new Date(session.scheduled_start_at).getTime() >= Date.now())
    .sort((a: any, b: any) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())
    .slice(0, 10);

  return {
    ...(group as any),
    reviews: reviews ?? [],
    enrollment_count: count ?? 0,
    average_rating: averageRating,
    upcoming_sessions: upcomingSessions,
  };
}

export default async function StudentGroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  if (!isGroupsFeatureEnabled()) {
    redirect('/student/dashboard');
  }

  const { groupId } = await params;
  const group = await getGroup(groupId);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name, username')
    .eq('id', user.id)
    .single();
  const userName =
    profile?.display_name || profile?.full_name || profile?.username || 'Student';

  if (!group) {
    return (
      <DashboardLayout role="student" userName={userName}>
        <div className="mx-auto max-w-4xl">
          <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            Lesson not found.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student" userName={userName}>
      <div className="mx-auto max-w-6xl">
        <GroupDetailClient group={group} />
      </div>
    </DashboardLayout>
  );
}

