import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any }));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({
    webhooks: {
      constructEvent: (body: string, sig: string, secret: string) => {
        if (sig !== 'good' || secret !== 'whsec_stripe') throw new Error('bad signature');
        return JSON.parse(body);
      },
    },
  }),
}));

import { POST as genericPOST, GET as genericGET } from '@/app/api/webhooks/identity/[provider]/route';
import { POST as stripePOST } from '@/app/api/webhooks/stripe-identity/route';
import { diditProvider, verifyDiditSignature } from '@/lib/identity/providers/didit';
import { stripeProvider } from '@/lib/identity/providers/stripe';
import { veriffProvider } from '@/lib/identity/providers/veriff';
import { WebhookSignatureError } from '@/lib/identity/types';

const SECRET = 'didit-test-secret';
const NOW = Math.floor(Date.now() / 1000);

const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('hex');

function diditPayload(over: Record<string, any> = {}) {
  return {
    event_id: 'evt-d1', webhook_type: 'status.updated', timestamp: NOW, status: 'Approved',
    session_id: 'sess-1', vendor_data: 'tutor-A', environment: 'sandbox', metadata: { tutor_id: 'tutor-A' }, ...over,
  };
}
function diditRequest(body: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/webhooks/identity/didit', { method: 'POST', body, headers });
}
const call = (req: NextRequest, provider = 'didit') => genericPOST(req, { params: { provider } });

function seed() {
  h.db = makeFakeDb({
    tutor_verification_v2: [{
      tutor_id: 'tutor-A', status: 'IN_PROGRESS', identity_status: 'pending', identity_error_code: null,
      identity_provider: 'didit', identity_provider_session_ref: 'sess-1', identity_attempts: 1,
    }],
    identity_webhook_events: [],
  });
}
const row = () => h.db.tables.tutor_verification_v2[0];

const fetchMock = vi.fn();
beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  process.env.DIDIT_WEBHOOK_SECRET = SECRET;
  process.env.DIDIT_API_KEY = 'test-api-key-never-printed';
  process.env.DIDIT_WORKFLOW_ID = 'wf-123';
  process.env.STRIPE_IDENTITY_WEBHOOK_SECRET = 'whsec_stripe';
  delete process.env.DIDIT_EXPECT_ENVIRONMENT;
  delete process.env.DIDIT_BASE_URL;
  delete process.env.DIDIT_SANDBOX_SCENARIO;
  seed();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const approved = () => ({ ok: true, status: 200, json: async () => ({ status: 'Approved', id_verifications: [{ status: 'Approved', age: 30, warnings: [] }] }) });

