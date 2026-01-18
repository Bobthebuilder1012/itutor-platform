'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          student:profiles!fk_sessions_student(full_name, avatar_url),
          booking:bookings!fk_sessions_booking(*)
        `)
        .eq('tutor_id', profile?.id)
        .order('scheduled_start_at', { ascending: true });

      if (error) {
        const { data: fallbackData } = await supabase
          .from('sessions')
          .select('*')
          .eq('tutor_id', profile?.id)
          .order('scheduled_start_at', { ascending: true });
        setSessions(fallbackData || []);
      } else {
        setSessions(data || []);
      }
    } catch (err) {
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
            {sessions.map((session) => (
              <div key={session.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-itutor-green transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Session</h3>
                    <p className="text-sm text-gray-600 mt-1">with {session.student?.full_name || 'Student'}</p>
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
