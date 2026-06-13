// =====================================================
// SESSION SERVICE
// =====================================================
// Business logic for session management
// USE SERVICE ROLE CLIENT FOR SECURE OPERATIONS

import { getServiceClient } from '@/lib/supabase/server';
import { scheduleSessionReminders } from '@/lib/reminders/scheduleReminders';
import type { Session, SessionRules } from '@/lib/types/sessions';
import { calculateSessionRules } from '@/lib/types/sessions';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';
import { refundPayment } from '@/lib/payments/refundService';
import { ensureTutorConnected, createMeeting, getMeetingState } from './videoProviders';

// Wait window before a no-show can be reported (matches the modal copy).
export const NO_SHOW_WAIT_MINUTES = 15;

/**
 * Create session for a confirmed booking
 */
export async function createSessionForBooking(bookingId: string): Promise<Session> {
  console.log('🔧 createSessionForBooking called with:', bookingId);
  const supabase = getServiceClient();

  // 1. Load booking
  console.log('📖 Loading booking...');
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    console.error('❌ Booking not found:', bookingError);
    throw new Error('Booking not found');
  }

  console.log('✅ Booking loaded:', { id: booking.id, status: booking.status });

  if (booking.status !== 'CONFIRMED') {
    console.error('❌ Booking status is not CONFIRMED:', booking.status);
    throw new Error('Booking must be confirmed to create session');
  }

  // 2. Check if session already exists
  console.log('🔍 Checking for existing session...');
  const { data: existingSession } = await supabase
    .from('sessions')
    .select('*')
    .eq('booking_id', bookingId)
    .single();

  if (existingSession) {
    console.log('ℹ️ Session already exists:', existingSession.id);
    const existing = existingSession as Session;
    if (!existing.join_url || !existing.meeting_external_id) {
      console.log('🔁 Existing session missing meeting link. Retrying meeting creation...');
      try {
        const meetingInfo = await createMeeting(existing);
        const { data: updatedSession } = await supabase
          .from('sessions')
          .update({
            meeting_external_id: meetingInfo.meeting_external_id,
            join_url: meetingInfo.join_url,
            meeting_created_at: meetingInfo.meeting_created_at
          })
          .eq('id', existing.id)
          .select()
          .single();
        const nextSession = (updatedSession as Session) || existing;
        try {
          await scheduleSessionReminders(nextSession);
        } catch (reminderError) {
          console.error('⚠️ Failed to schedule reminders for existing session:', reminderError);
        }
        return nextSession;
      } catch (err) {
        console.error('❌ Retry meeting creation failed:', err);
        try {
          await scheduleSessionReminders(existing);
        } catch (reminderError) {
          console.error('⚠️ Failed to schedule reminders for existing session:', reminderError);
        }
        return existing;
      }
    }
    try {
      await scheduleSessionReminders(existing);
    } catch (reminderError) {
      console.error('⚠️ Failed to schedule reminders for existing session:', reminderError);
    }
    return existing;
  }

  // 3. Ensure tutor has video provider connected
  console.log('🔌 Checking video provider connection...');
  const { provider } = await ensureTutorConnected(booking.tutor_id);
  console.log('✅ Video provider connected:', provider);

  // 4. Calculate duration and rules
  // Use confirmed times from booking
  const scheduledStart = new Date(booking.confirmed_start_at);
  const scheduledEnd = new Date(booking.confirmed_end_at);
  const durationMinutes = Math.round(
    (scheduledEnd.getTime() - scheduledStart.getTime()) / 60000
  );

  const rules = calculateSessionRules(durationMinutes);

  // 5. Insert session
  console.log('💾 Inserting session into database...');

  // Pin financials to what we quoted at checkout time. The booking
  // captured price_ttd / platform_fee_ttd / tutor_payout_ttd via
  // direct-book or materialize_paid_booking (mig 153); reusing those
  // means a commission-tier change deployed after checkout but before
  // session creation can't drift the tutor's payout away from what
  // they were promised.
  const chargeAmount = Number(booking.price_ttd ?? 0);
  const bookingPlatformFee = Number(booking.platform_fee_ttd ?? 0);
  const bookingPayout = Number(booking.tutor_payout_ttd ?? 0);
  const hasStoredCommission = bookingPlatformFee + bookingPayout > 0;
  const recomputed = await calculateCommissionForTutor(supabase, booking.tutor_id, chargeAmount);
  const platformFee = hasStoredCommission ? bookingPlatformFee : recomputed.platformFee;
  const payoutAmount = hasStoredCommission ? bookingPayout : recomputed.payoutAmount;

  
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      booking_id: bookingId,
      tutor_id: booking.tutor_id,
      student_id: booking.student_id,
      provider,
      scheduled_start_at: booking.confirmed_start_at,
      scheduled_end_at: booking.confirmed_end_at,
      duration_minutes: durationMinutes,
      no_show_wait_minutes: rules.no_show_wait_minutes,
      min_payable_minutes: rules.min_payable_minutes,
      charge_scheduled_at: booking.confirmed_end_at,
      charge_amount_ttd: chargeAmount,
      payout_amount_ttd: payoutAmount,
      platform_fee_ttd: platformFee,
      status: 'SCHEDULED',
      ...(booking.community_id && { community_id: booking.community_id }),
    })
    .select()
    .single();

  if (sessionError || !session) {
    console.error('❌ Failed to insert session:', sessionError);
    throw new Error('Failed to create session: ' + (sessionError?.message || 'Unknown error'));
  }
  
  console.log('✅ Session inserted successfully:', session.id);

  try {
    await scheduleSessionReminders(session as Session);
  } catch (reminderError) {
    console.error('⚠️ Failed to schedule reminders for new session:', reminderError);
  }

  // 6. Create meeting
  console.log('📹 Creating video meeting...');
  try {
    const meetingInfo = await createMeeting(session as Session);
    console.log('✅ Meeting created:', meetingInfo.meeting_external_id);
    
    const { data: updatedSession } = await supabase
      .from('sessions')
      .update({
        meeting_external_id: meetingInfo.meeting_external_id,
        join_url: meetingInfo.join_url,
        meeting_created_at: meetingInfo.meeting_created_at
      })
      .eq('id', session.id)
      .select()
      .single();

    console.log('✅ Session updated with meeting URL');
    return updatedSession as Session;
  } catch (err) {
    console.error('❌ Failed to create meeting:', err);
    // Return session without meeting info (can be retried later)
    return session as Session;
  }
}

