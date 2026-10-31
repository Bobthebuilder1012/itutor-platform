import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ guard: null as any }));
vi.mock('@/lib/verificationV2/adminGuard', () => ({ guardAdminV2: async () => h.guard }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => ({}) }));

import { diditCanonicalJson, diditConnectionTest, diditPing, diditProvider, verifyDiditWebhookSignature } from '@/lib/identity/providers/didit';
import { POST as testRoute } from '@/app/api/admin/verification-v2/didit-test/route';
import { WebhookSignatureError } from '@/lib/identity/types';

const SECRET = 'whsec_test_secret_for_unit_tests';
const KEY = 'didit-api-key-must-never-be-shown';
const NOW = 1_761_900_010;

// A delivery shaped like Didit's v3 status.updated webhook, written the way Python's
// json.dumps writes it (", " and ": " separators, keys in insertion order, whole floats
// as 31.0 / 98.0, non-ASCII kept). The values are invented.
const BODY =
  '{"session_id": "5f1d7a52-3c6b-4d0e-9c1a-0b6f2a9d8e11", "status": "Approved", "webhook_type": "status.updated", ' +
  '"created_at": 1761900000, "timestamp": 1761900005, "event_id": "0c2f61de-77a4-4f7b-a1d2-3d5e9b4c7a10", ' +
  '"workflow_id": "9bfa64cd-4fc0-446d-b971-4a9277bb4978", "application_id": "514f31ef-f07f-4952-984a-41a29d265954", ' +
  '"environment": "sandbox", "vendor_data": "7d3b1f42-0a55-4e6c-8f21-9a4c2e6b1d03", "metadata": {"tutor_id": "7d3b1f42-0a55-4e6c-8f21-9a4c2e6b1d03"}, ' +
  '"decision": {"status": "Approved", "id_verifications": [{"status": "Approved", "age": 31.0, "full_name": "Zoë Ramdhanie", "warnings": []}], ' +
  '"face_matches": [{"status": "Approved", "score": 98.0}]}}';

// What Didit signs for X-Signature-V2: sorted keys, compact, unicode kept, 31.0 -> 31, 98.0 -> 98.
const GOLDEN_CANONICAL =
  '{"application_id":"514f31ef-f07f-4952-984a-41a29d265954","created_at":1761900000,' +
  '"decision":{"face_matches":[{"score":98,"status":"Approved"}],"id_verifications":[{"age":31,"full_name":"Zoë Ramdhanie","status":"Approved","warnings":[]}],"status":"Approved"},' +
  '"environment":"sandbox","event_id":"0c2f61de-77a4-4f7b-a1d2-3d5e9b4c7a10",' +
  '"metadata":{"tutor_id":"7d3b1f42-0a55-4e6c-8f21-9a4c2e6b1d03"},"session_id":"5f1d7a52-3c6b-4d0e-9c1a-0b6f2a9d8e11","status":"Approved",' +
  '"timestamp":1761900005,"vendor_data":"7d3b1f42-0a55-4e6c-8f21-9a4c2e6b1d03","webhook_type":"status.updated",' +
  '"workflow_id":"9bfa64cd-4fc0-446d-b971-4a9277bb4978"}';

const hmac = (payload: string, secret = SECRET) => createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
const headers = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const signed = (extra: Record<string, string> = {}) =>
  headers({ 'x-timestamp': String(NOW), 'x-signature-v2': hmac(GOLDEN_CANONICAL), 'x-signature': hmac(BODY), ...extra });
const check = (body: string, hdrs: ReturnType<typeof headers>, previous?: string) =>
  verifyDiditWebhookSignature(body, hdrs, { current: SECRET, previous }, NOW);

