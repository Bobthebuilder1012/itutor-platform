'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorShell from '@/components/tutor/TutorShell';
import AssignmentDetailPage from '@/components/groups/stream/AssignmentDetailPage';

export default function TutorLessonPostPage() {
  return (
    <TutorShell>
      <PostDetailContent />
    </TutorShell>
  );
}

function PostDetailContent() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const postId = params?.postId as string;
  const { profile, loading } = useProfile();

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.replace('/login');
  }, [loading, profile, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <AssignmentDetailPage
      lessonId={id}
      postId={postId}
      currentUserId={profile.id}
      currentUserName={profile.full_name ?? profile.email ?? 'Tutor'}
      currentUserAvatar={profile.avatar_url ?? null}
      isTutor={true}
    />
  );
}
