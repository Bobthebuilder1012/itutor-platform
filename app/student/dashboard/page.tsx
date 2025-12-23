'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import ProfileHeader from '@/components/ProfileHeader';
import { Session } from '@/lib/types/database';

export default function StudentDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === 'true';
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);
  const [totalHoursTutored, setTotalHoursTutored] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (testMode) {
      setLoadingData(false);
      return;
    }

    if (loading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    // Check if onboarding is complete
    const isProfileComplete = 
      profile.school && 
      profile.form_level && 
      profile.subjects_of_study && 
      profile.subjects_of_study.length > 0;

    if (!isProfileComplete) {
      router.push('/onboarding/student');
      return;
    }

    fetchStudentData();
  }, [profile, loading, router, testMode]);

  async function fetchStudentData() {
    if (!profile) return;

    try {
      const [upcomingRes, completedRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('*')
          .eq('student_id', profile.id)
          .eq('status', 'booked')
          .gte('scheduled_start', new Date().toISOString())
          .order('scheduled_start', { ascending: true })
          .limit(5),
        supabase
          .from('sessions')
          .select('*')
          .eq('student_id', profile.id)
          .eq('status', 'completed')
      ]);

      if (upcomingRes.data) setUpcomingSessions(upcomingRes.data);
      
      if (completedRes.data) {
        setCompletedSessionsCount(completedRes.data.length);
        
        const totalMinutes = completedRes.data.reduce((acc, session) => {
          return acc + (session.duration_minutes || 0);
        }, 0);
        setTotalHoursTutored(Math.round((totalMinutes / 60) * 10) / 10);
      }
    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoadingData(false);
    }
  }

  if (!testMode && (loading || !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const displayName = testMode ? 'Test Student' : profile?.full_name || 'Student';
  const subjectsLine = testMode 
    ? 'CSEC Math · CSEC Physics' 
    : profile?.subjects_of_study?.join(' · ') || null;

  return (
    <DashboardLayout role="student" userName={displayName}>
      <div className="px-4 py-6 sm:px-0">
        {/* Test Mode Banner */}
        {testMode && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-amber-700">
                  <strong>Test Mode:</strong> You're viewing the dashboard UI only. Real data requires authentication.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Profile Header */}
        <ProfileHeader
          fullName={displayName}
          role="student"
          school={testMode ? 'Queen\'s Royal College' : profile?.school}
          country={testMode ? 'Trinidad & Tobago' : profile?.country}
          subjectsLine={subjectsLine}
        />

        {/* Learning Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Completed Sessions</p>
                <p className="text-3xl font-bold text-blue-600">
                  {loadingData ? '...' : completedSessionsCount}
                </p>
              </div>
              <div className="bg-blue-100 rounded-full p-3">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Hours Tutored</p>
                <p className="text-3xl font-bold text-green-600">
                  {loadingData ? '...' : totalHoursTutored}
                </p>
              </div>
              <div className="bg-green-100 rounded-full p-3">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Sessions */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Upcoming Sessions</h2>
            <Link 
              href="/student/sessions"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all →
            </Link>
          </div>
          {loadingData ? (
            <p className="text-gray-500">Loading sessions...</p>
          ) : upcomingSessions.length > 0 ? (
            <div className="space-y-3">
              {upcomingSessions.map((session) => (
                <div key={session.id} className="border-b pb-3 last:border-b-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {new Date(session.scheduled_start).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(session.scheduled_start).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })} • {session.duration_minutes} minutes
                      </p>
                    </div>
                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      Scheduled
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No upcoming sessions</p>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
                Find a Tutor
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
