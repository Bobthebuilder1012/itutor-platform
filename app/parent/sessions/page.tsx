'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';

export default function ParentSessionsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileLoading && !profile) {
      router.push('/login');
      return;
    }

    if (!profileLoading && profile?.role !== 'parent') {
      router.push('/');
      return;
    }

    if (!profileLoading && profile?.role === 'parent') {
      loadSessions();
    }
  }, [profile, profileLoading, router]);

  async function loadSessions() {
    try {
      // Get parent's children
      const { data: children, error: childrenError } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', profile?.id);

      if (childrenError) throw childrenError;

      if (!children || children.length === 0) {
        setSessions([]);
        setLoading(false);
        return;
      }

      const studentIds = children.map(c => c.student_id);

      // Only show upcoming, non-cancelled sessions
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          tutor:profiles!fk_sessions_tutor(full_name, avatar_url),
          student:profiles!fk_sessions_student(full_name, avatar_url),
          booking:bookings!fk_sessions_booking(*)
        `)
        .in('student_id', studentIds)
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

  if (profileLoading || loading) {
    return (
      <DashboardLayout role="parent" userName={profile?.full_name || 'Parent'}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="parent" userName={profile?.full_name || 'Parent'}>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Family Sessions</h1>
          <p className="text-sm sm:text-base text-gray-600">View and manage your children's upcoming tutoring sessions</p>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-12 sm:py-16">
            <svg className="w-16 h-16 sm:w-20 sm:h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No upcoming sessions</h3>
            <p className="text-sm sm:text-base text-gray-600">Your children's upcoming sessions will appear here</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-itutor-green transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                      {session.student?.full_name || 'Child'}'s Session
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">with {session.tutor?.full_name || 'Tutor'}</p>
                    <p className="text-xs sm:text-sm text-gray-500 mt-2">
                      {new Date(session.scheduled_start_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-blue-100 text-blue-800">
                    Upcoming
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
