// =====================================================
// CRON JOB: SEND ONBOARDING EMAILS (CORRECTED)
// =====================================================
// Runs every 15 minutes to send scheduled onboarding emails
// Updated to match actual table structure

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, getEmailTemplate, personalizeEmail, logEmailSend } from '@/lib/services/emailService';

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  console.log('=== Onboarding Email Cron Job Started ===');

  // Verify cron secret
  if (!verifyCronSecret(request)) {
    console.log('Unauthorized cron attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Use service role key for admin access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Find emails that are scheduled to be sent now
    const now = new Date().toISOString();
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('onboarding_email_queue')
      .select('*')
      .eq('is_active', true)
      .lte('next_send_at', now)
      .order('next_send_at', { ascending: true })
      .limit(50); // Process max 50 emails per run

    if (fetchError) {
      console.error('Error fetching pending emails:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('No pending emails to send');
      return NextResponse.json({ message: 'No pending emails', sent: 0 });
    }

    console.log(`Found ${pendingEmails.length} pending emails`);

    let sentCount = 0;
    let failedCount = 0;

    // 2. Process each pending email
    for (const queueItem of pendingEmails) {
      try {
        // Check if user is still inactive (should receive email)
        const shouldSendEmail = await checkUserInactive(supabase, queueItem.user_id, queueItem.user_type);
        
        if (!shouldSendEmail) {
          console.log(`User ${queueItem.user_id} is now active - deactivating queue`);
          await supabase
            .from('onboarding_email_queue')
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString() 
            })
            .eq('id', queueItem.id);
          continue;
        }

        // Get user details
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('email, full_name, display_name')
          .eq('id', queueItem.user_id)
          .single();

        if (profileError || !profile) {
          console.error(`User profile not found: ${queueItem.user_id}`);
          await supabase
            .from('onboarding_email_queue')
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', queueItem.id);
          failedCount++;
          continue;
        }

        // Get email template for current stage
        const template = await getEmailTemplate(queueItem.user_type, queueItem.stage);
        if (!template) {
          console.error(`Template not found: ${queueItem.user_type} stage ${queueItem.stage}`);
          failedCount++;
          continue;
        }

        // Personalize email
        const personalizedSubject = personalizeEmail(template.subject, {
          displayName: profile.display_name,
          fullName: profile.full_name,
        });
        const personalizedHtml = personalizeEmail(template.html, {
          displayName: profile.display_name,
          fullName: profile.full_name,
        });

        // Send email
        const result = await sendEmail({
          to: profile.email,
          subject: personalizedSubject,
          html: personalizedHtml,
        });

        if (result.success) {
          // Calculate next stage and send time
          const nextStage = queueItem.stage + 1;
          const isComplete = nextStage > 4; // Stages 0-4 (5 emails total)
          
          let nextSendAt;
          if (!isComplete) {
            // Calculate delay for next email
            const delays = {
              1: 24,    // Day 1: 24 hours after welcome
              2: 48,    // Day 3: 48 hours after day 1 (72 hours total)
              3: 48,    // Day 5: 48 hours after day 3 (120 hours total)
              4: 48,    // Day 7: 48 hours after day 5 (168 hours total)
            };
            const hoursUntilNext = delays[nextStage as keyof typeof delays] || 24;
            nextSendAt = new Date(Date.now() + hoursUntilNext * 60 * 60 * 1000).toISOString();
          }

          // Update queue
          await supabase
            .from('onboarding_email_queue')
            .update({ 
              stage: nextStage,
              last_sent_at: new Date().toISOString(),
              next_send_at: nextSendAt,
              is_active: !isComplete,
              updated_at: new Date().toISOString()
            })
            .eq('id', queueItem.id);

          // Log success
          await logEmailSend({
            userId: queueItem.user_id,
            emailType: `${queueItem.user_type}_stage_${queueItem.stage}`,
            recipientEmail: profile.email,
            subject: personalizedSubject,
            status: 'success',
          });

          sentCount++;
          console.log(`✓ Sent ${queueItem.user_type} stage ${queueItem.stage} email to ${profile.email}`);
        } else {
          // Log failure but don't deactivate (will retry next run)
          await logEmailSend({
            userId: queueItem.user_id,
            emailType: `${queueItem.user_type}_stage_${queueItem.stage}`,
            recipientEmail: profile.email,
            subject: personalizedSubject,
            status: 'failed',
            errorMessage: result.error,
          });

          failedCount++;
          console.error(`✗ Failed to send email to ${profile.email}:`, result.error);
        }
      } catch (error: any) {
        console.error('Error processing email:', error);
        failedCount++;
      }
    }

    console.log(`=== Cron Job Complete: ${sentCount} sent, ${failedCount} failed ===`);

    return NextResponse.json({
      message: 'Emails processed',
      sent: sentCount,
      failed: failedCount,
      total: pendingEmails.length,
    });
  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Check if user is still inactive and should receive onboarding emails
 * Returns true if user should receive email, false if they're active
 */
async function checkUserInactive(
  supabase: any,
  userId: string,
  userType: string
): Promise<boolean> {
  try {
    // For students: Check if they have booked any sessions
    if (userType === 'student') {
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId);
      
      return count === 0; // Inactive if no bookings
    }

    // For tutors: Check if they have completed profile setup
    if (userType === 'tutor') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('bio, tutor_type')
        .eq('id', userId)
        .single();
      
      const { count: subjectsCount } = await supabase
        .from('tutor_subjects')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', userId);
      
      // Inactive if profile incomplete (no bio or no subjects)
      return !profile?.bio || !profile?.tutor_type || subjectsCount === 0;
    }

    // For parents: Check if they have added any children
    if (userType === 'parent') {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', userId)
        .eq('role', 'student');
      
      return count === 0; // Inactive if no children added
    }

    return true; // Default to sending email
  } catch (error) {
    console.error('Error checking user activity:', error);
    return true; // On error, default to sending email
  }
}
