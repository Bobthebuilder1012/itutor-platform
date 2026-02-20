import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  getCommunityByIdWithClient,
  getMyMembershipWithClient,
  getCommunityMembersWithClient,
} from '@/lib/communities';
import { syncSchoolCommunityMembers } from '@/lib/server/ensureSchoolCommunity';
import DashboardLayout from '@/components/DashboardLayout';
import CommunityViewLayout from '@/components/communities/CommunityViewLayout';
import CommunityJoinGate from '@/components/communities/CommunityJoinGate';

interface PageProps {
  params: Promise<{ communityId: string }>;
}

export const dynamic = 'force-dynamic';

export default async function CommunityDetailPage({ params }: PageProps) {
  try {
    const { communityId } = await params;
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

    const supabaseAdmin = getServiceClient();
    const [community, membership] = await Promise.all([
      getCommunityByIdWithClient(supabaseAdmin, communityId),
      getMyMembershipWithClient(supabaseAdmin, user.id, communityId),
    ]);

    if (!community) notFound();

    if (community.type === 'SCHOOL' && community.school_id) {
      await syncSchoolCommunityMembers(supabaseAdmin, communityId, community.school_id);
    }

    if (community.type === 'SCHOOL' && community.school_id !== institutionId) {
      return (
        <DashboardLayout role={role} userName={userName}>
          <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto text-center">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>
            <p className="text-gray-600 mb-4">You can’t join this school community.</p>
            <Link href="/communities" className="text-itutor-green hover:underline">
              Back to communities
            </Link>
          </div>
        </DashboardLayout>
      );
    }

    const isActive = membership?.status === 'ACTIVE';
    if (!isActive) {
      return (
        <DashboardLayout role={role} userName={userName}>
          <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
            <CommunityJoinGate
              community={community}
              communityId={communityId}
              userName={userName}
              role={role}
            />
          </div>
        </DashboardLayout>
      );
    }

    const canPost = true;
    const isAdmin = membership?.role === 'ADMIN';
    const members = await getCommunityMembersWithClient(supabaseAdmin, communityId);

    return (
      <DashboardLayout role={role} userName={userName}>
        <div className="-m-3 sm:-m-4 lg:-m-6 w-[calc(100%+1.5rem)] sm:w-[calc(100%+2rem)] lg:w-[calc(100%+3rem)] flex flex-col h-[calc(100vh-8rem)] min-h-[400px]">
          <CommunityViewLayout
            community={community}
            communityId={communityId}
            canPost={canPost}
            isAdmin={isAdmin}
            currentUserId={user.id}
            currentUserRole={role}
            initialMembers={members}
          />
        </div>
      </DashboardLayout>
    );
  } catch (e) {
    if ((e as { digest?: string })?.digest === 'NEXT_REDIRECT' || (e as { digest?: string })?.digest === 'NEXT_NOT_FOUND') throw e;
    console.error('[CommunityDetailPage]', e);
    notFound();
  }
}