describe('Didit v3 webhook signature, with a captured-style payload', () => {
  it('the canonical form is exactly what the docs describe (pinned)', () => {
    expect(diditCanonicalJson(BODY)).toBe(GOLDEN_CANONICAL);
  });

  it('accepts X-Signature-V2', () => {
    expect(check(BODY, headers({ 'x-timestamp': String(NOW), 'x-signature-v2': hmac(GOLDEN_CANONICAL) }))).toBe(true);
  });

  it('accepts X-Signature over the exact raw bytes', () => {
    expect(check(BODY, headers({ 'x-timestamp': String(NOW), 'x-signature': hmac(BODY) }))).toBe(true);
  });

  it('V2 survives a proxy re-encoding the JSON; the raw signature does not (so the raw body must be used as received)', () => {
    const reencoded = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(reencoded).not.toBe(BODY);
    expect(check(reencoded, headers({ 'x-timestamp': String(NOW), 'x-signature-v2': hmac(GOLDEN_CANONICAL) }))).toBe(true);
    expect(check(reencoded, headers({ 'x-timestamp': String(NOW), 'x-signature': hmac(BODY) }))).toBe(false);
  });

  it('rejects a tampered decision, a wrong secret, and a stale or future timestamp', () => {
    const tampered = BODY.replace('"Approved", "id_verifications"', '"Declined", "id_verifications"');
    expect(check(tampered, signed())).toBe(false);
    expect(check(BODY, headers({ 'x-timestamp': String(NOW), 'x-signature-v2': hmac(GOLDEN_CANONICAL, 'other-secret') }))).toBe(false);
    for (const skew of [301, -301]) {
      expect(check(BODY, signed({ 'x-timestamp': String(NOW + skew) }))).toBe(false);
    }
    expect(check(BODY, signed({ 'x-timestamp': String(NOW + 299) }))).toBe(true);
    expect(check(BODY, headers({ 'x-signature-v2': hmac(GOLDEN_CANONICAL) }))).toBe(false); // no timestamp
  });

  it('accepts the -Previous headers for 24 hours after a rotation, only if a previous secret is configured', () => {
    const old = headers({
      'x-timestamp': String(NOW),
      'x-signature-v2-previous': hmac(GOLDEN_CANONICAL, 'old-secret'),
      'x-signature-previous': hmac(BODY, 'old-secret'),
    });
    expect(check(BODY, old)).toBe(false);
    expect(check(BODY, old, 'old-secret')).toBe(true);
  });

  it('does not accept the deprecated X-Signature-Simple', () => {
    const simple = hmac(`${NOW}:5f1d7a52-3c6b-4d0e-9c1a-0b6f2a9d8e11:Approved:status.updated`);
    expect(check(BODY, headers({ 'x-timestamp': String(NOW), 'x-signature-simple': simple }))).toBe(false);
  });

  describe('through the provider (what the route calls)', () => {
    beforeEach(() => {
      vi.stubEnv('DIDIT_WEBHOOK_SECRET', SECRET);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW * 1000);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('reads the v3 fields: event id, session, teacher (vendor_data); acts on status.updated only', async () => {
      const ev = await diditProvider.verifyWebhook(BODY, signed());
      expect(ev).toMatchObject({
        eventId: '0c2f61de-77a4-4f7b-a1d2-3d5e9b4c7a10',
        sessionRef: '5f1d7a52-3c6b-4d0e-9c1a-0b6f2a9d8e11',
        tutorId: '7d3b1f42-0a55-4e6c-8f21-9a4c2e6b1d03',
        ignore: false,
        outcome: null, // the decision is re-fetched, never trusted from the webhook
        livemode: false,
      });
      const data = BODY.replace('"status.updated"', '"data.updated"');
      const ignored = await diditProvider.verifyWebhook(
        data,
        headers({ 'x-timestamp': String(NOW), 'x-signature-v2': hmac(diditCanonicalJson(data)!) })
      );
      expect(ignored.ignore).toBe(true);
    });

    it('ignores a live delivery when the app expects sandbox', async () => {
      vi.stubEnv('DIDIT_EXPECT_ENVIRONMENT', 'live');
      expect((await diditProvider.verifyWebhook(BODY, signed())).ignore).toBe(true);
    });

    it('a bad signature throws the signature error (the route answers 400)', async () => {
      await expect(diditProvider.verifyWebhook(BODY, headers({ 'x-timestamp': String(NOW), 'x-signature-v2': 'nope' }))).rejects.toBeInstanceOf(
        WebhookSignatureError
      );
    });
  });
});

// ---------------------------------------------------------------
describe('the Didit connection test', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('DIDIT_API_KEY', KEY);
    vi.stubEnv('DIDIT_WORKFLOW_ID', '9bfa64cd-4fc0-446d-b971-4a9277bb4978');
    vi.stubEnv('DIDIT_WEBHOOK_SECRET', SECRET);
    h.guard = { error: null, db: {}, actor: 'admin', actorId: 'a1' };
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('calls a read-only list endpoint with the key in the x-api-key header, and never a create or write', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ count: 0, results: [] }) });
    const r = await diditPing();
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://verification.didit.me/v3/sessions/?limit=1');
    expect(init.method).toBe('GET');
    expect(init.headers['x-api-key']).toBe(KEY);
    expect(init.body).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a refusal, an odd status and a network error into plain sentences without the key', async () => {
    for (const status of [401, 403]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({ detail: `bad ${KEY}` }) });
      const r = await diditPing();
      expect(r).toMatchObject({ ok: false, status });
      expect(r.message).toMatch(/refused the API key/);
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect((await diditPing()).message).toContain('500');
    fetchMock.mockRejectedValueOnce(new Error(`socket hang up ${KEY}`));
    const net = await diditPing();
    expect(net).toMatchObject({ ok: false, status: null });
    expect(JSON.stringify(net)).not.toContain(KEY);
  });

  it('with no key it says so and does not call Didit', async () => {
    vi.stubEnv('DIDIT_API_KEY', '');
    expect((await diditPing()).message).toContain('DIDIT_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('outside production the connection test creates a throwaway session, sees the link, and deletes it', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ session_id: 'sess-1', url: 'https://verify.didit.me/s/abc', session_token: 'TOKEN-SECRET' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const r = await diditConnectionTest();
    expect(r).toMatchObject({ ok: true, sessionCreated: true, hostedUrlReceived: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://verification.didit.me/v3/session/');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).vendor_data).toBe('itutor-connection-test');
    expect(fetchMock.mock.calls[1][0]).toContain('/v3/session/sess-1/delete/');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    const text = JSON.stringify(r);
    for (const secret of [KEY, 'TOKEN-SECRET', 'verify.didit.me', 'sess-1']) expect(text).not.toContain(secret);
  });

  it('the connection test fails plainly on a refused key, a bad workflow, a missing link and a network error', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    expect((await diditConnectionTest()).message).toMatch(/refused the API key/);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ detail: 'Workflow not found.' }) });
    const bad = await diditConnectionTest();
    expect(bad).toMatchObject({ ok: false, sessionCreated: false });
    expect(bad.message).toContain('DIDIT_WORKFLOW_ID');
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ session_id: 's2' }) }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    expect(await diditConnectionTest()).toMatchObject({ ok: false, sessionCreated: true, hostedUrlReceived: false });
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect((await diditConnectionTest()).message).toMatch(/Could not reach Didit/);
  });

  it('in production, or in live mode, it never creates a session: only the read-only key check runs', async () => {
    for (const env of [{ VERCEL_ENV: 'production' }, { VERCEL_ENV: 'preview', DIDIT_EXPECT_ENVIRONMENT: 'live' }]) {
      fetchMock.mockReset();
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      const r = await diditConnectionTest();
      expect(r.sessionCreated).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain('/v3/sessions/?limit=1');
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
      vi.unstubAllEnvs();
      vi.stubEnv('DIDIT_API_KEY', KEY);
    }
  });

  it('the admin route reports ok when connected and fully configured, and shows no secret', async () => {
    vi.stubEnv('VERCEL_ENV', 'production'); // read-only path for this assertion
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const res = await testRoute();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.settings).toEqual({ apiKey: true, workflowId: true, workflowIdLooksValid: true, webhookSecret: true });
    const text = JSON.stringify(body);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('9bfa64cd');
  });

  it('the admin route says what is missing, by name, and is not ok', async () => {
    vi.stubEnv('DIDIT_WEBHOOK_SECRET', '');
    vi.stubEnv('DIDIT_WORKFLOW_ID', 'not-a-uuid');
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const body = await (await testRoute()).json();
    expect(body.ok).toBe(false);
    expect(body.notes.join(' ')).toContain('DIDIT_WEBHOOK_SECRET');
    expect(body.notes.join(' ')).toContain('DIDIT_WORKFLOW_ID');
    expect(body.settings.workflowIdLooksValid).toBe(false);
  });

  it('only an admin may run it: anyone else gets the guard response and Didit is not called', async () => {
    const { NextResponse } = await import('next/server');
    h.guard = { error: NextResponse.json({ error: 'Admin role required' }, { status: 403 }) };
    const res = await testRoute();
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
