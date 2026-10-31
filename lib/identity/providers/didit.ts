// Didit behind the provider interface. Built from https://docs.didit.me
// (Sessions API, Webhooks, Delete Session), read 2026-10. SANDBOX CREDENTIALS
// ONLY until the coverage test says otherwise.
//
// Env (names only):
//   DIDIT_API_KEY              application API key, sent as the x-api-key header
//   DIDIT_WORKFLOW_ID          the workflow (UUID) sessions are created from. Outside production
//                              it falls back to the sandbox workflow (lib/identity/diditConfig.ts)
//   DIDIT_WEBHOOK_SECRET       signing secret of the webhook destination
//   DIDIT_BASE_URL             optional, default https://verification.didit.me
//   DIDIT_EXPECT_ENVIRONMENT   optional 'sandbox' | 'live': webhooks whose
//                              `environment` differs are ignored
//   DIDIT_SANDBOX_SCENARIO     optional, passed as `sandbox_scenario` on create
//
// What is implemented from the docs, and what is deliberately NOT:
//   createSession   POST /v3/session/            implemented
//   getOutcome      GET  /v3/session/{id}/decision/  implemented (4.5 s limit: Didit gives a
//                   webhook 5 s to answer, and the webhook handler calls this)
//   ping            GET  /v3/sessions/?limit=1       read-only key check (production fallback of the admin button)
//   connectionTest  POST /v3/session/ then DELETE    throwaway sandbox session (admin button, non-production)
//   redact          DELETE /v3/session/{id}/delete/  implemented
//   verifyWebhook   X-Signature-V2 (recommended), then X-Signature (raw bytes), in
//                   Didit's own order, both HMAC-SHA256 hex with the destination
//                   secret, plus X-Timestamp within 300 s. The "-Previous" headers
//                   Didit sends for 24 h after a secret rotation are accepted against
//                   DIDIT_WEBHOOK_SECRET_PREVIOUS when that is set. The deprecated
//                   X-Signature-Simple (it does not cover the decision) is NOT accepted.
//
//   V2 (checked against the docs again): parse the body, sort keys recursively in
//   code-point order, serialise compactly with Unicode left unescaped, and turn
//   whole-valued floats into integers, then HMAC that string. JSON.parse already
//   makes 75.0 and 75 the same number, so the float step needs no extra code in
//   Node. Edge cases (1e21, numbers beyond 2^53) can differ from Python's output;
//   X-Signature (raw bytes) is the fallback, exactly as Didit's order intends.
//
// The decision is STILL re-fetched with getOutcome(), although V2 and X-Signature
// cover the whole body: the decision endpoint is authoritative and webhooks can
// arrive out of order.
//
// Session creation IS idempotent per the current docs: an unfinished session for the same
//   workflow_id and vendor_data (our teacher id) is returned instead of a new one. The orphan
//   clean-up in lib/identity/start.ts stays as a belt-and-braces measure.
// TODO(didit, unclear): the `expected_details.id_country` format (alpha-2 or
//   alpha-3) is not stated, so the teacher's document country is NOT sent.
// TODO(didit, unclear): no documented code for an unsupported country/document
//   or for declined consent. See lib/identity/mapping.ts.
//
// The webhook is not trusted for the result: Didit says the signature
// "authenticates the envelope, not the payload" and tells integrators to
// re-fetch. verifyWebhook therefore returns outcome=null and the shared handler
// calls getOutcome(). The session_token Didit returns on create is a secret and
// is neither stored nor logged.

import { createHmac, timingSafeEqual } from 'crypto';
import { identityRouting } from '@/config/identityRouting';
import { mapDiditDecision } from '../mapping';
import { diditWorkflowId } from '../diditConfig';
import { isProductionRuntime } from '@/lib/email/allowlist';
import {
  WebhookSignatureError,
  type CreatedSession,
  type CreateSessionInput,
  type HeaderReader,
  type IdentityProvider,
  type ProviderOutcome,
  type ProviderWebhookEvent,
  type RedactReason,
  type RedactResult,
} from '../types';

const TIMESTAMP_TOLERANCE_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 10_000;
/** The decision is fetched inside a webhook, and Didit abandons a webhook after 5 s. */
const DECISION_TIMEOUT_MS = 4_500;

const baseUrl = () => (process.env.DIDIT_BASE_URL || 'https://verification.didit.me').replace(/\/+$/, '');

