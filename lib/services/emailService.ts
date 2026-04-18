// =====================================================
// CENTRALIZED EMAIL SERVICE
// =====================================================
// Handles all email sending logic with Resend integration

import type { ReactElement } from 'react';
import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export type SendEmailParams = {
  to: string;
  subject: string;
  from?: string;
} & ({ html: string; react?: never } | { react: ReactElement; html?: never });

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email using Resend
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  const from = params.from ?? (process.env.RESEND_FROM_EMAIL || 'iTutor <hello@myitutor.com>');
  const resend = getResend();
  if (!resend) {
    return { success: false, error: 'RESEND_API_KEY is not configured' };
  }

  const sendPayload =
    'react' in params && params.react
      ? { from, to: params.to, subject: params.subject, react: params.react }
      : { from, to: params.to, subject: params.subject, html: params.html };

  const { data, error } = await resend.emails.send(sendPayload);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, messageId: data?.id };
}

/**
 * Get email template content: from database if present, else from code-based templates.
 * Ensures welcome/onboarding emails work even when email_templates table is empty.
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
      .maybeSingle();

    if (!error && data?.subject && data?.html_content) {
      return {
        subject: data.subject,
        html: data.html_content,
      };
    }

    if (stage < 0 || stage > 4) return null;

    const { getEmailForStage, getCtaUrl } = await import('@/lib/email-templates');
    const ctaUrl = getCtaUrl(userType, stage as 0 | 1 | 2 | 3 | 4);
    const template = getEmailForStage(userType, stage as 0 | 1 | 2 | 3 | 4, {
      firstName: '{{firstName}}',
      ctaUrl,
    });
    return {
      subject: template.subject,
      html: template.html,
    };
  } catch (err) {
    console.error('Error in getEmailTemplate:', err);
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
