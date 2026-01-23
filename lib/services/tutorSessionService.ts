// =====================================================
// TUTOR SESSION SERVICE
// =====================================================
// Functions for tutors to manage their sessions

import { supabase } from '@/lib/supabase/client';

export interface CancelSessionParams {
  sessionId: string;
  cancellationReason: string;
  rescheduleStart?: string; // ISO string
  rescheduleEnd?: string; // ISO string
}

export interface CancelSessionResult {
  success: boolean;
  message: string;
  session_id: string;
  reschedule_requested: boolean;
}

/**
 * Cancel a session as a tutor
 */
export async function tutorCancelSession(params: CancelSessionParams): Promise<CancelSessionResult> {
  const { data, error } = await supabase.rpc('tutor_cancel_session', {
    p_session_id: params.sessionId,
    p_cancellation_reason: params.cancellationReason,
    p_reschedule_start: params.rescheduleStart || null,
    p_reschedule_end: params.rescheduleEnd || null
  });

  if (error) throw error;
  return data;
}

/**
 * Get all sessions for a tutor
 */
export async function getTutorSessions(tutorId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      student:student_id (
        id,
        full_name,
        display_name,
        username,
        avatar_url
      ),
      booking:booking_id (
        id,
        subject_id,
        subjects:subject_id (
          name,
          label,
          curriculum
        )
      )
    `)
    .eq('tutor_id', tutorId)
    .order('scheduled_start_at', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Get upcoming sessions for a tutor
 */
export async function getTutorUpcomingSessions(tutorId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      student:student_id (
        id,
        full_name,
        display_name,
        username,
        avatar_url
      ),
      booking:booking_id (
        id,
        subject_id,
        subjects:subject_id (
          name,
          label,
          curriculum
        )
      )
    `)
    .eq('tutor_id', tutorId)
    .in('status', ['SCHEDULED', 'JOIN_OPEN'])
    .gte('scheduled_start_at', new Date().toISOString())
    .order('scheduled_start_at', { ascending: true });

  if (error) throw error;
  return data;
}
