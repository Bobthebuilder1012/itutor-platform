// =====================================================
// CENTRALIZED EMAIL SERVICE
// =====================================================
// Handles all email sending logic with Resend integration

import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /**
   * The plain-text alternative, sent as multipart alongside the HTML. Worth
   * passing whenever you have one: text-only readers see an empty message
   * without it, and a missing text part counts against deliverability with
   * every major filter. lib/email/design returns one from the same description
   * as the HTML.
   */
  text?: string;
  from?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Optional recipient allowlist, for environments that hold real user data.
 *
 * Staging is a branch of production and carries real customer addresses — 294
 * of its 307 profiles are external. The `is_dev_account` column does NOT help
 * here: it exists, but it is only ever read to hide dev tutors from listings
 * (`app/api/tutors/listed-ids`, `app/api/groups`, the find-tutors and tutor
 * profile pages). No email path consults it, so flagging profiles suppresses
 * nothing. This does, and it works for recipients who have no profile row at
 * all.
 *
 * Format: comma-separated. An entry beginning with `@` matches a whole domain;
 * anything else must match the address exactly. Comparison is case-insensitive.
 *
 * Unset — which is production — means no filtering and no behaviour change.
 */
function isAllowedRecipient(to: string): boolean {
  const raw = process.env.EMAIL_ALLOWLIST?.trim();
  if (!raw) return true; // No allowlist configured → send, as before.

  const recipient = to.trim().toLowerCase();
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith('@') ? recipient.endsWith(entry) : recipient === entry));
}

/**
 * Send an email using Resend
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = process.env.RESEND_FROM_EMAIL || 'iTutor <hello@myitutor.com>',
}: SendEmailParams): Promise<EmailResult> {
  const resend = getResend();
  // No RESEND_API_KEY configured (e.g. staging without email set up) → no-op,
  // so nothing is sent by accident. Sending is enabled the moment a key exists.
  if (!resend) {
    console.log(`[EMAIL SKIPPED — no RESEND_API_KEY] to=${to} subject=${subject}`);
    return { success: true, messageId: 'disabled' };
  }
  // Reported as success, matching the no-key path above: a suppressed send is a
  // deliberate outcome, not a failure for the caller to retry or surface.
  if (!isAllowedRecipient(to)) {
    console.log(`[EMAIL SUPPRESSED — not in EMAIL_ALLOWLIST] to=${to} subject=${subject}`);
    return { success: true, messageId: 'suppressed' };
  }
  try {
    // Omitted rather than sent empty when the caller has none: Resend treats a
    // present-but-empty text part as a text part, which is worse for the reader
    // than having only HTML.
    const { data, error } = await resend.emails.send(
      text ? { from, to, subject, html, text } : { from, to, subject, html }
    );
    if (error) return { success: false, error: (error as { message?: string }).message ?? 'Send failed' };
    return { success: true, messageId: data?.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Send failed' };
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
