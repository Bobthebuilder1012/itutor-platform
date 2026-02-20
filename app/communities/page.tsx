import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { ensureSchoolCommunityAndMembershipWithClient } from '@/lib/server/ensureSchoolCommunity';
import {
  getUserCommunitiesWithMembershipWithClient,
  getJoinableCommunitiesWithClient,
} from '@/lib/communities';
import DashboardLayout from '@/components/DashboardLayout';
import CommunitiesListClient from '@/components/communities/CommunitiesListClient';

export default async function CommunitiesPage() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const profileRes = await supabase.from('profiles').select('role, display_name, full_name, username, institution_id').eq('id', user.id).single();
    const profile = profileRes.data;
    const role = (profile?.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin') ?? 'student';
    const userName = profile?.display_name || profile?.full_name || profile?.username || 'User';

    const supabaseAdmin = getServiceClient();
    const ensureResult = await ensureSchoolCommunityAndMembershipWithClient(supabaseAdmin, user.id);
    const ensureError = ensureResult.success ? null : ensureResult.error;

    let myCommunities: Awaited<ReturnType<typeof getUserCommunitiesWithMembershipWithClient>> = [];
    let joinableCommunities: Awaited<ReturnType<typeof getJoinableCommunitiesWithClient>> = [];
    try {
      [myCommunities, joinableCommunities] = await Promise.all([
        getUserCommunitiesWithMembershipWithClient(supabaseAdmin, user.id),
        getJoinableCommunitiesWithClient(supabaseAdmin, user.id),
      ]);
    } catch (e) {
      if ((e as { digest?: string })?.digest === 'NEXT_REDIRECT' || (e as { digest?: string })?.digest === 'NEXT_NOT_FOUND') throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg?.includes('communities_v2') || msg?.includes('does not exist') || msg?.includes('relation')) {
        return (
          <DashboardLayout role={role} userName={userName}>
            <div className="px-4 py-6 sm:px-0 max-w-2xl mx-auto">
              <h1 className="text-xl font-semibold text-gray-900 mb-6">Communities</h1>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
                Communities are not set up yet. Run the database migrations (078, 079) for the Communities v2 schema, then refresh this page.
              </div>
            </div>
          </DashboardLayout>
        );
      }
      throw e;
    }

    return (
      <DashboardLayout role={role} userName={userName}>
        <div className="px-4 py-6 sm:px-0 max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900 mb-6">Communities</h1>
          <CommunitiesListClient
            myCommunities={myCommunities}
            joinableCommunities={joinableCommunities}
            ensureError={ensureError}
            hasInstitution={!!profile?.institution_id}
          />
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
            Something went wrong loading communities. Check the server logs for details.
          </div>
        </div>
      </DashboardLayout>
    );
  }
}
