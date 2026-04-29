'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import TutorLessonsHome from '@/components/groups/tutor/TutorLessonsHome';
import StudentLessonsClient from '@/components/groups/student/StudentLessonsClient';
import GroupsPageClient from '@/app/groups/GroupsPageClient';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';

function LessonsPageSkeleton() {
  return (
    <div className="min-h-screen flex bg-[#f6f8fb]">
      <style>{`@keyframes lpshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      {/* Sidebar */}
      <div style={{ width: 160, background: '#111827', flexShrink: 0 }} />
      {/* Main content */}
      <div style={{ flex: 1, padding: '32px 24px', maxWidth: 1200 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ width: 220, height: 28, borderRadius: 6, background: 'linear-gradient(90deg,#e8e8e8 25%,#d8d8d8 50%,#e8e8e8 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
            <div style={{ width: 280, height: 16, borderRadius: 4, background: 'linear-gradient(90deg,#e8e8e8 25%,#d8d8d8 50%,#e8e8e8 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
          </div>
          <div style={{ width: 140, height: 42, borderRadius: 10, background: 'linear-gradient(90deg,#e8e8e8 25%,#d8d8d8 50%,#e8e8e8 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
        </div>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1.5px solid #e5e7eb', paddingBottom: 0, marginBottom: 24 }}>
          {[100, 80].map((w, i) => (
            <div key={i} style={{ width: w, height: 34, borderRadius: '6px 6px 0 0', background: 'linear-gradient(90deg,#e8e8e8 25%,#d8d8d8 50%,#e8e8e8 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
          ))}
        </div>
        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f0f2f5', overflow: 'hidden' }}>
              <div style={{ height: 110, background: 'linear-gradient(90deg,#e0e0e0 25%,#d0d0d0 50%,#e0e0e0 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
              <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 16, width: '65%', borderRadius: 4, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
                <div style={{ height: 12, width: '40%', borderRadius: 4, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[0, 1, 2].map((j) => (
                    <div key={j} style={{ height: 48, borderRadius: 8, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
                  ))}
                </div>
                <div style={{ height: 38, borderRadius: 8, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
                <div style={{ height: 36, borderRadius: 8, background: 'linear-gradient(90deg,#eee 25%,#e0e0e0 50%,#eee 75%)', backgroundSize: '200% 100%', animation: 'lpshimmer 1.4s infinite' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LessonsPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();

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
    return <LessonsPageSkeleton />;
  }

  const role = profile.role as 'student' | 'tutor' | 'parent';
  const displayName = profile.username || profile.display_name || profile.full_name || 'User';

  return (
    <DashboardLayout role={role} userName={displayName}>
      {role === 'tutor' ? (
        <TutorLessonsHome currentUserId={profile.id} />
      ) : role === 'student' ? (
        <StudentLessonsClient currentUserId={profile.id} />
      ) : (
        <GroupsPageClient currentUserId={profile.id} userRole={role} isTutor={false} />
      )}
    </DashboardLayout>
  );
}
