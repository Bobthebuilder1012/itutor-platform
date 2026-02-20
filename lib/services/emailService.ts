// =====================================================
// CENTRALIZED EMAIL SERVICE
// =====================================================
// Handles all email sending logic with Resend integration

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email using Resend
 */
export async function sendEmail({
  to,
  subject,
  html,
  from = process.env.RESEND_FROM_EMAIL || 'iTutor <hello@myitutor.com>',
}: SendEmailParams): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.error('Email not sent: RESEND_API_KEY is not configured');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error: any) {
    console.error('Email service error:', error);
    return {
      success: false,
      error: error?.message || 'Unknown error sending email',
    };
  }
}

/**
 * Get email template content from database by user type and stage
 */
export async function getEmailTemplate(
  userType: 'student' | 'tutor' | 'parent',
  stage: number
): Promise<{ subject: string; html: string } | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('email_templates')
      .select('subject, html_content')
      .eq('user_type', userType)
      .eq('stage', stage)
      .single();

    if (error || !data) {
      console.error('Error fetching template:', error);
      return null;
    }

    return {
      subject: data.subject,
      html: data.html_content,
    };
  } catch (error) {
    console.error('Error in getEmailTemplate:', error);
    return null;
  }
}

/**
 * Personalize email content by replacing placeholders
 */
export function personalizeEmail(
  content: string,
  user: {
    firstName?: string;
    fullName?: string;
    displayName?: string;
  }
): string {
  const firstName =
    user.displayName || user.firstName || user.fullName?.split(' ')[0] || 'there';

  return content.replace(/\{\{firstName\}\}/g, firstName);
}

/**
 * Log email send result to database
 */
export async function logEmailSend(params: {
  userId: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from('email_send_logs').insert({
      user_id: params.userId,
      email_type: params.emailType,
      recipient_email: params.recipientEmail,
      subject: params.subject,
      status: params.status,
      error_message: params.errorMessage,
    });
  } catch (error) {
    console.error('Error logging email send:', error);
  }
}