async function diditFetch(path: string, init: { method: string; body?: unknown; timeoutMs?: number }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers: {
        'x-api-key': process.env.DIDIT_API_KEY ?? '',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const hmacHex = (payload: string, secret: string) => createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

function safeEqual(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given.trim(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Code-point order, as Python sorts strings. (JS's default is UTF-16 order.) */
function compareCodePoints(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const d = A[i]!.codePointAt(0)! - B[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return A.length - B.length;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort(compareCodePoints)) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Didit's X-Signature-V2 canonical string, or null if the body is not JSON. Exported for tests. */
export function diditCanonicalJson(rawBody: string): string | null {
  try {
    // Compact separators and unescaped Unicode are JSON.stringify's defaults.
    return JSON.stringify(sortDeep(JSON.parse(rawBody)));
  } catch {
    return null;
  }
}

/** Exported for tests: the X-Signature check over the raw body. */
export function verifyDiditSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!signature || !timestamp || !secret) return false;
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false;
  return safeEqual(hmacHex(rawBody, secret), signature);
}

/**
 * The full webhook check, in Didit's documented order: X-Signature-V2, then
 * X-Signature, then (only while a secret rotation is in its 24 hour window) the
 * "-Previous" variants against the previous secret. Always inside the 300 second
 * timestamp window. Exported for tests.
 */
export function verifyDiditWebhookSignature(
  rawBody: string,
  headers: HeaderReader,
  secrets: { current: string; previous?: string | null },
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const timestamp = headers.get('x-timestamp');
  const ts = Number.parseInt(timestamp ?? '', 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const canonical = diditCanonicalJson(rawBody);
  const attempts: Array<[string, string | null | undefined, string | null]> = [
    ['x-signature-v2', secrets.current, canonical],
    ['x-signature', secrets.current, rawBody],
    ['x-signature-v2-previous', secrets.previous, canonical],
    ['x-signature-previous', secrets.previous, rawBody],
  ];
  for (const [header, secret, payload] of attempts) {
    const given = headers.get(header);
    if (given && secret && payload !== null && safeEqual(hmacHex(payload, secret), given)) return true;
  }
  return false;
}

/** Didit's `detail` text on an error, clipped, or ''. Never the request, never a key. */
async function safeDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? `: ${body.detail.slice(0, 120)}` : '';
  } catch {
    return '';
  }
}

export interface DiditPing {
  ok: boolean;
  /** HTTP status from Didit, or null when it could not be reached. */
  status: number | null;
  /** A plain sentence for an admin. Contains no key, no secret and no response body. */
  message: string;
}

/**
 * A read-only connection test for the admin screen: lists at most one session. It creates
 * no session (so nothing is verified or billed as a verification), and it never returns
 * the key or Didit's raw response. The key needs the read:sessions permission.
 */
export async function diditPing(): Promise<DiditPing> {
  if (!process.env.DIDIT_API_KEY) return { ok: false, status: null, message: 'DIDIT_API_KEY is not set.' };
  try {
    const res = await diditFetch('/v3/sessions/?limit=1', { method: 'GET', timeoutMs: 8_000 });
    if (res.ok) return { ok: true, status: res.status, message: 'Didit accepted the API key.' };
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message: 'Didit refused the API key. Check it is the key of the right application and has the read:sessions permission.',
      };
    }
    return { ok: false, status: res.status, message: `Didit answered with an unexpected status (${res.status}).` };
  } catch {
    return { ok: false, status: null, message: 'Could not reach Didit (network error or timeout).' };
  }
}

export interface DiditConnectionTest extends DiditPing {
  /** True when a throwaway session was created (so the whole create path works). */
  sessionCreated: boolean;
  /** True when Didit returned a hosted verification URL. The URL itself is never returned. */
  hostedUrlReceived: boolean;
}

/**
 * The admin "Test Didit connection" button. Outside production it creates a THROWAWAY
 * session from the same call the teacher flow makes (so it proves the key, the workflow and
 * the create path), checks that a hosted URL came back, then deletes the session again.
 * Nothing is verified: nobody opens the link. It returns pass or fail and a plain sentence,
 * never the key, the session token or the URL.
 *
 * In production, or when DIDIT_EXPECT_ENVIRONMENT is "live", it will NOT create a session
 * and falls back to the read-only check (diditPing).
 */
export async function diditConnectionTest(): Promise<DiditConnectionTest> {
  const readOnly = async (note?: string): Promise<DiditConnectionTest> => {
    const ping = await diditPing();
    return { ...ping, message: note ? `${note} ${ping.message}` : ping.message, sessionCreated: false, hostedUrlReceived: false };
  };
  if (!process.env.DIDIT_API_KEY) return { ok: false, status: null, message: 'DIDIT_API_KEY is not set.', sessionCreated: false, hostedUrlReceived: false };
  if (isProductionRuntime() || process.env.DIDIT_EXPECT_ENVIRONMENT === 'live') {
    return readOnly('Production or live mode: no test session is created, so only the key was checked.');
  }

  let sessionId: string | null = null;
  try {
    const res = await diditFetch('/v3/session/', {
      method: 'POST',
      timeoutMs: 8_000,
      body: { workflow_id: diditWorkflowId(), vendor_data: 'itutor-connection-test', metadata: { purpose: 'connection test' } },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, sessionCreated: false, hostedUrlReceived: false, message: 'Didit refused the API key. Check it is the sandbox key and can create sessions.' };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, sessionCreated: false, hostedUrlReceived: false, message: `Didit could not create a session (${res.status})${await safeDetail(res)}. Check DIDIT_WORKFLOW_ID.` };
    }
    const body = (await res.json()) as { session_id?: string; url?: string };
    sessionId = body.session_id ?? null;
    const hosted = typeof body.url === 'string' && body.url.startsWith('https://');
    return {
      ok: !!sessionId && hosted,
      status: res.status,
      sessionCreated: !!sessionId,
      hostedUrlReceived: hosted,
      message: sessionId && hosted ? 'Didit created a test session and returned a verification link. The test session was then deleted.' : 'Didit answered but did not return a session and a verification link.',
    };
  } catch {
    return { ok: false, status: null, sessionCreated: false, hostedUrlReceived: false, message: 'Could not reach Didit (network error or timeout).' };
  } finally {
    // Clean up the throwaway session. A failure here is not worth reporting.
    if (sessionId) {
      await diditFetch(`/v3/session/${encodeURIComponent(sessionId)}/delete/`, {
        method: 'DELETE',
        timeoutMs: 6_000,
        body: { deletion_instruction: 'operational_session_delete', instruction_id: `itutor-connection-test-${sessionId}`.slice(0, 255) },
      }).catch(() => undefined);
    }
  }
}

