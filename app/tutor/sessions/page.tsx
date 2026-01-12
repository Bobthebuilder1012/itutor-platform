'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

export default function TutorSessionsPage() {
  const router = useRouter();
  const { profile, loading } = useProfile();

  useEffect(() => {
    if (!loading && !profile) {
      router.push('/login');
    } else if (!loading && profile?.role !== 'tutor') {
      router.push('/');
    }
  }, [profile, loading, router]);

  if (loading) {
    return (
      <DashboardLayout role="tutor" userName={profile?.full_name || 'Tutor'}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="tutor" userName={profile?.full_name || 'Tutor'}>
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Sessions</h1>
        <div className="text-center py-12 sm:py-16">
          <svg className="w-16 h-16 sm:w-20 sm:h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm sm:text-base text-gray-600">Your scheduled sessions will appear here</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
