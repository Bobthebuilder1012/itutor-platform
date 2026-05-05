'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import DashboardLayout from '@/components/DashboardLayout';
import AssignmentDetailPage from '@/components/groups/stream/AssignmentDetailPage';

export default function PostDetailPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const lessonId = params?.lessonId as string;
  const postId = params?.postId as string;

  useEffect(() => {
    if (!loading && !profile) router.push('/login');
  }, [profile, loading, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex">
        <div style={{ width: 160, background: '#111827', flexShrink: 0 }} />
        <div className="flex-1 p-8">
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          <div style={{ height: 20, width: 200, borderRadius: 6, background: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', marginBottom: 24 }} />
          <div className="grid grid-cols-[1fr_320px] gap-6">
            <div style={{ background: '#fff', borderRadius: 14, height: 400, border: '1px solid #e5e7eb', animation: 'shimmer 1.4s infinite', backgroundImage: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%' }} />
            <div style={{ background: '#fff', borderRadius: 14, height: 300, border: '1px solid #e5e7eb', animation: 'shimmer 1.4s infinite', backgroundImage: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%' }} />
          </div>
        </div>
      </div>
    );
  }

  const role = profile.role as 'student' | 'tutor' | 'parent';
  const displayName = profile.username || profile.display_name || profile.full_name || 'User';

  return (
    <DashboardLayout role={role} userName={displayName}>
      <AssignmentDetailPage
        lessonId={lessonId}
        postId={postId}
        currentUserId={profile.id}
        currentUserName={profile.full_name ?? displayName}
        currentUserAvatar={profile.avatar_url ?? null}
        isTutor={role === 'tutor'}
      />
    </DashboardLayout>
  );
}
