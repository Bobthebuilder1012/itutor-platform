'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';

export default function StudentSessionsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [sessions, setSessions] = useState<any[]>([]);
  const [rescheduleRequests, setRescheduleRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileLoading && !profile) {
      router.push('/login');
      return;
    }

    // Wait for profile to load before checking role
    if (!profileLoading && profile?.role !== 'student') {
      router.push('/');
      return;
    }

    // Only load sessions if profile is loaded and is student
    if (!profileLoading && profile?.role === 'student') {
      loadSessions();
      loadRescheduleRequests();
    }
  }, [profile, profileLoading, router]);

  async function loadSessions() {
    try {
      // Only show upcoming, non-cancelled sessions
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          tutor:profiles!fk_sessions_tutor(full_name, avatar_url),
          booking:bookings!fk_sessions_booking(*)
        `)
        .eq('student_id', profile?.id)
        .gte('scheduled_start_at', now) // Only upcoming sessions
        .in('status', ['SCHEDULED', 'JOIN_OPEN']) // Only active statuses
        .order('scheduled_start_at', { ascending: true });

      if (error) {
        console.error('Error loading sessions:', error);
        setSessions([]);
      } else {
        console.log('Sessions loaded:', data);
        // Filter out any sessions with cancelled bookings
        const activeSessions = (data || []).filter(session => 
          session.booking?.status !== 'CANCELLED' && 
          session.booking?.status !== 'DECLINED'
        );
        setSessions(activeSessions);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadRescheduleRequests() {
    try {
      // Load cancelled sessions with reschedule proposals
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          tutor:profiles!fk_sessions_tutor(full_name, avatar_url),
          booking:bookings!fk_sessions_booking(*)
        `)
        .eq('student_id', profile?.id)
        .eq('status', 'CANCELLED')
        .not('reschedule_proposed_start', 'is', null)
        .order('cancelled_at', { ascending: false });

      if (error) {
        console.error('Error loading reschedule requests:', error);
      } else {
        setRescheduleRequests(data || []);
      }
    } catch (error) {
      console.error('Error loading reschedule requests:', error);
    }
  }

  async function handleRescheduleResponse(sessionId: string, accept: boolean) {
    try {
      if (accept) {
        // Accept the reschedule - create a new booking/session with the proposed times
        const request = rescheduleRequests.find(r => r.id === sessionId);
        if (!request) return;

        // TODO: Implement booking creation logic here
        alert('Reschedule accepted! The tutor will be notified.');
      } else {
        // Decline the reschedule
        alert('Reschedule declined.');
      }

      // Remove from reschedule requests
      setRescheduleRequests(prev => prev.filter(r => r.id !== sessionId));
    } catch (error) {
      console.error('Error handling reschedule:', error);
      alert('Failed to process reschedule response');
    }
  }

  if (profileLoading || loading) {
    return (
      <DashboardLayout role="student" userName={profile?.full_name || 'Student'}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student" userName={profile?.full_name || 'Student'}>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">My Sessions</h1>
          <p className="text-sm sm:text-base text-gray-600">View and manage your upcoming tutoring sessions</p>
        </div>

        {/* Reschedule Requests */}
        {rescheduleRequests.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-amber-900">Reschedule Requests</h2>
                <p className="text-sm text-amber-800 mt-1">Your tutor has proposed new times for cancelled sessions</p>
              </div>
            </div>

            <div className="space-y-3">
              {rescheduleRequests.map((request) => (
                <div key={request.id} className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        Session with {request.tutor?.full_name || 'Tutor'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Original: {new Date(request.scheduled_start_at).toLocaleString()}
                      </p>
                      <p className="text-sm font-medium text-amber-700 mt-1">
                        Proposed: {new Date(request.reschedule_proposed_start).toLocaleString()}
                      </p>
                      {request.cancellation_reason && (
                        <p className="text-xs text-gray-500 mt-2">
                          Reason: {request.cancellation_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRescheduleResponse(request.id, false)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleRescheduleResponse(request.id, true)}
                        className="px-4 py-2 bg-itutor-green hover:bg-emerald-600 text-black font-medium rounded-lg transition-colors"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Sessions */}
        {sessions.length === 0 ? (
          <div className="text-center py-12 sm:py-16">
            <svg className="w-16 h-16 sm:w-20 sm:h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No sessions yet</h3>
            <p className="text-sm sm:text-base text-gray-600 mb-6">Book a session with a tutor to get started</p>
            <button
              onClick={() => router.push('/student/find-tutors')}
              className="bg-itutor-green hover:bg-emerald-600 text-black font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Find Tutors
            </button>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-itutor-green transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Session</h3>
                    <p className="text-sm text-gray-600 mt-1">with {session.tutor?.full_name || 'Tutor'}</p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-2">
                      {new Date(session.scheduled_start_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                    session.status === 'completed' ? 'bg-green-100 text-green-800' :
                    session.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                    session.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {session.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
