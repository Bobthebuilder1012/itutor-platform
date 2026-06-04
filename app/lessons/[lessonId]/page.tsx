'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';

export default function LessonDetailPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const lessonId = params?.lessonId as string;

  useEffect(() => {
    if (loading) return;
    if (!profile) { router.replace('/login'); return; }
    if (profile.role === 'tutor') router.replace(`/tutor/classes/${lessonId}`);
    else if (profile.role === 'student') router.replace(`/student/lessons/${lessonId}`);
    else if (profile.role === 'parent') router.replace('/parent/dashboard');
    else router.replace('/login');
  }, [profile, loading, router, lessonId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
    </div>
  );
}
