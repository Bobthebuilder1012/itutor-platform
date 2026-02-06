import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { sendEmail, getEmailTemplate, personalizeEmail } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    console.log('=== WELCOME EMAIL API CALLED ===');
    const { userId } = await request.json();
    console.log('User ID:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    console.log('Fetching profile from database...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    console.log('Profile query result:', { profile, error: profileError });

    if (profileError) {
      console.error('Database error fetching profile:', profileError);
      return NextResponse.json({ 
        error: 'Database error', 
        details: profileError.message,
        code: profileError.code 
      }, { status: 500 });
    }

    if (!profile) {
      console.error('No profile found for user ID:', userId);
      return NextResponse.json({ 
        error: 'Profile not found', 
        details: 'No profile exists with that user ID',
        userId 
      }, { status: 404 });
    }

    if (!profile.email) {
      console.error('Profile has no email:', profile);
      return NextResponse.json({ 
        error: 'Profile has no email', 
        details: 'User profile exists but email field is null'
      }, { status: 400 });
    }

    console.log('Profile found:', { email: profile.email, name: profile.full_name, role: profile.role });

    const firstName = profile.full_name?.split(' ')[0] || 'there';

    console.log('Fetching email template...');
    const template = await getEmailTemplate(profile.role as 'student' | 'tutor' | 'parent', 0);
    
    if (!template) {
      return NextResponse.json({
        error: 'Email template not found',
        details: `No template found for ${profile.role} stage 0`
      }, { status: 404 });
    }

    console.log('Personalizing email...');
    const personalizedSubject = personalizeEmail(template.subject, { firstName });
    const personalizedHtml = personalizeEmail(template.html, { firstName });

    console.log('Sending email...');
    const result = await sendEmail({
      to: profile.email,
      subject: personalizedSubject,
      html: personalizedHtml
    });

    if (!result.success) {
      console.error('Failed to send email:', result.error);
      return NextResponse.json({
        error: 'Failed to send email',
        details: result.error
      }, { status: 500 });
    }

    console.log('Email sent successfully:', result.messageId);

    const { error: logError } = await supabase.from('email_send_logs').insert({
      user_id: userId,
      stage: 0,
      email_type: `${profile.role}_stage_0`,
      status: 'success',
      resend_email_id: result.messageId || null
    });

    if (logError) {
      console.error('Failed to log email send:', logError);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Welcome email sent',
      emailId: result.messageId
    });

  } catch (error) {
    console.error('=== ERROR SENDING WELCOME EMAIL ===');
    console.error('Error details:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        error: 'Failed to send email', 
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