export const diditProvider: IdentityProvider = {
  name: 'didit',

  isConfigured: () => !!process.env.DIDIT_API_KEY && !!diditWorkflowId(),
  webhookConfigured: () => !!process.env.DIDIT_WEBHOOK_SECRET,

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const res = await diditFetch('/v3/session/', {
      method: 'POST',
      body: {
        workflow_id: diditWorkflowId(),
        // Our stable identifier for the teacher. A reference, not personal data.
        vendor_data: input.tutorId,
        callback: input.returnUrl,
        metadata: { tutor_id: input.tutorId },
        ...(process.env.DIDIT_SANDBOX_SCENARIO ? { sandbox_scenario: process.env.DIDIT_SANDBOX_SCENARIO } : {}),
      },
    });
    if (!res.ok) throw new Error(`Didit create session failed (${res.status})${await safeDetail(res)}`);
    const body = (await res.json()) as { session_id?: string; url?: string };
    if (!body.session_id || !body.url) throw new Error('Didit returned no session or URL');
    return { sessionRef: body.session_id, url: body.url };
  },

  async verifyWebhook(rawBody: string, headers: HeaderReader): Promise<ProviderWebhookEvent> {
    const secret = process.env.DIDIT_WEBHOOK_SECRET ?? '';
    const previous = process.env.DIDIT_WEBHOOK_SECRET_PREVIOUS || null;
    if (!verifyDiditWebhookSignature(rawBody, headers, { current: secret, previous })) {
      throw new WebhookSignatureError();
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // Signed but not JSON: nothing we can act on.
      return { eventId: 'unparseable', sessionRef: null, tutorId: null, ignore: true, outcome: null, livemode: null };
    }

    const expected = process.env.DIDIT_EXPECT_ENVIRONMENT;
    const environment: string | undefined = payload.environment;
    const wrongEnvironment = !!expected && !!environment && environment !== expected;

    const sessionRef: string | null = payload.session_id ?? null;
    return {
      eventId: payload.event_id ?? `${sessionRef}:${payload.status}:${payload.timestamp}`,
      sessionRef,
      tutorId: payload.vendor_data ?? payload.metadata?.tutor_id ?? null,
      ignore: payload.webhook_type !== 'status.updated' || !sessionRef || wrongEnvironment,
      // Not authoritative: the handler re-fetches with getOutcome().
      outcome: null,
      livemode: environment ? environment === 'live' : null,
    };
  },

  async getOutcome(sessionRef: string): Promise<ProviderOutcome> {
    const res = await diditFetch(`/v3/session/${encodeURIComponent(sessionRef)}/decision/`, { method: 'GET', timeoutMs: DECISION_TIMEOUT_MS });
    if (!res.ok) throw new Error(`Didit retrieve session failed (${res.status})${await safeDetail(res)}`);
    return mapDiditDecision(await res.json(), { minimumAge: identityRouting.minimumAge });
  },

  async redact(sessionRef: string, reason: RedactReason): Promise<RedactResult> {
    try {
      const res = await diditFetch(`/v3/session/${encodeURIComponent(sessionRef)}/delete/`, {
        method: 'DELETE',
        body: {
          // Account deletion also purges any retained biometric template.
          deletion_instruction: reason === 'account_deletion' ? 'privacy_erasure' : 'operational_session_delete',
          instruction_id: `itutor-${reason}-${sessionRef}`.slice(0, 255),
        },
      });
      // 404 = unknown or already deleted: that is the state we wanted.
      if (res.ok || res.status === 404) return { ok: true };
      // 503 leaves the session in place; the retention sweep retries.
      return { ok: false, error: `Didit delete failed (${res.status})` };
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? 'delete failed' };
    }
  },
};
