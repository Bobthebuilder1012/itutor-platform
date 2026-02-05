import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { sendOnboardingEmail } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name, role')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const firstName = profile.full_name.split(' ')[0] || 'there';

    await sendOnboardingEmail({
      userId,
      userType: profile.role as 'student' | 'tutor' | 'parent',
      stage: 0,
      firstName,
      email: profile.email
    });

    await supabase.from('email_send_logs').insert({
      user_id: userId,
      stage: 0,
      email_type: `${profile.role}_stage_0`,
      status: 'success',
      resend_email_id: null
    });

    return NextResponse.json({ success: true, message: 'Welcome email sent' });

  } catch (error) {
    console.error('Error sending welcome email:', error);
    return NextResponse.json(
      { error: 'Failed to send email', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
