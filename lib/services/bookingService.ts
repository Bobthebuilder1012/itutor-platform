// =====================================================
// BOOKING SERVICE
// API calls to Supabase booking functions
// =====================================================

import { supabase } from '@/lib/supabase/client';
import type {
  TutorPublicCalendar,
  TutorAvailabilitySummary,
  GetTutorCalendarParams,
  CreateBookingRequestParams,
  TutorConfirmBookingParams,
  TutorDeclineBookingParams,
  TutorCounterOfferParams,
  StudentAcceptCounterParams,
  StudentCancelBookingParams,
  AddBookingMessageParams,
  Booking,
  BookingMessage,
  SessionType,
  TutorAvailabilityRule,
  TutorUnavailabilityBlock,
  TutorResponseMetrics
} from '@/lib/types/booking';

/**
 * Get tutor's public calendar (available slots + busy blocks)
 */
export async function getTutorPublicCalendar(
  tutorId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<TutorPublicCalendar> {
  const { data, error } = await supabase.rpc('get_tutor_public_calendar', {
    p_tutor_id: tutorId,
    p_range_start: rangeStart,
    p_range_end: rangeEnd
  } as GetTutorCalendarParams);

  if (error) throw error;
  return data as TutorPublicCalendar;
}

/**
 * Get tutor availability summary
 */
export async function getTutorAvailabilitySummary(
  tutorId: string
): Promise<TutorAvailabilitySummary> {
  const { data, error } = await supabase.rpc('get_tutor_availability_summary', {
    p_tutor_id: tutorId
  });

  if (error) throw error;
  return data as TutorAvailabilitySummary;
}

/**
 * Create booking request (student)
 */
export async function createBookingRequest(
  studentId: string,
  tutorId: string,
  subjectId: string,
  sessionTypeId: string,
  requestedStartAt: string,
  requestedEndAt: string,
  studentNotes?: string,
  durationMinutes: number = 60
): Promise<{ success: boolean; booking_id: string }> {
  const { data, error } = await supabase.rpc('create_booking_request', {
    p_student_id: studentId,
    p_tutor_id: tutorId,
    p_subject_id: subjectId,
    p_session_type_id: sessionTypeId,
    p_requested_start_at: requestedStartAt,
    p_requested_end_at: requestedEndAt,
    p_student_notes: studentNotes || null,
    p_duration_minutes: durationMinutes
  } as CreateBookingRequestParams & { p_duration_minutes: number });

  if (error) throw error;
  return data;
}

/**
 * Tutor confirms booking
 */
export async function tutorConfirmBooking(
  bookingId: string
): Promise<{ success: boolean; status: string }> {
  const { data, error } = await supabase.rpc('tutor_confirm_booking', {
    p_booking_id: bookingId
  } as TutorConfirmBookingParams);

  if (error) throw error;
  return data;
}

/**
 * Tutor declines booking
 */
export async function tutorDeclineBooking(
  bookingId: string,
  message?: string
): Promise<{ success: boolean; status: string }> {
  const { data, error } = await supabase.rpc('tutor_decline_booking', {
    p_booking_id: bookingId,
    p_message: message || null
  } as TutorDeclineBookingParams);

  if (error) throw error;
  return data;
}

/**
 * Tutor counter-offers with new time
 */
export async function tutorCounterOffer(
  bookingId: string,
  proposedStartAt: string,
  proposedEndAt: string,
  message?: string
): Promise<{ success: boolean; status: string; message_id: string }> {
  const { data, error } = await supabase.rpc('tutor_counter_offer', {
    p_booking_id: bookingId,
    p_proposed_start_at: proposedStartAt,
    p_proposed_end_at: proposedEndAt,
    p_message: message || null
  } as TutorCounterOfferParams);

  if (error) throw error;
  return data;
}

/**
 * Student accepts counter-offer
 */
export async function studentAcceptCounter(
  bookingId: string,
  messageId: string
): Promise<{ success: boolean; status: string }> {
  const { data, error } = await supabase.rpc('student_accept_counter', {
    p_booking_id: bookingId,
    p_message_id: messageId
  } as StudentAcceptCounterParams);

  if (error) throw error;
  return data;
}

/**
 * Student cancels booking
 */
export async function studentCancelBooking(
  bookingId: string,
  reason?: string
): Promise<{ success: boolean; status: string }> {
  const { data, error } = await supabase.rpc('student_cancel_booking', {
    p_booking_id: bookingId,
    p_reason: reason || null
  } as StudentCancelBookingParams);

  if (error) throw error;
  return data;
}

/**
 * Add message to booking thread
 */
export async function addBookingMessage(
  bookingId: string,
  message: string
): Promise<{ success: boolean; message_id: string }> {
  const { data, error } = await supabase.rpc('add_booking_message', {
    p_booking_id: bookingId,
    p_message: message
  } as AddBookingMessageParams);

  if (error) throw error;
  return data;
}

/**
 * Get booking by ID
 */
export async function getBooking(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();

  if (error) throw error;
  return data as Booking;
}

/**
 * Get bookings for student
 */
export async function getStudentBookings(studentId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Booking[];
}

/**
 * Get bookings for tutor
 */
export async function getTutorBookings(tutorId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Booking[];
}

/**
 * Get messages for a booking
 */
export async function getBookingMessages(bookingId: string): Promise<BookingMessage[]> {
  const { data, error } = await supabase
    .from('booking_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as BookingMessage[];
}

/**
 * Get session types for tutor
 */
export async function getSessionTypes(tutorId: string): Promise<SessionType[]> {
  const { data, error } = await supabase
    .from('session_types')
    .select('*')
    .eq('tutor_id', tutorId)
    .eq('is_active', true)
    .order('duration_minutes');

  if (error) throw error;
  return data as SessionType[];
}

/**
 * Get tutor availability rules
 */
export async function getTutorAvailabilityRules(
  tutorId: string
): Promise<TutorAvailabilityRule[]> {
  const { data, error } = await supabase
    .from('tutor_availability_rules')
    .select('*')
    .eq('tutor_id', tutorId)
    .eq('is_active', true)
    .order('day_of_week');

  if (error) throw error;
  return data as TutorAvailabilityRule[];
}

/**
 * Get tutor unavailability blocks
 */
export async function getTutorUnavailabilityBlocks(
  tutorId: string,
  startDate?: string,
  endDate?: string
): Promise<TutorUnavailabilityBlock[]> {
  let query = supabase
    .from('tutor_unavailability_blocks')
    .select('*')
    .eq('tutor_id', tutorId);

  if (startDate) {
    query = query.gte('end_at', startDate);
  }
  if (endDate) {
    query = query.lte('start_at', endDate);
  }

  const { data, error } = await query.order('start_at');

  if (error) throw error;
  return data as TutorUnavailabilityBlock[];
}

/**
 * Get tutor response metrics
 */
export async function getTutorResponseMetrics(
  tutorId: string
): Promise<TutorResponseMetrics | null> {
  const { data, error } = await supabase
    .from('tutor_response_metrics')
    .select('*')
    .eq('tutor_id', tutorId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows
    throw error;
  }
  return data as TutorResponseMetrics;
}

/**
 * Create/update tutor availability rule
 */
export async function upsertAvailabilityRule(
  rule: Partial<TutorAvailabilityRule>
): Promise<TutorAvailabilityRule> {
  const { data, error } = await supabase
    .from('tutor_availability_rules')
    .upsert(rule)
    .select()
    .single();

  if (error) throw error;
  return data as TutorAvailabilityRule;
}

/**
 * Delete availability rule
 */
export async function deleteAvailabilityRule(ruleId: string): Promise<void> {
  const { error } = await supabase
    .from('tutor_availability_rules')
    .delete()
    .eq('id', ruleId);

  if (error) throw error;
}

/**
 * Create/update unavailability block
 */
export async function upsertUnavailabilityBlock(
  block: Partial<TutorUnavailabilityBlock>
): Promise<TutorUnavailabilityBlock> {
  const { data, error } = await supabase
    .from('tutor_unavailability_blocks')
    .upsert(block)
    .select()
    .single();

  if (error) throw error;
  return data as TutorUnavailabilityBlock;
}

/**
 * Delete unavailability block
 */
export async function deleteUnavailabilityBlock(blockId: string): Promise<void> {
  const { error } = await supabase
    .from('tutor_unavailability_blocks')
    .delete()
    .eq('id', blockId);

  if (error) throw error;
}

/**
 * Subscribe to booking updates
 */
export function subscribeToBooking(
  bookingId: string,
  callback: (payload: any) => void
) {
  return supabase
    .channel(`booking:${bookingId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${bookingId}`
      },
      callback
    )
    .subscribe();
}

/**
 * Subscribe to booking messages
 */
export function subscribeToBookingMessages(
  bookingId: string,
  callback: (payload: any) => void
) {
  return supabase
    .channel(`booking_messages:${bookingId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'booking_messages',
        filter: `booking_id=eq.${bookingId}`
      },
      callback
    )
    .subscribe();
}


