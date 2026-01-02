'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatDateTime } from '@/lib/utils/calendar';
import RescheduleSessionModal from '@/components/parent/RescheduleSessionModal';

type ChildSession = {
  id: string;
  student_id: string;
  tutor_id: string;
  subject_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  duration_minutes: number;
  status: string;
  join_url: string | null;
  provider: string | null;
  charge_amount_ttd: number;
  student_name?: string;
  tutor_name?: string;
  subject_name?: string;
  child_color?: string;
};

export default function ParentSessionsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [sessions, setSessions] = useState<ChildSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [selectedSessionForReschedule, setSelectedSessionForReschedule] = useState<ChildSession | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    fetchSessions();
  }, [profile, profileLoading, router]);

  async function fetchSessions() {
    if (!profile) return;

    try {
      console.log('🔍 Fetching sessions for parent:', profile.id);
      
      // Get all children with colors
      const { data: children, error: childrenError } = await supabase
        .from('parent_child_links')
        .select('child_id, child_color')
        .eq('parent_id', profile.id);

      console.log('👶 Children found:', children);
      if (childrenError) {
        console.error('❌ Error fetching children:', childrenError);
        throw childrenError;
      }

      const childIds = (children || []).map(c => c.child_id);
      const childColorMap = new Map((children || []).map(c => [c.child_id, c.child_color || '#9333EA']));
      console.log('📋 Child IDs:', childIds);

      if (childIds.length === 0) {
        console.log('⚠️ No children linked to parent');
        setLoading(false);
        return;
      }

      // Get upcoming sessions for all children (join with bookings to get subject_id)
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*, bookings(subject_id)')
        .in('student_id', childIds)
        .in('status', ['SCHEDULED', 'JOIN_OPEN'])
        .gte('scheduled_start_at', new Date().toISOString())
        .order('scheduled_start_at', { ascending: true });

      console.log('📚 Sessions found:', sessionsData);
      
      if (sessionsError) {
        console.error('❌ Error fetching sessions:', sessionsError);
        throw sessionsError;
      }

      // Enrich with names and colors
      const enriched = await Promise.all(
        (sessionsData || []).map(async (session: any) => {
          const subjectId = session.bookings?.subject_id;
          
          const [studentRes, tutorRes, subjectRes] = await Promise.all([
            supabase.from('profiles').select('full_name, display_name').eq('id', session.student_id).single(),
            supabase.from('profiles').select('full_name, display_name, username').eq('id', session.tutor_id).single(),
            subjectId 
              ? supabase.from('subjects').select('name, label, curriculum, level').eq('id', subjectId).single()
              : Promise.resolve({ data: null, error: null })
          ]);

          // Get subject name
          const subjectName = subjectRes.data 
            ? (subjectRes.data.label || subjectRes.data.name || 'Unknown Subject')
            : 'Unknown Subject';

          return {
            ...session,
            student_name: studentRes.data ? getDisplayName(studentRes.data) : 'Unknown',
            tutor_name: tutorRes.data ? getDisplayName(tutorRes.data) : 'Unknown',
            subject_name: subjectName,
            child_color: childColorMap.get(session.student_id) || '#9333EA'
          };
        })
      );

      console.log('✅ Enriched sessions with colors:', enriched);
      setSessions(enriched);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelSession(sessionId: string) {
    if (!confirm('Are you sure you want to cancel this session?')) return;
    
    setCancelling(sessionId);

    try {
      // First, get the session details to find tutor, student, and time
      const { data: session, error: fetchError } = await supabase
        .from('sessions')
        .select('*, bookings(subject_id)')
        .eq('id', sessionId)
        .single();

      if (fetchError) throw fetchError;

      // Get subject and student names
      const subjectId = (session as any).bookings?.subject_id;
      const [subjectRes, studentRes, tutorRes] = await Promise.all([
        subjectId 
          ? supabase.from('subjects').select('name, label').eq('id', subjectId).single()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('profiles').select('full_name, display_name').eq('id', session.student_id).single(),
        supabase.from('profiles').select('full_name, display_name').eq('id', session.tutor_id).single()
      ]);

      const subjectName = subjectRes.data?.label || subjectRes.data?.name || 'Unknown Subject';
      const studentName = studentRes.data ? getDisplayName(studentRes.data) : 'Unknown';
      const tutorName = tutorRes.data ? getDisplayName(tutorRes.data) : 'Unknown';

      const formattedDate = new Date(session.scheduled_start_at).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });

      // Update session status
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ 
          status: 'CANCELLED',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      // Notify tutor of cancellation
      const { error: tutorNotificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: session.tutor_id,
          type: 'session_cancelled',
          title: 'Session Cancelled',
          message: `A parent has cancelled ${studentName}'s ${subjectName} session scheduled for ${formattedDate}.`,
          link: `/tutor/sessions`,
          created_at: new Date().toISOString()
        });

      if (tutorNotificationError) {
        console.error('Failed to create tutor notification:', tutorNotificationError);
      }

      // Notify student of cancellation
      const { error: studentNotificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: session.student_id,
          type: 'session_cancelled',
          title: 'Session Cancelled',
          message: `Your ${subjectName} session with ${tutorName} scheduled for ${formattedDate} has been cancelled.`,
          link: `/student/sessions`,
          created_at: new Date().toISOString()
        });

      if (studentNotificationError) {
        console.error('Failed to create student notification:', studentNotificationError);
      }

      alert('Session cancelled successfully.');
      await fetchSessions();
    } catch (error: any) {
      console.error('Error cancelling session:', error);
      alert(error.message || 'Failed to cancel session');
    } finally {
      setCancelling(null);
    }
  }

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile!)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Children's Sessions</h1>
          <p className="text-gray-600 mt-1">View and manage upcoming tutoring sessions for all your children</p>
        </div>

        {/* Sessions List */}
        {sessions.length === 0 ? (
          <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg p-12 text-center">
            <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No upcoming sessions</h3>
            <p className="text-gray-600">When your children have confirmed sessions, they'll appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-all relative overflow-hidden"
                style={{ 
                  borderLeft: `6px solid ${session.child_color}`,
                  borderTop: `2px solid ${session.child_color}20`,
                  borderRight: `2px solid ${session.child_color}20`,
                  borderBottom: `2px solid ${session.child_color}20`
                }}
              >
                {/* Color indicator circle */}
                <div 
                  className="absolute top-4 right-4 w-8 h-8 rounded-full border-4 border-white shadow-lg"
                  style={{ backgroundColor: session.child_color }}
                  title={`${session.student_name}'s session`}
                />

                <div className="flex items-start justify-between mb-4 pr-12">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span 
                        className="px-3 py-1 text-xs font-bold rounded-full text-white"
                        style={{ backgroundColor: session.child_color }}
                      >
                        {session.status === 'JOIN_OPEN' ? 'JOIN NOW' : 'UPCOMING'}
                      </span>
                      <span className="text-sm text-gray-600">
                        {new Date(session.scheduled_start_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {session.student_name} - {session.subject_name}
                    </h3>
                    <p className="text-gray-700 mb-4">
                      with{' '}
                      <Link 
                        href={`/parent/tutors/${session.tutor_id}`}
                        className="font-semibold hover:underline cursor-pointer"
                        style={{ color: session.child_color }}
                      >
                        {session.tutor_name}
                      </Link>
                    </p>
                  </div>
                </div>

                {/* Session Details */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Date & Time</p>
                      <p className="text-sm text-gray-900 font-semibold">{formatDateTime(session.scheduled_start_at)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Duration</p>
                      <p className="text-sm text-gray-900 font-semibold">{session.duration_minutes} minutes</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div 
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${session.child_color}20` }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: session.child_color }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Platform</p>
                      <p className="text-sm text-gray-900 font-semibold">{session.provider || 'Online'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Cost</p>
                      <p className="text-sm text-gray-900 font-semibold">${session.charge_amount_ttd} TTD</p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {session.join_url && session.status === 'JOIN_OPEN' && (
                    <a
                      href={session.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: session.child_color }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Join Session
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setSelectedSessionForReschedule(session);
                      setRescheduleModalOpen(true);
                    }}
                    disabled={cancelling === session.id}
                    className="bg-white hover:bg-blue-50 border-2 px-6 py-3 rounded-lg font-semibold hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ 
                      borderColor: session.child_color,
                      color: session.child_color
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Reschedule
                  </button>
                  <button
                    onClick={() => handleCancelSession(session.id)}
                    disabled={cancelling === session.id}
                    className="bg-white hover:bg-red-50 border-2 border-red-300 text-red-600 px-6 py-3 rounded-lg font-semibold hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {cancelling === session.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reschedule Session Modal */}
        {selectedSessionForReschedule && (
          <RescheduleSessionModal
            isOpen={rescheduleModalOpen}
            onClose={() => {
              setRescheduleModalOpen(false);
              setSelectedSessionForReschedule(null);
            }}
            sessionId={selectedSessionForReschedule.id}
            tutorId={selectedSessionForReschedule.tutor_id}
            tutorName={selectedSessionForReschedule.tutor_name || 'Unknown'}
            studentName={selectedSessionForReschedule.student_name || 'Unknown'}
            subjectName={selectedSessionForReschedule.subject_name || 'Unknown'}
            currentStartTime={selectedSessionForReschedule.scheduled_start_at}
            currentDuration={selectedSessionForReschedule.duration_minutes}
            childColor={selectedSessionForReschedule.child_color || '#9333EA'}
            onSuccess={() => {
              fetchSessions();
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

