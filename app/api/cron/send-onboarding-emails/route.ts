// CRON: send-onboarding-emails — runs every 15 minutes
// Sends staged onboarding emails to inactive users via onboarding_email_queue.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, getEmailTemplate, personalizeEmail, logEmailSend } from '@/lib/services/emailService';

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date().toISOString();
    const { data: pendingEmails, error: fetchError } = await supabase
      .from('onboarding_email_queue')
      .select('*')
      .eq('is_active', true)
      .lte('next_send_at', now)
      .order('next_send_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('[send-onboarding-emails] fetch error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({ message: 'No pending emails', sent: 0 });
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const queueItem of pendingEmails) {
      try {
        const shouldSend = await checkUserInactive(supabase, queueItem.user_id, queueItem.user_type);

        if (!shouldSend) {
          await supabase
            .from('onboarding_email_queue')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', queueItem.id);
          continue;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name, display_name')
          .eq('id', queueItem.user_id)
          .single();

        if (!profile) {
          await supabase
            .from('onboarding_email_queue')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', queueItem.id);
          failedCount++;
          continue;
        }

        const template = await getEmailTemplate(queueItem.user_type, queueItem.stage);
        if (!template) {
          failedCount++;
          continue;
        }

        const subject = personalizeEmail(template.subject, {
          displayName: profile.display_name,
          fullName: profile.full_name,
        });
        const html = personalizeEmail(template.html, {
          displayName: profile.display_name,
          fullName: profile.full_name,
        });

        const result = await sendEmail({ to: profile.email, subject, html });

        if (result.success) {
          const nextStage = queueItem.stage + 1;
          const isComplete = nextStage > 4;
          const delays: Record<number, number> = { 1: 24, 2: 48, 3: 48, 4: 48 };
          const nextSendAt = isComplete
            ? undefined
            : new Date(Date.now() + (delays[nextStage] ?? 24) * 3_600_000).toISOString();

          await supabase
            .from('onboarding_email_queue')
            .update({
              stage: nextStage,
              last_sent_at: new Date().toISOString(),
              next_send_at: nextSendAt,
              is_active: !isComplete,
              updated_at: new Date().toISOString(),
            })
            .eq('id', queueItem.id);

          await logEmailSend({
            userId: queueItem.user_id,
            emailType: `${queueItem.user_type}_stage_${queueItem.stage}`,
            recipientEmail: profile.email,
            subject,
            status: 'success',
          });

          sentCount++;
        } else {
          await logEmailSend({
            userId: queueItem.user_id,
            emailType: `${queueItem.user_type}_stage_${queueItem.stage}`,
            recipientEmail: profile.email,
            subject,
            status: 'failed',
            errorMessage: result.error,
          });
          failedCount++;
        }
      } catch (err: any) {
        console.error('[send-onboarding-emails] item error:', err);
        failedCount++;
      }
    }

    return NextResponse.json({ sent: sentCount, failed: failedCount, total: pendingEmails.length });
  } catch (err: any) {
    console.error('[send-onboarding-emails] cron error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function checkUserInactive(supabase: any, userId: string, userType: string): Promise<boolean> {
  try {
    if (userType === 'student') {
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId);
      return count === 0;
    }
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
      return !profile?.bio || !profile?.tutor_type || subjectsCount === 0;
    }
    if (userType === 'parent') {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', userId)
        .eq('role', 'student');
      return count === 0;
    }
    return true;
  } catch {
    return true;
  }
}
