// Didit behind the provider interface. Built from https://docs.didit.me
// (Sessions API, Webhooks, Delete Session), read 2026-10. SANDBOX CREDENTIALS
// ONLY until the coverage test says otherwise.
//
// Env (names only):
//   DIDIT_API_KEY              application API key, sent as the x-api-key header
//   DIDIT_WORKFLOW_ID          the workflow (UUID) sessions are created from
//   DIDIT_WEBHOOK_SECRET       signing secret of the webhook destination
//   DIDIT_BASE_URL             optional, default https://verification.didit.me
//   DIDIT_EXPECT_ENVIRONMENT   optional 'sandbox' | 'live': webhooks whose
//                              `environment` differs are ignored
//   DIDIT_SANDBOX_SCENARIO     optional, passed as `sandbox_scenario` on create
//
// What is implemented from the docs, and what is deliberately NOT:
//   createSession   POST /v3/session/            implemented
//   getOutcome      GET  /v3/session/{id}/decision/  implemented
//   redact          DELETE /v3/session/{id}/delete/  implemented
//   verifyWebhook   X-Signature (HMAC-SHA256 hex over the RAW body) + X-Timestamp
//                   within 300 s: implemented.
//
// TODO(didit, unclear in the docs): X-Signature-V2 (recommended by Didit). It is
//   signed over "sorted, Unicode-preserved compact JSON" after a `shortenFloats`
//   step the docs call but do not define, so it cannot be reproduced without
//   guessing. Not implemented: a delivery carrying only V2 is rejected.
// TODO(didit, unclear): idempotency on session creation is not documented, so
//   a repeated create makes a second session. lib/identity/start.ts deletes the
//   orphan when it loses a race.
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

const baseUrl = () => (process.env.DIDIT_BASE_URL || 'https://verification.didit.me').replace(/\/+$/, '');

async function diditFetch(path: string, init: { method: string; body?: unknown }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const diditProvider: IdentityProvider = {
  name: 'didit',

  isConfigured: () => !!process.env.DIDIT_API_KEY && !!process.env.DIDIT_WORKFLOW_ID,
  webhookConfigured: () => !!process.env.DIDIT_WEBHOOK_SECRET,

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const res = await diditFetch('/v3/session/', {
      method: 'POST',
      body: {
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        // Our stable identifier for the teacher. A reference, not personal data.
        vendor_data: input.tutorId,
        callback: input.returnUrl,
        metadata: { tutor_id: input.tutorId },
        ...(process.env.DIDIT_SANDBOX_SCENARIO ? { sandbox_scenario: process.env.DIDIT_SANDBOX_SCENARIO } : {}),
      },
    });
    if (!res.ok) throw new Error(`Didit create session failed (${res.status})`);
    const body = (await res.json()) as { session_id?: string; url?: string };
    if (!body.session_id || !body.url) throw new Error('Didit returned no session or URL');
    return { sessionRef: body.session_id, url: body.url };
  },

  async verifyWebhook(rawBody: string, headers: HeaderReader): Promise<ProviderWebhookEvent> {
    const secret = process.env.DIDIT_WEBHOOK_SECRET ?? '';
    if (!verifyDiditSignature(rawBody, headers.get('x-signature'), headers.get('x-timestamp'), secret)) {
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
    const res = await diditFetch(`/v3/session/${encodeURIComponent(sessionRef)}/decision/`, { method: 'GET' });
    if (!res.ok) throw new Error(`Didit retrieve session failed (${res.status})`);
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
