// =====================================================
// CUSTOMER.IO TRACK API CLIENT
// =====================================================
// Thin transport over the Track API. Server-only (uses Buffer and the service
// credentials) — never import from a client component.
//
// Contract: no function here throws. Customer.io being down must never fail a
// registration, a checkout, or a cron job that also does real work. Callers get
// a result object and decide; the sync reconciler uses it to hold the watermark
// back so the change is retried rather than lost.

import { getCustomerIoConfig, trackAuthHeader, type CustomerIoConfig } from './config';

/** Track API rejects a request body over 32KB. */
const MAX_BODY_BYTES = 32_000;

/**
 * Defaults suit a cron job, where waiting is free. Anything called inside a user
 * request must pass tighter values.
 *
 * There is no fire-and-forget option: on Vercel the invocation can be frozen
 * once the response is sent, so a floating promise is silently dropped some of
 * the time. Bounded-and-awaited is the only shape that reliably delivers, so
 * request-path callers trade a small fixed latency for actually arriving.
 */
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export interface CallOptions {
  timeoutMs?: number;
  attempts?: number;
}

/** Bounded settings for calls made inside a user-facing request. */
export const REQUEST_PATH_CALL: CallOptions = { timeoutMs: 3_000, attempts: 1 };

export interface CustomerIoResult {
  ok: boolean;
  status?: number;
  /** Set when nothing was attempted: integration off, or body too large. */
  skipped?: 'disabled' | 'oversized';
  error?: string;
}

const DISABLED: CustomerIoResult = { ok: false, skipped: 'disabled' };

/**
 * A 429 or 5xx is worth retrying; a 4xx is a malformed payload and will fail
 * identically forever, so retrying it only delays the error reaching a log.
 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function request(
  config: CustomerIoConfig,
  method: 'PUT' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  options: CallOptions = {}
): Promise<CustomerIoResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.attempts ?? DEFAULT_MAX_ATTEMPTS);

  let payload: string | undefined;

  if (body !== undefined) {
    payload = JSON.stringify(body);
    if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) {
      // Truncating attributes silently would ship a half-populated profile that
      // looks synced. Better to refuse and surface it.
      return { ok: false, skipped: 'oversized', error: 'payload exceeds 32KB' };
    }
  }

  let lastError = 'unknown error';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // A hung socket must not pin a cron invocation until the platform kills it.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: trackAuthHeader(config),
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: controller.signal,
        cache: 'no-store',
      });

      if (response.ok) return { ok: true, status: response.status };

      // Read the body for the message, but never let a parse failure here
      // masquerade as a transport failure.
      const detail = await response.text().catch(() => '');
      lastError = `${response.status} ${detail.slice(0, 300)}`;

      if (!isRetryable(response.status)) {
        return { ok: false, status: response.status, error: lastError };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxAttempts) {
      // Exponential backoff. Fixed delays, no jitter: the reconciler is the
      // only concurrent caller, so there is no thundering herd to spread out.
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }

  return { ok: false, error: lastError };
}

/**
 * Create or update a customer profile.
 *
 * The identifier is the Supabase user UUID, never the email. Emails change —
 * and keying on a mutable value means an email change creates a second profile
 * rather than updating the first, which double-bills and double-mails.
 */
export async function identify(
  userId: string,
  attributes: Record<string, unknown>,
  options?: CallOptions
): Promise<CustomerIoResult> {
  const config = getCustomerIoConfig();
  if (!config) return DISABLED;
  return request(
    config,
    'PUT',
    `/customers/${encodeURIComponent(userId)}`,
    attributes,
    options
  );
}

/** Fire an event against an identified customer. */
export async function trackEvent(
  userId: string,
  name: string,
  data: Record<string, unknown> = {},
  options?: CallOptions & { timestampSeconds?: number }
): Promise<CustomerIoResult> {
  const config = getCustomerIoConfig();
  if (!config) return DISABLED;
  return request(
    config,
    'POST',
    `/customers/${encodeURIComponent(userId)}/events`,
    {
      name,
      data,
      ...(options?.timestampSeconds ? { timestamp: options.timestampSeconds } : {}),
    },
    options
  );
}

/**
 * Delete a customer profile.
 *
 * Called when an account is deleted. Leaving the profile behind would let
 * campaigns keep mailing someone who has closed their account — the clearest
 * possible privacy failure, and it keeps billing for the profile too.
 */
export async function deleteCustomer(userId: string): Promise<CustomerIoResult> {
  const config = getCustomerIoConfig();
  if (!config) return DISABLED;
  return request(config, 'DELETE', `/customers/${encodeURIComponent(userId)}`);
}
