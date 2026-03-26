import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  getSubjectCommunityById,
  getSubjectCommunityMembership,
  getSubjectCommunityMembers,
  getSubjectCommunityMessages,
  getPinnedSessionsForCommunity,
} from '@/lib/subject-communities';
import DashboardLayout from '@/components/DashboardLayout';
import SubjectCommunityChat from '@/components/subject-communities/SubjectCommunityChat';

interface PageProps {
  params: Promise<{ communityId: string }>;
}

export const dynamic = 'force-dynamic';

function communityDisplayName(c: { form_level: string; subject_name: string }) {
  return `${c.form_level} ${c.subject_name}`;
}

export default async function SubjectCommunityPage({ params }: PageProps) {
  try {
    const { communityId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const profileRes = await supabase.from('profiles').select('role, display_name, full_name, username, institution_id').eq('id', user.id).single();
    const profile = profileRes.data;
    const role = (profile?.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin') ?? 'student';
    const userName = profile?.display_name || profile?.full_name || profile?.username || 'User';

    const admin = getServiceClient();
    const [community, membership] = await Promise.all([
      getSubjectCommunityById(admin, communityId),
      getSubjectCommunityMembership(admin, user.id, communityId),
    ]);

    if (!community) notFound();

    // Must be from same school
    if (community.school_id !== profile?.institution_id) {
      return (
        <DashboardLayout role={role} userName={userName}>
          <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto text-center">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>
            <p className="text-gray-600 mb-4">You can&apos;t access communities from another school.</p>
            <Link href="/communities" className="text-itutor-green hover:underline">Back to communities</Link>
          </div>
        </DashboardLayout>
      );
    }

    if (!membership) redirect('/communities');

    const [members, initialMessages, pinnedSessions] = await Promise.all([
      getSubjectCommunityMembers(admin, communityId),
      getSubjectCommunityMessages(admin, communityId, { limit: 50 }),
      getPinnedSessionsForCommunity(admin, communityId).catch(() => []),
    ]);

    return (
      <DashboardLayout role={role} userName={userName}>
        <SubjectCommunityChat
          community={community}
          communityId={communityId}
          communityTitle={communityDisplayName(community)}
          initialMembers={members}
          initialMessages={initialMessages}
          initialPinnedSessions={pinnedSessions}
          currentUserId={user.id}
        />
      </DashboardLayout>
    );
  } catch (e) {
    if ((e as { digest?: string })?.digest === 'NEXT_REDIRECT' || (e as { digest?: string })?.digest === 'NEXT_NOT_FOUND') throw e;
    console.error('[SubjectCommunityPage]', e);
    notFound();
  }
}