/**
 * Mark student as no-show
 */
export async function markStudentNoShow(
  sessionId: string,
  tutorId: string
): Promise<Session> {
  const supabase = getServiceClient();

  // 1. Load session
  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    throw new Error('Session not found');
  }

  // 2. Validate tutor
  if (session.tutor_id !== tutorId) {
    throw new Error('Unauthorized');
  }

  // 3. Validate timing
  const now = new Date();
  const scheduledStart = new Date(session.scheduled_start_at);
  const noShowDeadline = new Date(
    scheduledStart.getTime() + NO_SHOW_WAIT_MINUTES * 60000
  );

  if (now < noShowDeadline) {
    throw new Error(
      `Must wait ${NO_SHOW_WAIT_MINUTES} minutes before marking no-show`
    );
  }

  // 4. Validate status
  if (!['SCHEDULED', 'JOIN_OPEN'].includes(session.status)) {
    throw new Error('Session already resolved');
  }

  // 5. Calculate financials (50% charge)
  const chargeAmount = session.charge_amount_ttd * 0.5;
  const platformFee = chargeAmount * 0.1;
  const payoutAmount = chargeAmount * 0.9;

  // 6. Update session
  const { data: updatedSession, error: updateError } = await supabase
    .from('sessions')
    .update({
      status: 'NO_SHOW_STUDENT',
      tutor_marked_no_show_at: now.toISOString(),
      meeting_ended_at: now.toISOString(),
      charge_amount_ttd: chargeAmount,
      platform_fee_ttd: platformFee,
      payout_amount_ttd: payoutAmount,
      notes: {
        ...session.notes,
        no_show_reason: 'Student did not join within wait period',
        no_show_marked_by: tutorId,
        no_show_marked_at: now.toISOString()
      }
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) {
    throw new Error('Failed to mark no-show');
  }

  // TODO: Trigger payment capture (stub for now)
  // await capturePayment(sessionId);

  return updatedSession as Session;
}

/**
 * Mark tutor as no-show (initiated by the student).
 * Issues a full refund to the student via refundService, which also moves the
 * session to NO_SHOW_TUTOR and reverts the tutor's pending payout ledger row.
 */
export async function markTutorNoShow(
  sessionId: string,
  studentId: string
): Promise<Session> {
  const supabase = getServiceClient();

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    throw new Error('Session not found');
  }

  if (session.student_id !== studentId) {
    throw new Error('Unauthorized');
  }

  const now = new Date();
  const scheduledStart = new Date(session.scheduled_start_at);
  const noShowDeadline = new Date(scheduledStart.getTime() + NO_SHOW_WAIT_MINUTES * 60000);

  if (now < noShowDeadline) {
    throw new Error(`Must wait ${NO_SHOW_WAIT_MINUTES} minutes before marking no-show`);
  }

  if (!['SCHEDULED', 'JOIN_OPEN'].includes(session.status)) {
    throw new Error('Session already resolved');
  }

  // Find the refundable payment for this booking, if any.
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('booking_id', session.booking_id)
    .in('status', ['succeeded', 'partially_refunded'])
    .maybeSingle();

  if (payment?.id) {
    const result = await refundPayment({
      paymentId: payment.id,
      reason: 'tutor_noshow',
      actorId: studentId,
      sessionStatusOverride: 'NO_SHOW_TUTOR',
      client: supabase,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }
  } else {
    // No captured payment — just zero out the session so the cron skips it.
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        status: 'NO_SHOW_TUTOR',
        meeting_ended_at: now.toISOString(),
        charge_amount_ttd: 0,
        platform_fee_ttd: 0,
        payout_amount_ttd: 0,
        notes: {
          ...session.notes,
          no_show_reason: 'Tutor did not join within wait period',
          no_show_marked_by: studentId,
          no_show_marked_at: now.toISOString(),
        },
      })
      .eq('id', sessionId);

    if (updateError) {
      throw new Error('Failed to mark no-show');
    }
  }

  const { data: updated } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  return updated as Session;
}

