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

    // Create ONE queue entry at stage 0 (welcome email)
    // The cron job will handle progression through stages
    const { error } = await supabase
      .from('onboarding_email_queue')
      .insert({
        user_id: params.userId,
        user_type: params.userType,
        stage: 0, // Start at stage 0 (welcome email)
        next_send_at: new Date().toISOString(), // Send immediately
        is_active: true,
      });

    if (error) {
      // Ignore duplicate key errors (user already queued)
      if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
        console.error('Error queueing onboarding emails:', error);
        throw error;
      }
    }

    console.log(`✓ Queued onboarding emails for user ${params.userId}`);
  } catch (error) {
    console.error('Error in queueOnboardingEmails:', error);
    throw error;
  }
}

// Email schedule is now handled by the cron job
// Stage progression: 0 (welcome) → 1 (day 1) → 2 (day 3) → 3 (day 5) → 4 (day 7)
// The cron job automatically calculates next_send_at when advancing stages

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
      .update({ 
        is_active: false, 
        updated_at: new Date().toISOString() 
      })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Error cancelling emails:', error);
      throw error;
    }

    console.log(`✓ Cancelled pending emails for user ${userId}`);
  } catch (error) {
    console.error('Error in cancelPendingEmails:', error);
  }
}
