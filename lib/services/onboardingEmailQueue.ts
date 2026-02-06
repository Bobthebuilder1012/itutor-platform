// =====================================================
// ONBOARDING EMAIL QUEUE HELPER
// =====================================================
// Functions to manage onboarding email queue

import { createClient } from '@supabase/supabase-js';

interface QueueEmailParams {
  userId: string;
  userType: 'student' | 'tutor' | 'parent';
}

/**
 * Queue all onboarding emails for a new user
 * Called after user completes signup
 */
export async function queueOnboardingEmails(params: QueueEmailParams): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const emailSchedule = getEmailSchedule(params.userType);

    const queueItems = emailSchedule.map((schedule) => ({
      user_id: params.userId,
      user_type: params.userType,
      stage: schedule.stage,
      scheduled_for: new Date(now.getTime() + schedule.delayMinutes * 60 * 1000).toISOString(),
      status: 'pending',
    }));

    const { error } = await supabase
      .from('onboarding_email_queue')
      .insert(queueItems);

    if (error) {
      console.error('Error queueing onboarding emails:', error);
      throw error;
    }

    console.log(`✓ Queued ${queueItems.length} emails for user ${params.userId}`);
  } catch (error) {
    console.error('Error in queueOnboardingEmails:', error);
    throw error;
  }
}

/**
 * Get email schedule for a user type
 * Returns array of stages and their delay in minutes
 */
function getEmailSchedule(userType: string): Array<{ stage: number; delayMinutes: number }> {
  // Stage 0: Welcome email - send immediately
  // Stage 1: Day 1 email - send after 24 hours (1440 minutes)
  // Stage 3: Day 3 email - send after 72 hours (4320 minutes)
  // Stage 5: Day 5 email - send after 120 hours (7200 minutes)
  // Stage 7: Day 7 email - send after 168 hours (10080 minutes)
  
  const schedule = [
    { stage: 0, delayMinutes: 0 },       // Immediate welcome email
    { stage: 1, delayMinutes: 1440 },    // Day 1 (24 hours)
    { stage: 3, delayMinutes: 4320 },    // Day 3 (72 hours)
    { stage: 5, delayMinutes: 7200 },    // Day 5 (120 hours / 5 days)
    { stage: 7, delayMinutes: 10080 },   // Day 7 (168 hours / 7 days)
  ];

  return schedule;
}

/**
 * Cancel all pending emails for a user
 * Call this when user becomes active
 */
export async function cancelPendingEmails(userId: string): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from('onboarding_email_queue')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      console.error('Error cancelling emails:', error);
      throw error;
    }

    console.log(`✓ Cancelled pending emails for user ${userId}`);
  } catch (error) {
    console.error('Error in cancelPendingEmails:', error);
  }
}
