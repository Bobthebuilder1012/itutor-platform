// =====================================================
// CENTRALIZED EMAIL SERVICE
// =====================================================
// Every transactional and lifecycle email the app sends goes out through
// sendEmail() below, over the Customer.io Transactional API.
//
// RESEND HAS BEEN REMOVED, and the EMAIL_PROVIDER switch with it. With one
// provider there is nothing to select, and a switch whose only alternative no
// longer exists is a trap rather than an escape hatch: an unrecognised value
// used to fall back to Resend, which now means falling back to nothing. The
// seam survives — every send still funnels through this one function — so
// adding a provider later is a change here and nowhere else.
//
// THE CONSEQUENCE, STATED PLAINLY: there is no second provider to fail over
// to, so CUSTOMERIO_APP_API_KEY is the single point of failure for all app
// email. Note that it is a Vercel TEAM-LEVEL SHARED variable, which does not
// appear in `vercel env ls` or in the project env API, and which only reaches
// a project that is in its project list. A missing key is therefore easy to
// misdiagnose as "not configured" when it is really "not linked".

import { getCustomerIoEmailConfig, sendViaCustomerIo } from '@/lib/email/providers/customerio';

/**
 * Which address a send goes out as.
 *
 * Two senders, deliberately kept apart, because they carry different risk:
 *
 * - `transactional` — anything a person is waiting for because of something
 *   they just did: verification codes, password resets, receipts, booking
 *   confirmations, session reminders, approval decisions. noreply@myitutor.com.
 * - `promotional` — lifecycle and marketing: the onboarding drip, the welcome
 *   mail, "a class you asked about has opened". Stays on hello@myitutor.com.
 *
 * The point is not branding. A spam complaint, a block, or a spam-folder
 * verdict earned by marketing mail follows the address that sent it. Splitting
 * the two means a bad campaign cannot bury the password reset that is the only
 * way back into someone's account.
 *
 * TRANSACTIONAL IS THE DEFAULT, and that is the safe way round. A send nobody
 * classified is far likelier to be a notification than a campaign, and the
 * cost of guessing wrong in this direction (a campaign from noreply) is much
 * smaller than the other (a reset code from the marketing address).
 */
export type EmailCategory = 'transactional' | 'promotional';

const DEFAULT_TRANSACTIONAL_FROM = 'iTutor <noreply@myitutor.com>';
const DEFAULT_PROMOTIONAL_FROM = 'iTutor <hello@myitutor.com>';

/**
 * Resolve the From header for a category.
 *
 * `EMAIL_FROM` used to be the single default for every send. It is now read
 * for PROMOTIONAL mail only: a transactional send deliberately ignores it,
 * because honouring it would mean an environment that sets it carried on
 * sending password resets from the marketing address after this change, with
 * nothing in the config looking wrong. Set EMAIL_FROM_TRANSACTIONAL to move
 * that sender.
 *
 * `RESEND_FROM_EMAIL` is no longer consulted either. It is still set on
 * production, and it is the reason every message on the platform used to share
 * one sender; leaving it in this chain would have kept a removed provider’s
 * variable quietly in charge of the marketing address.
 */
export function resolveFrom(category: EmailCategory): string {
  if (category === 'transactional') {
    return process.env.EMAIL_FROM_TRANSACTIONAL?.trim() || DEFAULT_TRANSACTIONAL_FROM;
  }
  return (
    process.env.EMAIL_FROM_PROMOTIONAL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    DEFAULT_PROMOTIONAL_FROM
  );
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
  /**
   * Which sender this goes out as. Defaults to `transactional`
   * (noreply@myitutor.com). Pass `'promotional'` for lifecycle and campaign
   * mail, which stays on hello@myitutor.com. See EmailCategory.
   */
  category?: EmailCategory;
  /**
   * An explicit From, for the rare send belonging to neither sender (a role
   * address such as a receipts@ box). Overrides `category` when present.
   */
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
 * Send one email. This is the only way mail leaves the app.
 *
 * The order is load-bearing: resolve the sender, check the recipient against
 * EMAIL_ALLOWLIST, and only then touch Customer.io — because reaching
 * Customer.io creates a person profile for the recipient, so suppression has
 * to happen before that, not after.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  category = 'transactional',
  from,
}: SendEmailParams): Promise<EmailResult> {
  // An explicit `from` wins; otherwise the category picks the sender. Resolved
  // here rather than in a parameter default so the send, the suppression log
  // and the failure path all report the same address.
  const sender = from?.trim() || resolveFrom(category);

  // The allowlist is checked FIRST, before the provider is consulted, because
  // it is the guard that makes a live-data environment safe to point at a real
  // sender. It used to sit behind a no-key check, which was harmless while a
  // missing key meant nothing could send anyway. It is not harmless now:
  // Customer.io CREATES a person profile for every address it sends to, so a
  // send from staging does not just deliver a mail, it loads a real customer
  // into a marketing tool. Suppression has to happen before that.
  //
  // Reported as success: a suppressed send is a deliberate outcome, not a
  // failure for the caller to retry or surface.
  if (!isAllowedRecipient(to)) {
    console.log(
      `[EMAIL SUPPRESSED — not in EMAIL_ALLOWLIST] to=${to} from=${sender} ` +
        `category=${category} subject=${subject}`
    );
    return { success: true, messageId: 'suppressed' };
  }

  // Logged on every send that actually leaves, so "which address did that flow
  // use?" is answerable from the runtime logs rather than from an inbox per
  // flow. Address and subject only — never the body.
  console.log(`[EMAIL] to=${to} from=${sender} category=${category} subject=${subject}`);

  const config = getCustomerIoEmailConfig();
  // A FAILURE, not a quiet skip, and this is not a style preference — it is
  // the fix for a production incident. Reporting a send that did not happen as
  // a success is actively destructive here: send-onboarding-emails advances a
  // user's onboarding_stage and writes a 'success' log on result.success, so a
  // no-op "success" consumes the stage and the email is never retried. That
  // happened on production on 2026-10-26 — three users lost a stage each in
  // the first cron run after the provider switch went live. Keep this false.
  if (!config) {
    console.error(`[EMAIL FAILED — no CUSTOMERIO_APP_API_KEY] to=${to} subject=${subject}`);
    return {
      success: false,
      error:
        'CUSTOMERIO_APP_API_KEY is not set, so no email can be sent. It is a ' +
        'Vercel team-level Shared variable: check that it is linked to this ' +
        'project, not just that it exists.',
    };
  }

  return sendViaCustomerIo({ to, from: sender, subject, html, text }, config);
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
  /** The provider's id for the message, when there is one. */
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
      // Column name is historical: it predates the move off Resend and now
      // holds Customer.io's delivery_id. Renaming it needs a migration plus a
      // sweep of every reader, so it stays until that is worth doing.
      resend_email_id: params.messageId ?? null,
    });
    if (error) {
      console.error('[logEmailSend] insert rejected:', error.message);
    }
  } catch (error) {
    console.error('Error logging email send:', error);
  }
}
