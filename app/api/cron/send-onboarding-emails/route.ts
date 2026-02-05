import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { sendOnboardingEmail, calculateNextSendTime } from '@/lib/services/emailService';
import { UserType, EmailStage } from '@/lib/email-templates/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface QueueItem {
  id: string;
  user_id: string;
  user_type: UserType;
  stage: EmailStage;
  profiles: {
    email: string;
    full_name: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const results = { sent: 0, deactivated: 0, errors: 0, processed: 0 };

    const { data: queueItems, error: fetchError } = await supabase
      .from('onboarding_email_queue')
      .select('id, user_id, user_type, stage, profiles!inner(email, full_name)')
      .eq('is_active', true)
      .lte('next_send_at', new Date().toISOString())
      .limit(50);

    if (fetchError) {
      console.error('Error fetching queue items:', fetchError);
      return NextResponse.json({ error: 'Database error', details: fetchError.message }, { status: 500 });
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ message: 'No emails to send', ...results });
    }

    for (const item of queueItems as unknown as QueueItem[]) {
      results.processed++;

      try {
        const isActivated = await checkActivation(supabase, item.user_id, item.user_type);

        if (isActivated) {
          await supabase
            .from('onboarding_email_queue')
            .update({ 
              is_active: false, 
              updated_at: new Date().toISOString() 
            })
            .eq('id', item.id);
          
          results.deactivated++;
          continue;
        }

        const firstName = item.profiles.full_name.split(' ')[0] || 'there';
        
        const resendResponse = await sendOnboardingEmail({
          userId: item.user_id,
          userType: item.user_type,
          stage: item.stage,
          firstName,
          email: item.profiles.email
        });

        const nextStage = (item.stage + 1) as EmailStage;
        const isComplete = nextStage > 4;

        await supabase
          .from('onboarding_email_queue')
          .update({
            stage: nextStage,
            last_sent_at: new Date().toISOString(),
            next_send_at: isComplete ? null : calculateNextSendTime(item.stage).toISOString(),
            is_active: !isComplete,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        await supabase.from('email_send_logs').insert({
          user_id: item.user_id,
          stage: item.stage,
          email_type: `${item.user_type}_stage_${item.stage}`,
          status: 'success',
          resend_email_id: resendResponse.id
        });

        results.sent++;

      } catch (error) {
        console.error(`Error processing email for user ${item.user_id}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        await supabase.from('email_send_logs').insert({
          user_id: item.user_id,
          stage: item.stage,
          email_type: `${item.user_type}_stage_${item.stage}`,
          status: 'error',
          error_message: errorMessage
        });

        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} emails`,
      ...results
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { 
        error: 'Cron job failed', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    );
  }
}

async function checkActivation(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  userType: UserType
): Promise<boolean> {
  if (userType === 'student' || userType === 'parent') {
    const { data } = await supabase
      .from('bookings')
      .select('id')
      .eq('student_id', userId)
      .limit(1);
    return !!data && data.length > 0;
  }

  if (userType === 'tutor') {
    const { data } = await supabase
      .from('tutor_subjects')
      .select('id')
      .eq('tutor_id', userId)
      .limit(1);
    return !!data && data.length > 0;
  }

  return false;
}
