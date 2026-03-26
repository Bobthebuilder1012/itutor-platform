'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import GroupDetailPanel from '@/components/groups/GroupDetailPanel';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';

export default function GroupDetailPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const groupId = params?.groupId as string;

  useEffect(() => {
    if (loading) return;
    if (!isGroupsFeatureEnabled()) {
      if (profile?.role === 'student') router.replace('/student/dashboard');
      else if (profile?.role === 'tutor') router.replace('/tutor/dashboard');
      else if (profile?.role === 'parent') router.replace('/parent/dashboard');
      else router.replace('/login');
      return;
    }
    if (!profile) router.push('/login');
  }, [profile, loading, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const role = profile.role as 'student' | 'tutor' | 'parent';
  const displayName =
    profile.username || profile.display_name || profile.full_name || 'User';

  return (
    <DashboardLayout role={role} userName={displayName}>
      <div className="h-full min-h-0 flex flex-col">
        <GroupDetailPanel
          groupId={groupId}
          currentUserId={profile.id}
          userRole={role}
          onGroupUpdated={() => {}}
        />
      </div>
    </DashboardLayout>
  );
}
