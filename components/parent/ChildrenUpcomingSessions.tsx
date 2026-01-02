'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils/calendar';
import Link from 'next/link';

type Session = {
  id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: string;
  booking_id: string;
  student_id: string;
  tutor_id: string;
  booking: {
    subject_id: string;
  };
  student_name?: string;
  tutor_name?: string;
  subject_name?: string;
};

export default function ChildrenUpcomingSessions({ childIds }: { childIds: string[] }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (childIds.length === 0) {
      setLoading(false);
      return;
    }
    fetchSessions();
  }, [childIds]);

  async function fetchSessions() {
    try {
      // Get upcoming sessions for all children
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          scheduled_start_at,
          scheduled_end_at,
          status,
          booking_id,
          student_id,
          tutor_id,
          bookings!inner(subject_id)
        `)
        .in('student_id', childIds)
        .in('status', ['SCHEDULED', 'JOIN_OPEN'])
        .gte('scheduled_start_at', new Date().toISOString())
        .order('scheduled_start_at', { ascending: true })
        .limit(10);

      if (error) throw error;

      // Enrich with student, tutor, and subject names
      const enrichedSessions = await Promise.all(
        (data || []).map(async (session: any) => {
          const [studentRes, tutorRes, subjectRes] = await Promise.all([
            supabase.from('profiles').select('full_name, display_name').eq('id', session.student_id).single(),
            supabase.from('profiles').select('full_name, display_name, username').eq('id', session.tutor_id).single(),
            supabase.from('subjects').select('name, label').eq('id', session.bookings.subject_id).single()
          ]);

          return {
            ...session,
            booking: session.bookings,
            student_name: studentRes.data?.display_name || studentRes.data?.full_name || 'Unknown',
            tutor_name: tutorRes.data?.display_name || tutorRes.data?.full_name || tutorRes.data?.username || 'Unknown',
            subject_name: subjectRes.data?.label || subjectRes.data?.name || 'Unknown'
          };
        })
      );

      setSessions(enrichedSessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <p className="text-gray-600">Loading sessions...</p>;
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
          <svg className="h-8 w-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-600">No upcoming sessions scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-gray-900">{session.student_name}</span>
                <span className="text-gray-500">with</span>
                <span className="font-semibold text-blue-600">{session.tutor_name}</span>
              </div>
              <p className="text-sm text-gray-700 mb-2">{session.subject_name}</p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDateTime(session.scheduled_start_at)}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {(() => {
                    const durationMs = new Date(session.scheduled_end_at).getTime() - new Date(session.scheduled_start_at).getTime();
                    const durationMinutes = Math.round(durationMs / 60000);
                    const hours = Math.floor(durationMinutes / 60);
                    const mins = durationMinutes % 60;
                    return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
                  })()}
                </span>
              </div>
            </div>
            <Link
              href={`/parent/child/${session.student_id}/sessions`}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition"
            >
              View
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}




