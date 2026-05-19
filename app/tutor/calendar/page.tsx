'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import ScheduleCalendarModal from '@/components/ScheduleCalendarModal';

export default function TutorCalendarPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
    }
  }, [profile, loading, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-transparent border-t-green-brand" />
      </div>
    );
  }

  return (
    <ScheduleCalendarModal
      open={true}
      onClose={() => router.push('/tutor/dashboard')}
      userId={profile.id}
      role="tutor"
    />
  );
}