// ---------------------------------------------------------------
describe('Didit webhook: signature failures', () => {
  it('verifyDiditSignature accepts a correct signature', () => {
    const body = JSON.stringify(diditPayload());
    expect(verifyDiditSignature(body, sign(body), String(NOW), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(diditPayload());
    expect(verifyDiditSignature(body.replace('Approved', 'Declined'), sign(body), String(NOW), SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const body = JSON.stringify(diditPayload());
    expect(verifyDiditSignature(body, sign(body, 'someone-elses-secret'), String(NOW), SECRET)).toBe(false);
  });

  it('rejects missing signature, missing timestamp, empty secret, garbage', () => {
    const body = JSON.stringify(diditPayload());
    expect(verifyDiditSignature(body, null, String(NOW), SECRET)).toBe(false);
    expect(verifyDiditSignature(body, sign(body), null, SECRET)).toBe(false);
    expect(verifyDiditSignature(body, sign(body), String(NOW), '')).toBe(false);
    expect(verifyDiditSignature(body, 'zz', String(NOW), SECRET)).toBe(false);
    expect(verifyDiditSignature(body, sign(body), 'not-a-number', SECRET)).toBe(false);
  });

  it('rejects a replay outside the 300 second window, past or future', () => {
    const body = JSON.stringify(diditPayload());
    expect(verifyDiditSignature(body, sign(body), String(NOW - 301), SECRET, NOW)).toBe(false);
    expect(verifyDiditSignature(body, sign(body), String(NOW + 301), SECRET, NOW)).toBe(false);
    expect(verifyDiditSignature(body, sign(body), String(NOW - 299), SECRET, NOW)).toBe(true);
  });

  it('provider.verifyWebhook throws WebhookSignatureError', async () => {
    const body = JSON.stringify(diditPayload());
    await expect(diditProvider.verifyWebhook(body, { get: () => null })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(
      diditProvider.verifyWebhook(body, { get: (n: string) => ({ 'x-signature': 'bad', 'x-timestamp': String(NOW) } as any)[n] ?? null })
    ).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('a delivery carrying ONLY X-Signature-V2 is rejected (V2 is a documented TODO, never guessed)', async () => {
    const body = JSON.stringify(diditPayload());
    const res = await call(diditRequest(body, { 'x-signature-v2': sign(body), 'x-timestamp': String(NOW) }));
    expect(res.status).toBe(400);
  });

  it('route: 400 on a bad signature and nothing touches the database', async () => {
    const body = JSON.stringify(diditPayload());
    const res = await call(diditRequest(body, { 'x-signature': 'forged', 'x-timestamp': String(NOW) }));
    expect(res.status).toBe(400);
    expect(h.db.calls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('route: 500 when the signing secret is not configured', async () => {
    delete process.env.DIDIT_WEBHOOK_SECRET;
    const body = JSON.stringify(diditPayload());
    expect((await call(diditRequest(body, { 'x-signature': sign(body), 'x-timestamp': String(NOW) }))).status).toBe(500);
  });
});

describe('Didit webhook: handling', () => {
  const good = (payload = diditPayload()) => {
    const body = JSON.stringify(payload);
    return diditRequest(body, { 'x-signature': sign(body), 'x-timestamp': String(NOW) });
  };

  it('does NOT trust the webhook payload: it re-fetches the decision, then applies the neutral outcome', async () => {
    fetchMock.mockResolvedValueOnce(approved());
    // the webhook claims Declined, the authoritative decision says Approved
    const res = await call(good(diditPayload({ status: 'Declined' })));
    expect(res.status).toBe(200);
    expect(row().identity_status).toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://verification.didit.me/v3/session/sess-1/decision/');
    expect(init.method).toBe('GET');
    expect(init.headers['x-api-key']).toBe('test-api-key-never-printed');
  });

  it('is idempotent on the event id', async () => {
    fetchMock.mockResolvedValue(approved());
    await call(good());
    row().identity_status = 'retryable_failure';
    const again = await call(good());
    expect(await again.json()).toMatchObject({ status: 'duplicate' });
    expect(row().identity_status).toBe('retryable_failure');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('records the provider and stores no payload or key', async () => {
    fetchMock.mockResolvedValueOnce(approved());
    await call(good());
    const ev = h.db.tables.identity_webhook_events[0];
    expect(ev).toMatchObject({ provider: 'didit', session_id: 'sess-1', processing_status: 'processed' });
    expect(JSON.stringify(h.db.tables)).not.toContain('test-api-key-never-printed');
  });

  it('ignores event types other than status.updated, without calling Didit', async () => {
    const res = await call(good(diditPayload({ webhook_type: 'data.updated' })));
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a webhook from the wrong environment when one is expected', async () => {
    process.env.DIDIT_EXPECT_ENVIRONMENT = 'sandbox';
    const res = await call(good(diditPayload({ environment: 'live' })));
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(row().identity_status).toBe('pending');
  });

  it('a session for a replaced attempt does not touch the current one', async () => {
    fetchMock.mockResolvedValueOnce(approved());
    const res = await call(good(diditPayload({ session_id: 'old-session' })));
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(row().identity_status).toBe('pending');
  });

  it('finds the teacher by session when vendor_data is missing', async () => {
    fetchMock.mockResolvedValueOnce(approved());
    await call(good(diditPayload({ vendor_data: undefined, metadata: {} })));
    expect(row().identity_status).toBe('verified');
  });

  it('returns 500 so Didit retries when the decision cannot be fetched, and does not mark it processed', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const res = await call(good());
    expect(res.status).toBe(500);
    expect(h.db.tables.identity_webhook_events.find((e: any) => e.processing_status === 'processed')).toBeUndefined();
  });

  it('does nothing when the flag is off', async () => {
    process.env.VERIFICATION_V2_ENABLED = 'false';
    const res = await call(good());
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(h.db.calls).toHaveLength(0);
  });
});

describe('Didit API calls', () => {
  it('createSession posts the documented fields with the x-api-key header and returns only the id and URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ session_id: 'sess-9', url: 'https://verify.didit.me/s/abc', session_token: 'SECRET-TOKEN', status: 'Not Started' }),
    });
    const created = await diditProvider.createSession({ tutorId: 'tutor-A', attempt: 1, returnUrl: 'http://localhost:3000/back', country: 'TT' });
    expect(created).toEqual({ sessionRef: 'sess-9', url: 'https://verify.didit.me/s/abc' });
    expect(JSON.stringify(created)).not.toContain('SECRET-TOKEN');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://verification.didit.me/v3/session/');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('test-api-key-never-printed');
    expect(JSON.parse(init.body)).toEqual({
      workflow_id: 'wf-123', vendor_data: 'tutor-A', callback: 'http://localhost:3000/back', metadata: { tutor_id: 'tutor-A' },
    });
  });

  it('passes a sandbox scenario only when one is configured', async () => {
    process.env.DIDIT_SANDBOX_SCENARIO = 'approved';
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ session_id: 's', url: 'https://x' }) });
    await diditProvider.createSession({ tutorId: 't', attempt: 1, returnUrl: 'r' });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).sandbox_scenario).toBe('approved');
  });

  it('createSession fails without leaking the response body', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ detail: 'secret detail' }) });
    await expect(diditProvider.createSession({ tutorId: 't', attempt: 1, returnUrl: 'r' })).rejects.toThrow(/403/);
  });

  it('redact deletes the session: operational for a decision, privacy_erasure for account deletion; 404 counts as done', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    expect(await diditProvider.redact('sess-1', 'decision')).toEqual({ ok: true });
    let [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://verification.didit.me/v3/session/sess-1/delete/');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body).deletion_instruction).toBe('operational_session_delete');

    await diditProvider.redact('sess-1', 'account_deletion');
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).deletion_instruction).toBe('privacy_erasure');

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    expect(await diditProvider.redact('gone', 'decision')).toEqual({ ok: true });
  });

  it('redact reports a 503 as a failure (so the retention sweep retries) and never throws', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    expect(await diditProvider.redact('s', 'decision')).toMatchObject({ ok: false });
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await diditProvider.redact('s', 'decision')).toMatchObject({ ok: false });
  });

  it('only talks to the configured base URL', async () => {
    process.env.DIDIT_BASE_URL = 'https://sandbox.example.test/';
    fetchMock.mockResolvedValueOnce(approved());
    await diditProvider.getOutcome('abc');
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://sandbox.example.test/v3/session/abc/decision/');
  });

  it('is not configured without an API key or workflow, so routing skips it', () => {
    expect(diditProvider.isConfigured()).toBe(true);
    delete process.env.DIDIT_API_KEY;
    expect(diditProvider.isConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------
describe('Stripe webhook: signature failures (original path)', () => {
  const event = {
    id: 'evt_s1', type: 'identity.verification_session.verified', livemode: false,
    data: { object: { id: 'sess-1', status: 'verified', last_error: null, metadata: { tutor_id: 'tutor-A' } } },
  };
  const req = (sig?: string) =>
    new NextRequest('http://localhost/api/webhooks/stripe-identity', {
      method: 'POST', body: JSON.stringify(event), headers: sig ? { 'stripe-signature': sig } : {},
    });

  it('400 on a forged signature, 400 when missing, 500 when no secret', async () => {
    expect((await stripePOST(req('forged'))).status).toBe(400);
    expect((await stripePOST(req())).status).toBe(400);
    delete process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
    expect((await stripePOST(req('good'))).status).toBe(500);
    expect(h.db.calls).toHaveLength(0);
  });

  it('provider.verifyWebhook throws WebhookSignatureError', async () => {
    await expect(stripeProvider.verifyWebhook('{}', { get: () => 'forged' })).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('a good signature is applied as a neutral outcome', async () => {
    row().stripe_identity_session_id = 'sess-1';
    row().identity_provider = 'stripe';
    row().identity_provider_session_ref = 'sess-1';
    const res = await stripePOST(req('good'));
    expect(res.status).toBe(200);
    expect(row().identity_status).toBe('verified');
  });
});

describe('the generic route', () => {
  it('has no route for stripe (original path) or an unknown provider, and none for veriff until it is built', async () => {
    const r = diditRequest('{}', {});
    expect((await call(r, 'stripe')).status).toBe(404);
    expect((await call(r, 'nonsense')).status).toBe(404);
    expect((await genericGET(r, { params: { provider: 'stripe' } })).status).toBe(404);
    expect((await genericGET(r, { params: { provider: 'didit' } })).status).toBe(200);
  });

  it('veriff reports "not configured" (500) until its secret is set, never accepts an unsigned request', async () => {
    const res = await call(diditRequest('{}', {}), 'veriff');
    expect(res.status).toBe(500);
    expect(veriffProvider.isConfigured()).toBe(false);
  });
});
