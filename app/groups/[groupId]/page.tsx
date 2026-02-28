'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import GroupDetailPanel from '@/components/groups/GroupDetailPanel';

export default function GroupDetailPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const groupId = params?.groupId as string;

  useEffect(() => {
    if (loading) return;
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
      <div>
        <GroupDetailPanel
          groupId={groupId}
          currentUserId={profile.id}
          userRole={role}
          onGroupUpdated={() => {}}
          onClose={() => router.push('/groups')}
        />
      </div>
    </DashboardLayout>
  );
}
