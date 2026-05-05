import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/DashboardLayout';
import StudentTutorsBrowseClient from '@/app/(student)/tutors/StudentTutorsBrowseClient';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';

export default async function StudentGroupsPage() {
  if (!isGroupsFeatureEnabled()) {
    redirect('/student/dashboard');
  }

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

  return (
    <DashboardLayout role="student" userName={userName}>
      <div className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-bold text-gray-900">Discover Lesson Sessions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Browse expert-led lessons in a marketplace-style catalog.
        </p>
        <div className="mt-6">
          <StudentTutorsBrowseClient />
        </div>
      </div>
    </DashboardLayout>
  );
}
