import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  getSchoolCommunityHeader,
  getMySubjectCommunities,
  getJoinableSubjectCommunities,
  ensureSubjectCommunitiesForSchool,
} from '@/lib/subject-communities';
import DashboardLayout from '@/components/DashboardLayout';
import SchoolCommunityHeader from '@/components/subject-communities/SchoolCommunityHeader';
import MyCommunitiesSection from '@/components/subject-communities/MyCommunitiesSection';
import CommunitiesPageClient from '@/components/subject-communities/CommunitiesPageClient';

export const dynamic = 'force-dynamic';

export default async function CommunitiesPage() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const profileRes = await supabase
      .from('profiles')
      .select('role, display_name, full_name, username, institution_id')
      .eq('id', user.id)
      .single();
    const profile = profileRes.data;
    const role = (profile?.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin') ?? 'student';
    const userName = profile?.display_name || profile?.full_name || profile?.username || 'User';
    const institutionId = profile?.institution_id ?? null;

    const admin = getServiceClient();

    // Ensure subject communities exist for user's school
    if (institutionId) {
      await ensureSubjectCommunitiesForSchool(admin, institutionId);
    }

    const [schoolHeader, myCommunities, joinableCommunities] = await Promise.all([
      getSchoolCommunityHeader(admin, institutionId),
      getMySubjectCommunities(admin, user.id),
      getJoinableSubjectCommunities(admin, user.id),
    ]);

    return (
      <DashboardLayout role={role} userName={userName}>
        <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-6">Communities</h1>

          <div className="space-y-6">
            {/* Section A: School Community Header - always at top */}
            {schoolHeader && (
              <div className="flex justify-center">
                <div className="w-full max-w-[900px]">
                  <SchoolCommunityHeader
                    schoolName={schoolHeader.name}
                    memberCount={schoolHeader.memberCount}
                    description={schoolHeader.description}
                  />
                </div>
              </div>
            )}

            {/* Section B: My Communities - only if user has ≥1 membership */}
            <MyCommunitiesSection communities={myCommunities} />

            {/* Section C: Join a Community */}
            <CommunitiesPageClient
              initialJoinable={joinableCommunities}
              hasSchool={!!institutionId}
              role={role}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  } catch (e) {
    if ((e as { digest?: string })?.digest === 'NEXT_REDIRECT' || (e as { digest?: string })?.digest === 'NEXT_NOT_FOUND') throw e;
    console.error('[CommunitiesPage]', e);
    return (
      <DashboardLayout role="student" userName="User">
        <div className="px-4 py-6 sm:px-0 max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900 mb-6">Communities</h1>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
            Something went wrong. You may need to run the database migration (088_subject_communities_spec.sql).
          </div>
        </div>
      </DashboardLayout>
    );
  }
}
