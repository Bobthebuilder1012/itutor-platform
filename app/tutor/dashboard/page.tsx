'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import ProfileHeader from '@/components/ProfileHeader';
import { Session, TutorSubject, Subject, Rating } from '@/lib/types/database';

type TutorSubjectWithSubject = TutorSubject & {
  subjects?: Subject;
};

export default function TutorDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === 'true';
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubjectWithSubject[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [sessionsTaught, setSessionsTaught] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (testMode) {
      setLoadingData(false);
      return;
    }

    if (loading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    // Check if onboarding is complete
    const isProfileComplete = 
      profile.school && 
      profile.tutor_subjects && 
      profile.tutor_subjects.length > 0 &&
      profile.teaching_levels && 
      profile.teaching_levels.length > 0;

    if (!isProfileComplete) {
      router.push('/onboarding/tutor');
      return;
    }

    fetchTutorData();
  }, [profile, loading, router, testMode]);

  async function fetchTutorData() {
    if (!profile) return;

    try {
      const [sessionsRes, subjectsRes, ratingsRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('*')
          .eq('tutor_id', profile.id)
          .order('scheduled_start', { ascending: false }),
        supabase
          .from('tutor_subjects')
          .select('*, subjects(*)')
          .eq('tutor_id', profile.id),
        supabase
          .from('ratings')
          .select('*')
          .eq('tutor_id', profile.id)
      ]);

      if (sessionsRes.data) {
        setSessions(sessionsRes.data.slice(0, 5));
        setSessionsTaught(sessionsRes.data.filter(s => s.status === 'completed').length);
      }
      
      if (subjectsRes.data) setTutorSubjects(subjectsRes.data);
      
      if (ratingsRes.data) {
        setRatings(ratingsRes.data);
        if (ratingsRes.data.length > 0) {
          const avgStars = ratingsRes.data.reduce((sum, r) => sum + r.stars, 0) / ratingsRes.data.length;
          setAverageRating(Math.round(avgStars * 10) / 10);
        }
      }
    } catch (error) {
      console.error('Error fetching tutor data:', error);
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

  const displayName = testMode ? 'Test Tutor' : profile?.full_name || 'Tutor';
  const subjectsLine = testMode
    ? 'CSEC Math · CAPE Physics'
    : tutorSubjects.length > 0
      ? tutorSubjects.map(ts => ts.subjects?.name).filter(Boolean).join(' · ')
      : null;

  return (
    <DashboardLayout role="tutor" userName={displayName}>
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
          role="tutor"
          school={testMode ? 'University of the West Indies' : profile?.school}
          country={testMode ? 'Trinidad & Tobago' : profile?.country}
          subjectsLine={subjectsLine}
          ratingAverage={testMode ? 4.8 : averageRating}
          ratingCount={testMode ? 35 : ratings.length}
        />

        {/* Teaching Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Sessions Taught</p>
                <p className="text-3xl font-bold text-green-600">
                  {loadingData ? '...' : sessionsTaught}
                </p>
              </div>
              <div className="bg-green-100 rounded-full p-3">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Subjects Teaching</p>
                <p className="text-3xl font-bold text-blue-600">
                  {loadingData ? '...' : tutorSubjects.length}
                </p>
              </div>
              <div className="bg-blue-100 rounded-full p-3">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Reviews</p>
                <p className="text-3xl font-bold text-purple-600">
                  {loadingData ? '...' : ratings.length}
                </p>
              </div>
              <div className="bg-purple-100 rounded-full p-3">
                <svg className="h-8 w-8 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Subjects Taught */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Subjects You Teach</h2>
          {loadingData ? (
            <p className="text-gray-500">Loading subjects...</p>
          ) : tutorSubjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tutorSubjects.map((ts) => (
                <div key={ts.id} className="border rounded-lg p-4">
                  <h3 className="font-semibold">{ts.subjects?.name || 'Unknown Subject'}</h3>
                  <p className="text-sm text-gray-600">
                    {ts.subjects?.curriculum} - {ts.subjects?.level}
                  </p>
                  <p className="text-lg font-bold text-blue-600 mt-2">
                    TT${ts.price_per_hour_ttd}/hour
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No subjects added yet</p>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Recent Sessions</h2>
            <Link 
              href="/tutor/sessions"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all →
            </Link>
          </div>
          {loadingData ? (
            <p className="text-gray-500">Loading sessions...</p>
          ) : sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session.id} className="border-b pb-3 last:border-b-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {new Date(session.scheduled_start).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(session.scheduled_start).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })} • {session.duration_minutes} minutes
                      </p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      session.status === 'completed' ? 'bg-green-100 text-green-800' :
                      session.status === 'booked' ? 'bg-blue-100 text-blue-800' :
                      session.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {session.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No sessions yet</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/tutor/sessions">
            <div className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-blue-500">
              <h3 className="text-lg font-semibold mb-2">Manage Sessions</h3>
              <p className="text-gray-600">View and manage all your tutoring sessions</p>
            </div>
          </Link>
          <Link href="/tutor/verification">
            <div className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-green-500">
              <h3 className="text-lg font-semibold mb-2">Verification</h3>
              <p className="text-gray-600">Upload certificates and credentials</p>
            </div>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