/**
 * Process scheduled charges (run every minute via cron)
 */
export async function processScheduledCharges(): Promise<void> {
  const supabase = getServiceClient();
  const now = new Date();

  // Find sessions ready to charge
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .in('status', ['SCHEDULED', 'JOIN_OPEN'])
    .is('charged_at', null)
    .lte('charge_scheduled_at', now.toISOString());

  if (error || !sessions || sessions.length === 0) {
    return;
  }

  console.log(`Processing ${sessions.length} scheduled charges...`);

  for (const session of sessions) {
    try {
      // Early-end detection is a BONUS — if the video provider call
      // fails (token expired, provider unreachable, no real meeting was
      // ever held in test environments) we proceed with COMPLETED_ASSUMED
      // at the full charge. Previously a single getMeetingState throw
      // would skip the whole iteration and leave the session permanently
      // un-charged.
      let meetingState: { meeting_started_at?: string | null; meeting_ended_at?: string | null } = {};
      try {
        meetingState = await getMeetingState(session as Session);
      } catch (mErr) {
        console.warn(
          `[process-charges] getMeetingState failed for ${session.id}; proceeding with COMPLETED_ASSUMED:`,
          (mErr as Error)?.message ?? mErr
        );
      }

      const scheduledEnd = new Date(session.scheduled_end_at);
      let status = 'COMPLETED_ASSUMED';
      let chargeAmount = session.charge_amount_ttd;
      let platformFee = 0;
      let payoutAmount = 0;

      // Early end detection (only when meetingState was retrievable)
      if (meetingState.meeting_ended_at) {
        const meetingEnd = new Date(meetingState.meeting_ended_at);
        if (meetingEnd < scheduledEnd) {
          // Meeting ended early - no charge
          status = 'EARLY_END_SHORT';
          chargeAmount = 0;
        }
      }

      // Pin financials to whatever sessionService stored at session-create
      // so a commission-tier change shipped between session creation and
      // the cron run can't shift what the tutor was promised. We only fall
      // back to recomputing if the session row is missing those values.
      if (status === 'COMPLETED_ASSUMED') {
        const storedPlatformFee = Number(session.platform_fee_ttd ?? 0);
        const storedPayout = Number(session.payout_amount_ttd ?? 0);
        if (storedPlatformFee + storedPayout > 0) {
          platformFee = storedPlatformFee;
          payoutAmount = storedPayout;
        } else {
          const commission = await calculateCommissionForTutor(supabase, session.tutor_id, chargeAmount);
          platformFee = commission.platformFee;
          payoutAmount = commission.payoutAmount;
        }
      }

      // Update session
      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          status,
          charge_amount_ttd: chargeAmount,
          platform_fee_ttd: platformFee,
          payout_amount_ttd: payoutAmount,
          meeting_ended_at: meetingState.meeting_ended_at || null,
          meeting_started_at: meetingState.meeting_started_at || null,
          notes: {
            ...session.notes,
            charge_processed_at: now.toISOString(),
            early_end_detected: status === 'EARLY_END_SHORT'
          }
        })
        .eq('id', session.id);

      if (updateError) {
        console.error(`Failed to update session ${session.id}:`, updateError);
        continue;
      }

      // Capture payment if charge amount > 0
      if (chargeAmount > 0) {
        try {
          // TODO: Implement payment capture
          // await capturePayment(session.id);
          
          await supabase
            .from('sessions')
            .update({ charged_at: now.toISOString() })
            .eq('id', session.id);
            
          console.log(`✅ Charged session ${session.id}: ${chargeAmount} TTD`);
        } catch (paymentError) {
          console.error(`Payment capture failed for ${session.id}:`, paymentError);
          await supabase
            .from('sessions')
            .update({
              notes: {
                ...session.notes,
                payment_status: 'FAILED',
                payment_error: String(paymentError)
              }
            })
            .eq('id', session.id);
        }
      } else {
        // No charge - mark as charged (processed)
        await supabase
          .from('sessions')
          .update({ charged_at: now.toISOString() })
          .eq('id', session.id);
          
        console.log(`✅ Session ${session.id} ended early - no charge`);
      }
    } catch (err) {
      console.error(`Error processing session ${session.id}:`, err);
    }
  }
}

/**
 * Update join window status (can be called or derived in UI)
 */
export async function updateJoinWindowStatus(): Promise<void> {
  const supabase = getServiceClient();
  const now = new Date();
  const joinWindowStart = new Date(now.getTime() + 5 * 60000); // 5 min ahead

  const { error } = await supabase
    .from('sessions')
    .update({ status: 'JOIN_OPEN' })
    .eq('status', 'SCHEDULED')
    .lte('scheduled_start_at', joinWindowStart.toISOString());

  if (error) {
    console.error('Failed to update join window status:', error);
  }
}

