'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { getSchoolCommunityById, getMyMembership } from '@/lib/supabase/community-v2';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import type { SchoolCommunityWithSchool } from '@/lib/types/community-v2';
import CommunityHeader from '@/components/community/CommunityHeader';
import Feed from '@/components/community/Feed';
import NewMessageComposer from '@/components/community/NewMessageComposer';
import PinsTab from '@/components/community/PinsTab';
import MembersTab from '@/components/community/MembersTab';

type Tab = 'feed' | 'pins' | 'members';

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const communityId = params.communityId as string;
  const { profile, loading: profileLoading } = useProfile();

  const [community, setCommunity] = useState<SchoolCommunityWithSchool | null>(null);
  const [membership, setMembership] = useState<Awaited<ReturnType<typeof getMyMembership>>>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [forbidden, setForbidden] = useState(false);
  const [feedVersion, setFeedVersion] = useState(0);

  useEffect(() => {
    if (!profileLoading && !profile) {
      router.push('/login');
      return;
    }
  }, [profile, profileLoading, router]);

  useEffect(() => {
    if (!profile || !communityId) return;
    (async () => {
      setLoading(true);
      setForbidden(false);
      try {
        const [comm, mem] = await Promise.all([
          getSchoolCommunityById(communityId),
          getMyMembership(communityId),
        ]);
        if (!comm) {
          setCommunity(null);
          setLoading(false);
          return;
        }
        if (comm.school_id !== profile.institution_id) {
          setForbidden(true);
          setCommunity(null);
          setLoading(false);
          return;
        }
        setCommunity(comm);
        setMembership(mem);
      } catch {
        setCommunity(null);
      }
      setLoading(false);
    })();
  }, [communityId, profile?.id, profile?.institution_id]);

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <DashboardLayout role={profile.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin'} userName={getDisplayName(profile)}>
        <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Access denied</h1>
          <p className="text-gray-600 mb-4">You don&apos;t have access to this community.</p>
          <Link href="/community" className="text-itutor-green hover:underline">
            Go to my community
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (loading || !community) {
    return (
      <DashboardLayout role={profile.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin'} userName={getDisplayName(profile)}>
        <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
        </div>
      </DashboardLayout>
    );
  }

  const isActive = membership?.status === 'ACTIVE';

  return (
    <DashboardLayout role={profile.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin'} userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-4xl mx-auto">
        <CommunityHeader
          community={community}
          membership={membership}
          onMuteChange={() => {
            getMyMembership(communityId).then(setMembership);
          }}
          onLeave={() => {
            getMyMembership(communityId).then(setMembership);
          }}
          onRejoin={() => {
            getMyMembership(communityId).then(setMembership);
          }}
        />

        <div className="border-b border-gray-200 mb-4">
          <nav className="flex gap-6">
            {(['feed', 'pins', 'members'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-itutor-green text-itutor-green'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'feed' && (
          <>
            {isActive && (
              <NewMessageComposer
                communityId={communityId}
                onPosted={() => setFeedVersion((v) => v + 1)}
              />
            )}
            <Feed communityId={communityId} refreshTrigger={feedVersion} />
          </>
        )}
        {activeTab === 'pins' && <PinsTab communityId={communityId} />}
        {activeTab === 'members' && <MembersTab communityId={communityId} />}
      </div>
    </DashboardLayout>
  );
}
