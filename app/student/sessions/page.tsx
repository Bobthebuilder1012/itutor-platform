'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatDateTime, formatTimeRange, getRelativeTime } from '@/lib/utils/calendar';

type Booking = {
  id: string;
  tutor_id: string;
  subject_id: string;
  confirmed_start_at: string;
  confirmed_end_at: string;
  price_ttd: number;
  student_notes: string | null;
  tutor: {
    username: string;
    display_name: string | null;
    full_name: string;
    avatar_url: string | null;
  };
  subject: {
    name: string;
    label: string;
  };
};

type SessionData = {
  id: string;
  booking_id: string;
  join_url: string | null;
  scheduled_start_at: string;
  status: string;
};

export default function StudentSessionsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [upcomingSessions, setUpcomingSessions] = useState<Booking[]>([]);
  const [pastSessions, setPastSessions] = useState<Booking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [sessionDataMap, setSessionDataMap] = useState<Record<string, SessionData>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    loadSessions();
  }, [profile, profileLoading, router]);

  async function loadSessions() {
    if (!profile) return;

    setLoading(true);
    try {
      const now = new Date().toISOString();

      // Fetch upcoming sessions
      const { data: upcoming, error: upcomingError } = await supabase
        .from('bookings')
        .select(`
          id,
          tutor_id,
          subject_id,
          confirmed_start_at,
          confirmed_end_at,
          price_ttd,
          student_notes,
          tutor:profiles!bookings_tutor_id_fkey(username, display_name, full_name, avatar_url),
          subject:subjects(name, label)
        `)
        .eq('student_id', profile.id)
        .eq('status', 'CONFIRMED')
        .gte('confirmed_start_at', now)
        .order('confirmed_start_at', { ascending: true });

      if (!upcomingError && upcoming) {
        setUpcomingSessions(upcoming as any);
      }

      // Fetch past sessions
      const { data: past, error: pastError } = await supabase
        .from('bookings')
        .select(`
          id,
          tutor_id,
          subject_id,
          confirmed_start_at,
          confirmed_end_at,
          price_ttd,
          student_notes,
          tutor:profiles!bookings_tutor_id_fkey(username, display_name, full_name, avatar_url),
          subject:subjects(name, label)
        `)
        .eq('student_id', profile.id)
        .eq('status', 'CONFIRMED')
        .lt('confirmed_end_at', now)
        .order('confirmed_start_at', { ascending: false })
        .limit(10);

      if (!pastError && past) {
        setPastSessions(past as any);
      }

      // Fetch pending/awaiting confirmation bookings
      const { data: pending, error: pendingError } = await supabase
        .from('bookings')
        .select(`
          id,
          tutor_id,
          subject_id,
          confirmed_start_at,
          confirmed_end_at,
          price_ttd,
          student_notes,
          tutor:profiles!bookings_tutor_id_fkey(username, display_name, full_name, avatar_url),
          subject:subjects(name, label)
        `)
        .eq('student_id', profile.id)
        .in('status', ['PENDING', 'COUNTER_PROPOSED'])
        .order('created_at', { ascending: false });

      if (!pendingError && pending) {
        setPendingBookings(pending as any);
      }

      // Fetch session data for all confirmed bookings
      const allBookingIds = [...(upcoming || []), ...(past || [])].map((b: any) => b.id);
      if (allBookingIds.length > 0) {
        const { data: sessions } = await supabase
          .from('sessions')
          .select('id, booking_id, join_url, scheduled_start_at, status')
          .in('booking_id', allBookingIds);

        if (sessions) {
          const sessionMap: Record<string, SessionData> = {};
          sessions.forEach((session: any) => {
            sessionMap[session.booking_id] = session;
          });
          setSessionDataMap(sessionMap);
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function getOrCreateConversation(tutorId: string) {
    if (!profile) return null;

    try {
      // Check if conversation exists
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1_id.eq.${profile.id},participant_2_id.eq.${tutorId}),and(participant_1_id.eq.${tutorId},participant_2_id.eq.${profile.id})`)
        .single();

      if (existing) {
        return existing.id;
      }

      // Create new conversation
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          participant_1_id: profile.id,
          participant_2_id: tutorId
        })
        .select('id')
        .single();

      return newConv?.id || null;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  }

  async function handleOpenChat(tutorId: string) {
    const conversationId = await getOrCreateConversation(tutorId);
    if (conversationId) {
      router.push(`/student/messages/${conversationId}`);
    } else {
      alert('Unable to open chat. Please try again.');
    }
  }

  function canJoinSession(scheduledStartAt: string): boolean {
    // TESTING MODE: Allow joining anytime
    return true;
    
    // PRODUCTION: Uncomment below to enforce 5-minute rule
    // const now = new Date();
    // const startTime = new Date(scheduledStartAt);
    // const minutesUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60);
    // return minutesUntilStart <= 5;
  }

  function handleJoinSession(joinUrl: string) {
    window.open(joinUrl, '_blank', 'noopener,noreferrer');
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const sessions = view === 'upcoming' ? upcomingSessions : pastSessions;

  return (
    <DashboardLayout role="student" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Sessions</h1>
          <p className="text-gray-600">View and manage your tutoring sessions</p>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView('upcoming')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              view === 'upcoming'
                ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white'
                : 'bg-white border-2 border-gray-300 text-gray-700 hover:text-gray-900'
            }`}
          >
            Upcoming ({upcomingSessions.length})
          </button>
          <button
            onClick={() => setView('past')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              view === 'past'
                ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white'
                : 'bg-white border-2 border-gray-300 text-gray-700 hover:text-gray-900'
            }`}
          >
            Past ({pastSessions.length})
          </button>
        </div>

        {/* Pending Bookings Alert */}
        {pendingBookings.length > 0 && view === 'upcoming' && (
          <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-500/50 rounded-xl">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-yellow-500">
                  You have {pendingBookings.length} booking{pendingBookings.length > 1 ? 's' : ''} awaiting tutor confirmation
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  These will appear here once your tutor confirms them.{' '}
                  <Link href="/student/bookings" className="text-yellow-500 hover:text-yellow-400 underline">
                    View pending bookings →
                  </Link>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sessions List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl">
            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-600 mb-2">No {view} sessions</p>
            {view === 'upcoming' && (
              <Link href="/student/find-tutors" className="text-itutor-green hover:text-emerald-400 text-sm">
                Find a tutor to book a session →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-6 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Tutor Avatar */}
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                      {session.tutor.avatar_url ? (
                        <img src={session.tutor.avatar_url} alt={getDisplayName(session.tutor)} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        getDisplayName(session.tutor).charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Session Info */}
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {session.subject.label || session.subject.name}
                      </h3>
                      <p className="text-gray-600 mb-2">
                        with <span className="font-medium text-gray-900">{getDisplayName(session.tutor)}</span>
                      </p>
                      
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {formatDateTime(session.confirmed_start_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatTimeRange(session.confirmed_start_at, session.confirmed_end_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          ${session.price_ttd} TTD
                        </span>
                      </div>

                      {session.student_notes && (
                        <div className="mt-3 p-3 bg-gray-700/30 rounded-lg">
                          <p className="text-sm text-gray-300">
                            <span className="font-medium">Your notes:</span> {session.student_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Time Badge */}
                  {view === 'upcoming' && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-medium text-itutor-green">
                        {getRelativeTime(session.confirmed_start_at)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => handleOpenChat(session.tutor_id)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Chat with Tutor
                  </button>

                  <Link
                    href={`/student/bookings/${session.id}`}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View Session
                  </Link>

                  {/* Join Button - only show for upcoming sessions with session data */}
                  {view === 'upcoming' && sessionDataMap[session.id] && sessionDataMap[session.id].join_url && canJoinSession(sessionDataMap[session.id].scheduled_start_at) && (
                    <button
                      onClick={() => handleJoinSession(sessionDataMap[session.id].join_url!)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-medium transition shadow-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Join
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
