// =====================================================
// LESSON OFFERS SERVICE
// =====================================================

import { supabase } from '@/lib/supabase/client';
import {
  LessonOffer,
  LessonOfferWithDetails,
  CreateOfferPayload,
  CounterOfferPayload,
  OfferStatus
} from '@/lib/types/lessonOffers';
import { getDisplayName } from '@/lib/utils/displayName';

/**
 * Create a new lesson offer (tutor → student)
 */
export async function createLessonOffer(
  tutorId: string,
  payload: CreateOfferPayload
): Promise<{ data: LessonOffer | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('lesson_offers')
      .insert({
        tutor_id: tutorId,
        student_id: payload.student_id,
        subject_id: payload.subject_id,
        proposed_start_at: payload.proposed_start_at,
        duration_minutes: payload.duration_minutes,
        tutor_note: payload.tutor_note || null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('Error creating lesson offer:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Get offers sent by a tutor
 */
export async function getTutorSentOffers(
  tutorId: string
): Promise<LessonOfferWithDetails[]> {
  try {
    const { data, error } = await supabase
      .from('lesson_offers')
      .select(`
        *,
        student:profiles!lesson_offers_student_id_fkey(
          username,
          display_name,
          full_name,
          avatar_url,
          school
        )
      `)
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((offer: any) => ({
      ...offer,
      student_name: offer.student ? getDisplayName(offer.student) : 'Unknown Student',
      student_username: offer.student?.username,
      student_avatar_url: offer.student?.avatar_url,
      student_school: offer.student?.school
    }));
  } catch (err) {
    console.error('Error fetching tutor sent offers:', err);
    return [];
  }
}

/**
 * Get offers received by a student
 */
export async function getStudentReceivedOffers(
  studentId: string
): Promise<LessonOfferWithDetails[]> {
  try {
    const { data, error } = await supabase
      .from('lesson_offers')
      .select(`
        *,
        tutor:profiles!lesson_offers_tutor_id_fkey(
          username,
          display_name,
          full_name,
          avatar_url
        )
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((offer: any) => ({
      ...offer,
      tutor_name: offer.tutor ? getDisplayName(offer.tutor) : 'Unknown Tutor',
      tutor_username: offer.tutor?.username,
      tutor_avatar_url: offer.tutor?.avatar_url
    }));
  } catch (err) {
    console.error('Error fetching student received offers:', err);
    return [];
  }
}

/**
 * Student accepts an offer
 */
export async function acceptOffer(
  offerId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('lesson_offers')
      .update({
        status: 'accepted',
        last_action_by: 'student',
        updated_at: new Date().toISOString()
      })
      .eq('id', offerId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error accepting offer:', err);
    return { success: false, error: err as Error };
  }
}

/**
 * Student declines an offer
 */
export async function declineOffer(
  offerId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('lesson_offers')
      .update({
        status: 'declined',
        last_action_by: 'student',
        updated_at: new Date().toISOString()
      })
      .eq('id', offerId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error declining offer:', err);
    return { success: false, error: err as Error };
  }
}

/**
 * Student sends counter-offer
 */
export async function counterOffer(
  offerId: string,
  payload: CounterOfferPayload
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('lesson_offers')
      .update({
        status: 'countered',
        counter_proposed_start: payload.counter_proposed_start,
        counter_duration_minutes: payload.counter_duration_minutes || null,
        counter_note: payload.counter_note || null,
        last_action_by: 'student',
        updated_at: new Date().toISOString()
      })
      .eq('id', offerId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error sending counter-offer:', err);
    return { success: false, error: err as Error };
  }
}

/**
 * Tutor accepts a counter-offer
 */
export async function acceptCounterOffer(
  offerId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('lesson_offers')
      .update({
        status: 'accepted',
        last_action_by: 'tutor',
        updated_at: new Date().toISOString()
      })
      .eq('id', offerId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error accepting counter-offer:', err);
    return { success: false, error: err as Error };
  }
}

/**
 * Delete an offer (before acceptance)
 */
export async function deleteOffer(
  offerId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('lesson_offers')
      .delete()
      .eq('id', offerId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('Error deleting offer:', err);
    return { success: false, error: err as Error };
  }
}

/**
 * Subscribe to offer updates for real-time notifications
 */
export function subscribeToOfferUpdates(
  userId: string,
  userRole: 'tutor' | 'student',
  callback: (payload: any) => void
) {
  const column = userRole === 'tutor' ? 'tutor_id' : 'student_id';
  
  const subscription = supabase
    .channel('lesson_offers_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lesson_offers',
        filter: `${column}=eq.${userId}`
      },
      callback
    )
    .subscribe();

  return subscription;
}


