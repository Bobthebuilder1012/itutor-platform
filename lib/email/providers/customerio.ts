// =====================================================
// CUSTOMER.IO TRANSACTIONAL EMAIL PROVIDER
// =====================================================
// Transport for one-off transactional mail through Customer.io's App API.
// Server-only. Reached through lib/services/emailService, never directly —
// the allowlist and the provider choice both live there.
//
// THIS IS NOT THE TRACK API. lib/customerio/* speaks the Track API (profile
// sync and events) with a Site ID + Track key pair. Transactional sending is a
// different product surface with a different host and a different credential:
// a single App API key, passed as a bearer token.
//
// The two are deliberately NOT gated together. CUSTOMERIO_ENABLED exists to
// stop a profile sync loading real customers into a marketing tool, and it
// defaults off for that reason. If transactional email were put behind the same
// switch, restoring email during an outage would silently start that sync as a
// side effect — which is precisely the accident that switch was written to
// prevent. So this reads its own key and ignores CUSTOMERIO_ENABLED entirely.
//
// Contract, matching lib/customerio/client.ts: nothing here throws. A provider
// outage must never take down a signup or a cron run; callers get a result
// object and decide.

/**
 * Regional hosts. The EU host is the US host with `-eu` inserted; a US key
 * against the EU host fails authentication rather than falling back, so the
 * region must match the workspace the key came from.
 */
const HOSTS = {
  us: 'https://api.customer.io',
  eu: 'https://api-eu.customer.io',
} as const;

export type CustomerIoEmailRegion = keyof typeof HOSTS;

export interface CustomerIoEmailConfig {
  appApiKey: string;
  host: string;
}

/**
 * Resolve transactional config, or null when it is not configured.
 *
 * Reads CUSTOMERIO_APP_API_KEY — NOT CUSTOMERIO_API_KEY, which is the Track
 * key. Passing the Track key here produces a 401 on every send, so the two
 * names are kept visibly distinct rather than overloaded.
 *
 * Region falls back to CUSTOMERIO_REGION so a workspace already configured for
 * the Track API does not need the value stated twice.
 */
export function getCustomerIoEmailConfig(): CustomerIoEmailConfig | null {
  const appApiKey = process.env.CUSTOMERIO_APP_API_KEY?.trim();
  if (!appApiKey) return null;

  const region = (
    process.env.CUSTOMERIO_EMAIL_REGION?.trim().toLowerCase() ||
    process.env.CUSTOMERIO_REGION?.trim().toLowerCase() ||
    'us'
  ) as CustomerIoEmailRegion;

  return { appApiKey, host: HOSTS[region] ?? HOSTS.us };
}

export interface CustomerIoSendParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface CustomerIoSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** A 429 or 5xx is transient; a 4xx is a bad payload and will fail identically forever. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

/**
 * Send one transactional email.
 *
 * A NOTE ON PROFILES, because it is a real side effect and not an obvious one:
 * Customer.io resolves `identifiers` to a person, and CREATES that person if
 * they do not already exist. So every address mailed through here becomes a
 * profile in the workspace. On production that is mostly unremarkable — they
 * are already customers. On any environment pointed at a copy of production
 * data it is the exact outcome CUSTOMERIO_ALLOWED_EMAILS exists to prevent,
 * reached by a different road. EMAIL_ALLOWLIST in emailService is what stops
 * it, and it is checked before this function is ever called. Keep it that way.
 */
export async function sendViaCustomerIo(
  params: CustomerIoSendParams,
  config: CustomerIoEmailConfig
): Promise<CustomerIoSendResult> {
  const { to, from, subject, html, text, replyTo } = params;

  const body: Record<string, unknown> = {
    to,
    from,
    subject,
    body: html,
    // Email-keyed identity. A workspace identified by `id` instead would need
    // the user's id here; email is correct for this one because signup
    // verification mails addresses that have no account row yet.
    identifiers: { email: to },
    // Load-bearing, and the reason it is stated rather than left to default:
    // transactional mail must reach people who opted out of marketing. A
    // verification code withheld because someone unsubscribed from updates is
    // an account lockout.
    send_to_unsubscribed: true,
    // Off deliberately. Open pixels and rewritten click-through links are a
    // deliverability and trust cost on mail that is purely functional, and
    // link rewriting on a domain whose reputation is already damaged reads as
    // exactly the thing we were impersonated doing.
    tracked: false,
  };

  // Omitted rather than sent empty when absent: a present-but-empty text part
  // is worse for a text-only reader than having only HTML.
  if (text) body.body_plain = text;
  if (replyTo) body.reply_to = replyTo;

  let lastError = 'Send failed';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${config.host}/v1/send/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.appApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) {
        // Typed rather than inferred: under the Next build's DOM typings json()
        // is `any` and this reads fine, but under a plain Node lib it is
        // `unknown` and `data?.delivery_id` stops compiling. The shape is one
        // optional string either way, so state it.
        const data = (await response.json().catch(() => ({}))) as {
          delivery_id?: string;
        };
        return { success: true, messageId: data?.delivery_id ?? undefined };
      }

      const detail = await response.text().catch(() => '');
      lastError = `Customer.io ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`;

      if (!isRetryable(response.status)) return { success: false, error: lastError };
    } catch (e) {
      lastError =
        e instanceof Error && e.name === 'AbortError'
          ? `Customer.io timed out after ${TIMEOUT_MS}ms`
          : e instanceof Error
            ? e.message
            : 'Send failed';
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }

  return { success: false, error: lastError };
}
