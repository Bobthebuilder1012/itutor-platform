// =====================================================
// CENTRALIZED EMAIL SERVICE
// =====================================================
// Handles all email sending logic with Resend integration

import { Resend } from 'resend';
import { getCustomerIoEmailConfig, sendViaCustomerIo } from '@/lib/email/providers/customerio';

/**
 * Which service actually sends.
 *
 * This exists because a provider can be taken away from you with no notice —
 * a suspension, an outage, a billing dispute — and every transactional email
 * on the platform stops at once. Swapping provider should be an environment
 * variable and a redeploy, not a code change under time pressure.
 *
 * Defaults to Resend, so an environment that says nothing behaves exactly as
 * it did before this switch existed.
 */
type EmailProvider = 'resend' | 'customerio';

function getProvider(): EmailProvider {
  const raw = process.env.EMAIL_PROVIDER?.trim();
  if (!raw) return 'resend';

  // Punctuation and case are stripped before matching, so `customer.io`,
  // `Customer.IO` and `customer-io` all select Customer.io. This is not
  // tidiness: the product is written with a dot everywhere except in this
  // value, an exact-match check would read the dotted spelling as "not
  // Customer.io", and the fallback is the provider you are trying to move off.
  // Combined with sendEmail reporting success when a provider is unconfigured,
  // a single typo would mean silently sending nothing at all.
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'customerio') return 'customerio';
  if (normalized === 'resend') return 'resend';

  // An unrecognised value is a misconfiguration, not a preference. Falling
  // through to the default silently is how an outage lasts a day longer than
  // it needed to, so it is said out loud on every send.
  console.error(
    `[EMAIL] Unrecognised EMAIL_PROVIDER "${raw}" — falling back to Resend. ` +
      `Valid values: "resend", "customerio".`
  );
  return 'resend';
}

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
   * The plain-text alternative, sent as multipart alongside the HTML.
   *
   * Worth passing whenever you have one. Some readers are configured for text
   * only and see an empty message without it, and a missing text part counts
   * against deliverability with every major filter. lib/email/design returns
   * one from the same description as the HTML, so for anything built with
   * renderEmail this is just `text` off the result.
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
 * Send an email through whichever provider EMAIL_PROVIDER selects.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = process.env.EMAIL_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    'iTutor <hello@myitutor.com>',
}: SendEmailParams): Promise<EmailResult> {
  // The allowlist is checked FIRST, before any provider is consulted, because
  // it is the guard that makes a live-data environment safe to point at a real
  // sender. It used to sit behind the Resend no-key check, which was harmless
  // while a missing key meant nothing could send anyway. It is not harmless
  // now: Customer.io CREATES a person profile for every address it sends to,
  // so a send from staging does not just deliver a mail, it loads a real
  // customer into a marketing tool. Suppression has to happen before that.
  //
  // Reported as success: a suppressed send is a deliberate outcome, not a
  // failure for the caller to retry or surface.
  if (!isAllowedRecipient(to)) {
    console.log(`[EMAIL SUPPRESSED — not in EMAIL_ALLOWLIST] to=${to} subject=${subject}`);
    return { success: true, messageId: 'suppressed' };
  }

  if (getProvider() === 'customerio') {
    const config = getCustomerIoEmailConfig();
    // Mirrors the Resend no-key path below: unconfigured is a no-op, not a
    // crash, so an environment without credentials stays quiet.
    if (!config) {
      console.log(`[EMAIL SKIPPED — no CUSTOMERIO_APP_API_KEY] to=${to} subject=${subject}`);
      return { success: true, messageId: 'disabled' };
    }
    return sendViaCustomerIo({ to, from, subject, html, text }, config);
  }

  const resend = getResend();
  // No RESEND_API_KEY configured (e.g. staging without email set up) → no-op,
  // so nothing is sent by accident. Sending is enabled the moment a key exists.
  if (!resend) {
    console.log(`[EMAIL SKIPPED — no RESEND_API_KEY] to=${to} subject=${subject}`);
    return { success: true, messageId: 'disabled' };
  }
  try {
    // `text` is omitted rather than sent empty when the caller has none: Resend
    // treats a present-but-empty text part as a text part, which is worse for
    // the reader than having only HTML.
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
 * The onboarding email for a user type and stage.
 *
 * THE DATABASE WINS, AND THE CODE IS THE FLOOR. `email_templates` holds what an
 * admin has edited in /admin/emails, so a row there is a deliberate override and
 * must not be second-guessed. But a MISSING row used to mean this returned null
 * and the caller sent nothing at all — a silently skipped onboarding email, with
 * one `console.error` as the only trace. lib/email-templates has a written,
 * designed version of every one of these, so falling back to it turns "no row"
 * from a dropped send into a correct send.
 *
 * A consequence worth knowing: restyling lib/email-templates changes what is
 * sent only where no database row exists. To push the code versions over stored
 * rows, run `node scripts/sync-onboarding-email-templates.js` — which is a
 * deliberate act, because it overwrites admin edits.
 *
 * Stages 0–4 are the sequence; anything else has no code fallback.
 */
export async function getEmailTemplate(
  userType: 'student' | 'tutor' | 'parent',
  stage: number
): Promise<{ subject: string; html: string; text?: string } | null> {
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

    if (!error && data) {
      return { subject: data.subject, html: data.html_content };
    }
    if (error) {
      // Not "no row" — maybeSingle() reports that as data: null. This is a real
      // read failure, and it is worth seeing even though the fallback covers it.
      console.error('[getEmailTemplate] read failed, using code template:', error.message);
    }
  } catch (error) {
    console.error('[getEmailTemplate] unexpected error, using code template:', error);
  }

  return codeTemplateFor(userType, stage);
}

/** The designed fallback from lib/email-templates. Null for a stage it has no email for. */
async function codeTemplateFor(
  userType: 'student' | 'tutor' | 'parent',
  stage: number
): Promise<{ subject: string; html: string; text?: string } | null> {
  if (stage < 0 || stage > 4) return null;
  try {
    // Imported lazily: this module is pulled into routes that never send an
    // onboarding email, and the templates are only needed on the fallback path.
    const { getEmailForStage, getCtaUrl } = await import('@/lib/email-templates');
    const ctaUrl = getCtaUrl(userType, stage as 0 | 1 | 2 | 3 | 4);
    // {{firstName}} rather than a name: every caller runs personalizeEmail over
    // the result, and this has to be substitutable the same way a stored row is.
    const template = getEmailForStage(userType, stage as 0 | 1 | 2 | 3 | 4, {
      firstName: '{{firstName}}',
      ctaUrl,
    });
    return { subject: template.subject, html: template.html, text: template.text };
  } catch (error) {
    console.error('[getEmailTemplate] code template unavailable:', error);
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
 * Log email send result to database.
 *
 * WRITES ONLY THE COLUMNS email_send_logs ACTUALLY HAS. This used to insert
 * `recipient_email` and `subject` (no such columns), omit `stage` (NOT NULL)
 * and send status 'failed' (the CHECK allows 'success' | 'error'). PostgREST
 * rejected every insert, the returned error was never read, and the table on
 * production held zero rows — so nobody could see how many times the
 * onboarding cron had re-sent the same email. `recipientEmail` and `subject`
 * stay in the signature for the existing callers but are not stored.
 */
export async function logEmailSend(params: {
  userId: string;
  emailType: string;
  recipientEmail?: string;
  subject?: string;
  status: 'success' | 'failed' | 'error';
  errorMessage?: string;
  /** Sequence step. Defaults to the `_stage_N` suffix of emailType, else 0. */
  stage?: number;
  /** Resend's id for the message, when there is one. */
  messageId?: string;
}) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const parsedStage = Number(/_stage_(\d+)$/.exec(params.emailType)?.[1]);
    const stage = params.stage ?? (Number.isFinite(parsedStage) ? parsedStage : 0);

    const { error } = await supabase.from('email_send_logs').insert({
      user_id: params.userId,
      stage,
      email_type: params.emailType,
      status: params.status === 'success' ? 'success' : 'error',
      error_message: params.errorMessage ?? null,
      resend_email_id: params.messageId ?? null,
    });
    if (error) {
      console.error('[logEmailSend] insert rejected:', error.message);
    }
  } catch (error) {
    console.error('Error logging email send:', error);
  }
}
