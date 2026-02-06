'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';

type UserStats = {
  total: number;
  tutors: number;
  students: number;
  parents: number;
};

export default function ReviewerDashboard() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats>({ total: 0, tutors: 0, students: 0, parents: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (profileLoading) return;

    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      router.push('/login');
      return;
    }

    fetchStats();
  }, [profile, profileLoading, router]);

  async function fetchStats() {
    try {
      // Get total users
      const { count: totalCount, error: totalError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (totalError) throw totalError;

      // Get tutors count
      const { count: tutorsCount, error: tutorsError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'tutor');

      if (tutorsError) throw tutorsError;

      // Get students count
      const { count: studentsCount, error: studentsError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student');

      if (studentsError) throw studentsError;

      // Get parents count
      const { count: parentsCount, error: parentsError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'parent');

      if (parentsError) throw parentsError;

      setStats({
        total: totalCount || 0,
        tutors: tutorsCount || 0,
        students: studentsCount || 0,
        parents: parentsCount || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoadingStats(false);
    }
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <DashboardLayout role={profile.role === 'admin' ? 'admin' : 'reviewer'} userName={getDisplayName(profile)}>
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-6">
          {/* Animated Icon */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-itutor-green opacity-20 rounded-full blur-2xl animate-pulse"></div>
              <div className="relative bg-gradient-to-br from-itutor-green to-emerald-600 rounded-full p-8 shadow-2xl">
                <svg className="h-20 w-20 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Welcome Text */}
          <div className="space-y-2">
            <h1 className="text-6xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
              Welcome
            </h1>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-itutor-green via-emerald-500 to-teal-600 bg-clip-text text-transparent animate-gradient">
              iTutor Admin
            </h2>
          </div>

          {/* Subtitle */}
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Use the navigation menu above to manage verifications, accounts, and revenue
          </p>

          {/* User Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 max-w-4xl mx-auto">
            {loadingStats ? (
              <>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-md animate-pulse">
                    <div className="h-8 bg-gray-200 rounded mb-2"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-6 shadow-lg">
                  <p className="text-sm font-medium text-blue-700 mb-1">Total Users</p>
                  <p className="text-4xl font-bold text-blue-900">{stats.total}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-xl p-6 shadow-lg">
                  <p className="text-sm font-medium text-purple-700 mb-1">Tutors</p>
                  <p className="text-4xl font-bold text-purple-900">{stats.tutors}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-xl p-6 shadow-lg">
                  <p className="text-sm font-medium text-green-700 mb-1">Students</p>
                  <p className="text-4xl font-bold text-green-900">{stats.students}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 rounded-xl p-6 shadow-lg">
                  <p className="text-sm font-medium text-orange-700 mb-1">Parents</p>
                  <p className="text-4xl font-bold text-orange-900">{stats.parents}</p>
                </div>
              </>
            )}
          </div>

          {/* Quick Links Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 max-w-4xl mx-auto">
            <a
              href="/reviewer/verification/queue"
              className="group bg-white hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100 border-2 border-gray-200 hover:border-blue-300 rounded-xl p-6 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="bg-blue-100 group-hover:bg-blue-200 rounded-full p-3 transition-colors">
                  <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="font-semibold text-gray-900">Verification</span>
              </div>
            </a>

            <a
              href="/reviewer/accounts"
              className="group bg-white hover:bg-gradient-to-br hover:from-purple-50 hover:to-purple-100 border-2 border-gray-200 hover:border-purple-300 rounded-xl p-6 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="bg-purple-100 group-hover:bg-purple-200 rounded-full p-3 transition-colors">
                  <svg className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <span className="font-semibold text-gray-900">Accounts</span>
              </div>
            </a>

            <a
              href="/reviewer/payments"
              className="group bg-white hover:bg-gradient-to-br hover:from-green-50 hover:to-green-100 border-2 border-gray-200 hover:border-green-300 rounded-xl p-6 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="bg-green-100 group-hover:bg-green-200 rounded-full p-3 transition-colors">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-semibold text-gray-900">Payments</span>
              </div>
            </a>

            <a
              href="/reviewer/verified-tutors"
              className="group bg-white hover:bg-gradient-to-br hover:from-emerald-50 hover:to-emerald-100 border-2 border-gray-200 hover:border-emerald-300 rounded-xl p-6 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-1"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="bg-emerald-100 group-hover:bg-emerald-200 rounded-full p-3 transition-colors">
                  <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-semibold text-gray-900">Verified</span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

