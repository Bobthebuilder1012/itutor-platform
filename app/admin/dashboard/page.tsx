'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalTutors: 0,
    totalParents: 0,
    recentSignups: 0,
    totalSessions: 0,
    totalBookings: 0
  });

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin' && !profile?.is_reviewer) {
        router.push('/login');
        return;
      }

      // Redirect reviewers to their dashboard
      if (profile?.is_reviewer && profile?.role !== 'admin') {
        router.push('/reviewer/dashboard');
        return;
      }

      // Fetch stats
      await fetchStats();
    } catch (error) {
      console.error('Error checking admin access:', error);
      router.push('/login');
    }
  };

  const fetchStats = async () => {
    try {
      // Fetch all profiles
      const { data: allProfiles, error: profileError } = await supabase
        .from('profiles')
        .select('role, created_at');

      if (profileError) throw profileError;

      // Calculate stats from profiles
      const totalUsers = allProfiles?.length || 0;
      const totalStudents = allProfiles?.filter(p => p.role === 'student').length || 0;
      const totalTutors = allProfiles?.filter(p => p.role === 'tutor').length || 0;
      const totalParents = allProfiles?.filter(p => p.role === 'parent').length || 0;

      // Recent signups (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentSignups = allProfiles?.filter(
        p => new Date(p.created_at) >= sevenDaysAgo
      ).length || 0;

      // Total sessions
      const { count: totalSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true });

      // Total bookings
      const { count: totalBookings } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalUsers,
        totalStudents,
        totalTutors,
        totalParents,
        recentSignups,
        totalSessions: totalSessions || 0,
        totalBookings: totalBookings || 0
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Welcome to the iTutor admin panel</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow border-l-4 border-blue-400 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Users</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalUsers}</p>
              </div>
              <div className="bg-blue-50 rounded-full p-3">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border-l-4 border-green-400 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Students</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalStudents}</p>
              </div>
              <div className="bg-green-50 rounded-full p-3">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border-l-4 border-purple-400 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">iTutors</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalTutors}</p>
              </div>
              <div className="bg-purple-50 rounded-full p-3">
                <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border-l-4 border-indigo-400 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Parents</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalParents}</p>
              </div>
              <div className="bg-indigo-50 rounded-full p-3">
                <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-400">
            <h3 className="text-gray-600 text-sm font-medium">Recent Signups (7d)</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.recentSignups}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-teal-400">
            <h3 className="text-gray-600 text-sm font-medium">Total Sessions</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalSessions}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-pink-400">
            <h3 className="text-gray-600 text-sm font-medium">Total Bookings</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalBookings}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">Admin Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/reviewer/verification/queue"
              className="flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-yellow-500 hover:bg-yellow-50 transition-all group hover:shadow-lg"
            >
              <div className="bg-yellow-100 rounded-lg p-4 group-hover:bg-yellow-200 transition-colors">
                <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Verification Queue</h3>
                <p className="text-sm text-gray-600">Review tutor verifications</p>
              </div>
            </Link>

            <Link
              href="/reviewer/accounts"
              className="flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group hover:shadow-lg"
            >
              <div className="bg-blue-100 rounded-lg p-4 group-hover:bg-blue-200 transition-colors">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Account Management</h3>
                <p className="text-sm text-gray-600">Suspend & manage users</p>
              </div>
            </Link>

            <Link
              href="/reviewer/payments"
              className="flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group hover:shadow-lg"
            >
              <div className="bg-indigo-100 rounded-lg p-4 group-hover:bg-indigo-200 transition-colors">
                <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Payments & Revenue</h3>
                <p className="text-sm text-gray-600">View financial data</p>
              </div>
            </Link>

            <Link
              href="/admin/emails"
              className="flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-itutor-green hover:bg-green-50 transition-all group hover:shadow-lg"
            >
              <div className="bg-green-100 rounded-lg p-4 group-hover:bg-green-200 transition-colors">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Email Management</h3>
                <p className="text-sm text-gray-600">Send emails & templates</p>
              </div>
            </Link>

            <Link
              href="/reviewer/verified-tutors"
              className="flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all group hover:shadow-lg"
            >
              <div className="bg-purple-100 rounded-lg p-4 group-hover:bg-purple-200 transition-colors">
                <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Verified iTutors</h3>
                <p className="text-sm text-gray-600">View all verified tutors</p>
              </div>
            </Link>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> Use the navigation menu above to access all admin features including verification queue, account management, payments tracking, and email campaigns.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
