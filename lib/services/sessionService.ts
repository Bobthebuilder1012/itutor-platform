// =====================================================
// SESSION SERVICE
// =====================================================
// Business logic for session management
// USE SERVICE ROLE CLIENT FOR SECURE OPERATIONS

import { getServiceClient } from '@/lib/supabase/server';
import type { Session, SessionRules } from '@/lib/types/sessions';
import { calculateSessionRules } from '@/lib/types/sessions';
import { calculateCommission } from '@/lib/utils/commissionCalculator';
import { ensureTutorConnected, createMeeting, getMeetingState } from './videoProviders';

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
        return (updatedSession as Session) || existing;
      } catch (err) {
        console.error('❌ Retry meeting creation failed:', err);
        return existing;
      }
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
  
  // Calculate financials using tiered commission structure
  const chargeAmount = booking.price_ttd || 0;
  const { platformFee, payoutAmount } = calculateCommission(chargeAmount);
  
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
      status: 'SCHEDULED'
    })
    .select()
    .single();

  if (sessionError || !session) {
    console.error('❌ Failed to insert session:', sessionError);
    throw new Error('Failed to create session: ' + (sessionError?.message || 'Unknown error'));
  }
  
  console.log('✅ Session inserted successfully:', session.id);

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
    scheduledStart.getTime() + session.no_show_wait_minutes * 60000
  );

  if (now < noShowDeadline) {
    throw new Error(
      `Must wait ${session.no_show_wait_minutes} minutes before marking no-show`
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
      // Check for early end override
      const meetingState = await getMeetingState(session as Session);
      
      const scheduledEnd = new Date(session.scheduled_end_at);
      let status = 'COMPLETED_ASSUMED';
      let chargeAmount = session.charge_amount_ttd;
      let platformFee = 0;
      let payoutAmount = 0;

      // Early end detection
      if (meetingState.meeting_ended_at) {
        const meetingEnd = new Date(meetingState.meeting_ended_at);
        if (meetingEnd < scheduledEnd) {
          // Meeting ended early - no charge
          status = 'EARLY_END_SHORT';
          chargeAmount = 0;
        }
      }

      // Calculate financials for completed session using tiered commission
      if (status === 'COMPLETED_ASSUMED') {
        const commission = calculateCommission(chargeAmount);
        platformFee = commission.platformFee;
        payoutAmount = commission.payoutAmount;
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

