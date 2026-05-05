'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import GroupDetailPanel from '@/components/groups/GroupDetailPanel';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';

export default function LessonDetailPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const lessonId = params?.lessonId as string;

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
      <div className="min-h-screen bg-[#f4f6fa] flex">
        {/* Sidebar placeholder */}
        <div style={{ width: 160, background: '#111827', flexShrink: 0 }} />
        {/* Content skeleton — matches GroupDetailPanel layout */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <style>{`@keyframes pgshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          <div style={{ height: 200, background: 'linear-gradient(90deg,#dde0e5 25%,#cdd0d6 50%,#dde0e5 75%)', backgroundSize: '200% 100%', animation: 'pgshimmer 1.4s infinite' }} />
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', marginTop: -60, position: 'relative' }}>
              <div style={{ height: 24, width: '45%', borderRadius: 6, background: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'pgshimmer 1.4s infinite', marginBottom: 12 }} />
              <div style={{ height: 14, width: '30%', borderRadius: 4, background: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'pgshimmer 1.4s infinite' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const role = profile.role as 'student' | 'tutor' | 'parent';
  const displayName = profile.username || profile.display_name || profile.full_name || 'User';

  return (
    <DashboardLayout role={role} userName={displayName}>
      <div className="h-full min-h-0 flex flex-col">
        <GroupDetailPanel
          groupId={lessonId}
          currentUserId={profile.id}
          userRole={role}
          onGroupUpdated={() => {}}
        />
      </div>
    </DashboardLayout>
  );
}
