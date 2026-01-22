'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import SessionJoinButton from '@/components/sessions/SessionJoinButton';
import CancelSessionModal from '@/components/tutor/CancelSessionModal';
import { formatDateTime, formatTimeRange } from '@/lib/utils/calendar';
import type { Session } from '@/lib/types/sessions';

export default function TutorSessionDetailPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [session, setSession] = useState<Session | null>(null);
  const [student, setStudent] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [subject, setSubject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadSessionData();
  }, [profile, profileLoading, router, sessionId]);

  async function loadSessionData() {
    try {
      // Fetch session with related data
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select(`
          *,
          student:profiles!fk_sessions_student(*),
          booking:bookings!fk_sessions_booking(*)
        `)
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;
      if (!sessionData) throw new Error('Session not found');

      // Verify tutor owns this session
      if (sessionData.tutor_id !== profile?.id) {
        throw new Error('Unauthorized');
      }

      setSession(sessionData as Session);
      setStudent(sessionData.student);
      setBooking(sessionData.booking);

      // Fetch subject details
      if (sessionData.booking?.subject_id) {
        const { data: subjectData } = await supabase
          .from('subjects')
          .select('*')
          .eq('id', sessionData.booking.subject_id)
          .single();
        setSubject(subjectData);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      alert('Failed to load session details');
      router.push('/tutor/sessions');
    } finally {
      setLoading(false);
    }
  }

  if (loading || profileLoading) {
    return (
      <DashboardLayout role="tutor" userName={profile?.full_name || 'Tutor'}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!session) {
    return (
      <DashboardLayout role="tutor" userName={profile?.full_name || 'Tutor'}>
        <div className="text-center py-12">
          <p className="text-gray-600">Session not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const sessionDate = new Date(session.scheduled_start_at);
  const sessionEndDate = new Date(new Date(session.scheduled_start_at).getTime() + session.duration_minutes * 60000);
  const canCancel = session.status === 'SCHEDULED' || session.status === 'JOIN_OPEN';

  return (
    <DashboardLayout role="tutor" userName={profile?.full_name || 'Tutor'}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/tutor/sessions')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Session Details</h1>
          </div>
          
          {/* Cancel Button */}
          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-lg transition-colors"
            >
              Cancel Session
            </button>
          )}
        </div>

        {/* Session Status Card */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {subject?.label || subject?.name || 'Session'}
              </h2>
              <p className="text-gray-600 mt-1">with {student?.full_name || 'Student'}</p>
            </div>
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${
              session.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
              session.status === 'JOIN_OPEN' ? 'bg-purple-100 text-purple-800' :
              session.status === 'COMPLETED_ASSUMED' ? 'bg-green-100 text-green-800' :
              session.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
              session.status === 'NO_SHOW_STUDENT' ? 'bg-orange-100 text-orange-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {session.status}
            </span>
          </div>

          {/* Date & Time */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-500">Date & Time</p>
                <p className="text-base font-semibold text-gray-900">
                  {formatDateTime(sessionDate)}
                </p>
                <p className="text-sm text-gray-600">
                  {formatTimeRange(sessionDate, sessionEndDate)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-500">Duration</p>
                <p className="text-base font-semibold text-gray-900">{session.duration_minutes} minutes</p>
              </div>
            </div>
          </div>

          {/* Join Button */}
          {session.join_url && (
            <div className="border-t border-gray-200 pt-4">
              <SessionJoinButton session={session} userRole="tutor" />
            </div>
          )}

          {!session.join_url && session.status !== 'CANCELLED' && (
            <div className="border-t border-gray-200 pt-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  ⏳ Meeting link is being generated...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Student Info */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Information</h3>
          <Link 
            href={`/tutor/student-profile/${student?.id}`}
            className="flex items-center gap-4 hover:bg-gray-50 -m-2 p-2 rounded-lg transition-colors"
          >
            {student?.avatar_url ? (
              <img 
                src={student.avatar_url} 
                alt={student.full_name}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-itutor-green text-white flex items-center justify-center text-lg font-semibold">
                {student?.full_name?.charAt(0) || 'S'}
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-gray-900 hover:text-itutor-green transition-colors">
                {student?.full_name || 'Student'}
              </p>
              <p className="text-sm text-gray-600">{student?.email}</p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Session Details */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Information</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Provider</span>
              <span className="font-medium text-gray-900 capitalize">
                {session.provider?.replace('_', ' ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Charge Amount</span>
              <span className="font-medium text-gray-900">
                ${session.charge_amount_ttd} TTD
              </span>
            </div>
            {booking?.message && (
              <div className="pt-3 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Student's Message:</p>
                <p className="text-gray-900">{booking.message}</p>
              </div>
            )}
          </div>
        </div>

        {/* Meeting Link (if available) */}
        {session.join_url && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Meeting Link</h3>
            <a
              href={session.join_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium break-all text-sm"
            >
              {session.join_url}
            </a>
          </div>
        )}
      </div>

      {/* Cancel Session Modal */}
      <CancelSessionModal
        session={session}
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onSuccess={() => {
          router.push('/tutor/sessions');
        }}
      />
    </DashboardLayout>
  );
}
