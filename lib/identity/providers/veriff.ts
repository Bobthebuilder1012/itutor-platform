// Veriff behind the provider interface. Built from https://devdocs.veriff.com
// (create session, decision webhook, HMAC authentication, decision data, delete
// session, integrations), read 2026-10. TEST INTEGRATION CREDENTIALS ONLY until
// the coverage test says otherwise (docs/IDENTITY_COVERAGE_TEST.md).
//
// Env (names only):
//   VERIFF_API_KEY        the integration's API key, sent as X-AUTH-CLIENT
//   VERIFF_SHARED_SECRET  the integration's shared secret: signs webhooks AND our
//                         GET/DELETE requests (HMAC-SHA256, lowercase hex)
//   VERIFF_BASE_URL       optional. TODO(veriff, unclear): the docs show only a
//                         placeholder base URL and one demo that uses
//                         https://api.staging.vrff.io/v1. The default below is
//                         the usual station API host; confirm it in your
//                         Customer Portal and set VERIFF_BASE_URL if it differs.
//
// Implemented from the docs:
//   createSession   POST /v1/sessions  (no signature needed for this endpoint)
//   getOutcome      GET  /v1/sessions/{id}/decision  (X-HMAC-SIGNATURE = HMAC of the session id)
//   redact          DELETE /v1/sessions/{id}  (same signature)
//   verifyWebhook   X-HMAC-SIGNATURE = HMAC-SHA256 hex of the RAW body, shared secret
//
// TODO(veriff, unclear):
//   - the webhook docs name no timestamp, nonce or event id, so there is no
//     replay window; idempotency uses a derived id (session + status + decision time)
//   - delete is "not enabled by default": Veriff support must switch it on, and it
//     is rate limited (10 sessions per 24 h, 5 per hour), so the retention sweep retries
//   - whether `document.country` on create pre-selects or restricts the document
//     is not stated; it is sent only as a hint when the teacher chose a real country
//   - the sessionToken Veriff returns is a secret and is neither stored nor logged
//   - how to force approved/declined in a test integration is in a login-only
//     knowledge-base article, so sandbox outcomes must be triggered by hand

import { createHmac, timingSafeEqual } from 'crypto';
import { mapVeriffDecision } from '../mapping';
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

const REQUEST_TIMEOUT_MS = 10_000;
const baseUrl = () => (process.env.VERIFF_BASE_URL || 'https://stationapi.veriff.com').replace(/\/+$/, '');

/** HMAC-SHA256, lowercase hex. Exported for tests. */
export function veriffSign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/** Exported for tests: the webhook signature check over the raw body. */
export function verifyVeriffSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(veriffSign(rawBody, secret), 'utf8');
  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function veriffFetch(
  path: string,
  init: { method: string; body?: unknown; signWith?: string }
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers: {
        'X-AUTH-CLIENT': process.env.VERIFF_API_KEY ?? '',
        'Content-Type': 'application/json',
        ...(init.signWith ? { 'X-HMAC-SIGNATURE': veriffSign(init.signWith, process.env.VERIFF_SHARED_SECRET ?? '') } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const veriffProvider: IdentityProvider = {
  name: 'veriff',

  isConfigured: () => !!process.env.VERIFF_API_KEY && !!process.env.VERIFF_SHARED_SECRET,
  webhookConfigured: () => !!process.env.VERIFF_SHARED_SECRET,

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const country = input.country && /^[A-Z]{2}$/.test(input.country) ? input.country : undefined;
    const res = await veriffFetch('/v1/sessions', {
      method: 'POST',
      body: {
        verification: {
          callback: input.returnUrl,
          // Our stable identifier for the teacher. A reference, not personal data.
          vendorData: input.tutorId,
          ...(country ? { document: { country } } : {}),
        },
      },
    });
    if (!res.ok) throw new Error(`Veriff create session failed (${res.status})`);
    const body = (await res.json()) as { verification?: { id?: string; url?: string } };
    const v = body.verification;
    if (!v?.id || !v?.url) throw new Error('Veriff returned no session or URL');
    return { sessionRef: v.id, url: v.url };
  },

  async verifyWebhook(rawBody: string, headers: HeaderReader): Promise<ProviderWebhookEvent> {
    const secret = process.env.VERIFF_SHARED_SECRET ?? '';
    if (!verifyVeriffSignature(rawBody, headers.get('x-hmac-signature'), secret)) {
      throw new WebhookSignatureError();
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { eventId: 'unparseable', sessionRef: null, tutorId: null, ignore: true, outcome: null, livemode: null };
    }

    // Event webhooks (started, submitted) carry no decision: acknowledged only.
    const v = payload?.verification;
    if (!v || typeof v.status !== 'string' || !v.id) {
      return { eventId: `event:${payload?.id ?? 'unknown'}`, sessionRef: v?.id ?? null, tutorId: null, ignore: true, outcome: null, livemode: null };
    }

    return {
      eventId: `${v.id}:${v.status}:${v.decisionTime ?? v.code ?? ''}`,
      sessionRef: v.id,
      tutorId: v.vendorData ?? null,
      ignore: false,
      // The raw body is signed, so the payload is authoritative as delivered.
      outcome: mapVeriffDecision({ status: v.status, reasonCode: v.reasonCode, document: v.document }),
      livemode: null,
    };
  },

  async getOutcome(sessionRef: string): Promise<ProviderOutcome> {
    const res = await veriffFetch(`/v1/sessions/${encodeURIComponent(sessionRef)}/decision`, {
      method: 'GET',
      signWith: sessionRef,
    });
    if (!res.ok) throw new Error(`Veriff retrieve decision failed (${res.status})`);
    const body = (await res.json()) as { verification?: any };
    return mapVeriffDecision(body.verification);
  },

  async redact(sessionRef: string, _reason: RedactReason): Promise<RedactResult> {
    try {
      const res = await veriffFetch(`/v1/sessions/${encodeURIComponent(sessionRef)}`, {
        method: 'DELETE',
        signWith: sessionRef,
      });
      // 404 = unknown or already deleted: that is the state we wanted.
      if (res.ok || res.status === 404) return { ok: true };
      // 400 (session in progress / not completed), 429 (rate limited) and the
      // rest leave the session in place; the retention sweep retries.
      return { ok: false, error: `Veriff delete failed (${res.status})` };
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? 'delete failed' };
    }
  },
};
