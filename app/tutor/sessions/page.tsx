'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';

export default function TutorSessionsPage() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !profile) {
      router.push('/login');
    } else if (!loading && profile?.role !== 'tutor') {
      router.push('/');
    }
    if (!loading && profile?.role === 'tutor') {
      loadSessions();
    }
  }, [profile, loading, router]);

  async function loadSessions() {
    try {
      // Only show upcoming, non-cancelled sessions
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          student:profiles!fk_sessions_student(full_name, avatar_url),
          booking:bookings!fk_sessions_booking(*)
        `)
        .eq('tutor_id', profile?.id)
        .gte('scheduled_start_at', now) // Only upcoming sessions
        .in('status', ['SCHEDULED', 'JOIN_OPEN']) // Only active statuses
        .order('scheduled_start_at', { ascending: false });

      if (error) {
        console.error('Session fetch error:', error);
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
    } catch (err) {
      console.error('Session load error:', err);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }

  if (loading || sessionsLoading) {
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
        {sessions.length === 0 ? (
          <div className="text-center py-12 sm:py-16">
            <svg className="w-16 h-16 sm:w-20 sm:h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm sm:text-base text-gray-600">Your scheduled sessions will appear here</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {sessions.map((session) => {
              const sessionStart = new Date(session.scheduled_start_at);
              const sessionEnd = new Date(sessionStart.getTime() + (session.duration_minutes || 60) * 60000);
              const now = new Date();
              
              // Check booking status first (cancellation is stored there)
              const bookingStatus = session.booking?.status?.toUpperCase();
              const sessionStatus = session.status?.toUpperCase();
              
              let displayStatus = 'Unknown';
              let statusColor = 'bg-gray-100 text-gray-800';
              
              // Check if session has ended
              const hasEnded = now > sessionEnd;
              // Check if session is in progress (between start and end time)
              const isInProgress = now >= sessionStart && now <= sessionEnd;
              
              // Check if booking was cancelled first
              if (bookingStatus === 'CANCELLED' || sessionStatus === 'CANCELLED') {
                displayStatus = 'Cancelled';
                statusColor = 'bg-red-100 text-red-800';
              } else if (sessionStatus === 'COMPLETED' || sessionStatus === 'COMPLETED_ASSUMED') {
                displayStatus = 'Completed';
                statusColor = 'bg-green-100 text-green-800';
              } else if (sessionStatus === 'NO_SHOW_STUDENT') {
                displayStatus = 'No Show';
                statusColor = 'bg-orange-100 text-orange-800';
              } else if (isInProgress && (sessionStatus === 'SCHEDULED' || sessionStatus === 'JOIN_OPEN')) {
                // Session is currently happening
                displayStatus = 'In Progress';
                statusColor = 'bg-purple-100 text-purple-800';
              } else if (hasEnded && (sessionStatus === 'SCHEDULED' || sessionStatus === 'JOIN_OPEN' || bookingStatus === 'CONFIRMED')) {
                // Session has ended but not marked complete
                displayStatus = 'Past (Not Completed)';
                statusColor = 'bg-gray-100 text-gray-800';
              } else if (sessionStatus === 'SCHEDULED' || sessionStatus === 'BOOKED' || sessionStatus === 'JOIN_OPEN' || bookingStatus === 'CONFIRMED') {
                // Session is upcoming
                displayStatus = 'Upcoming';
                statusColor = 'bg-blue-100 text-blue-800';
              }
              
              return (
                <Link 
                  key={session.id} 
                  href={`/tutor/sessions/${session.id}`}
                  className="block bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-itutor-green hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Session</h3>
                      <p className="text-sm text-gray-600 mt-1">with {session.student?.full_name || 'Student'}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs sm:text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {sessionStart.toLocaleString()}
                        </span>
                        {session.duration_minutes && (
                          <span className="flex items-center gap-1 font-medium text-gray-700">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {session.duration_minutes >= 60 
                              ? `${Math.floor(session.duration_minutes / 60)}h ${session.duration_minutes % 60 > 0 ? `${session.duration_minutes % 60}m` : ''}`
                              : `${session.duration_minutes}m`
                            }
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColor}`}>
                      {displayStatus}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center text-sm text-itutor-green font-medium">
                    View Details
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
