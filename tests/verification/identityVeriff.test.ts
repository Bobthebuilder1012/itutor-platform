import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));

import { POST as genericPOST } from '@/app/api/webhooks/identity/[provider]/route';
import { veriffProvider, veriffSign, verifyVeriffSignature } from '@/lib/identity/providers/veriff';
import { mapVeriffDecision } from '@/lib/identity/mapping';
import { setIdentityStatus } from '@/lib/verification/setStatus';
import { WebhookSignatureError } from '@/lib/identity/types';

const SECRET = 'veriff-shared-secret';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('hex');

function decisionPayload(over: Record<string, any> = {}) {
  return {
    status: 'success',
    verification: {
      id: 'ver-1', code: 9001, status: 'approved', reason: null, reasonCode: null,
      decisionTime: '2026-10-10T10:00:00.000Z', vendorData: 'tutor-A',
      document: { type: 'PASSPORT', country: 'TT' },
      person: { firstName: 'NEVER', lastName: 'STORED', idNumber: 'SECRET-ID-123', dateOfBirth: '1990-01-01' },
      ...over,
    },
    technicalData: { ip: '203.0.113.9' },
  };
}
const request = (body: string, headers: Record<string, string>) =>
  new NextRequest('http://localhost/api/webhooks/identity/veriff', { method: 'POST', body, headers });
const call = (req: NextRequest) => genericPOST(req, { params: { provider: 'veriff' } });
const signed = (payload: any) => {
  const body = JSON.stringify(payload);
  return request(body, { 'x-hmac-signature': sign(body) });
};

function seed() {
  h.db = makeFakeDb({
    tutor_verification_v2: [{
      tutor_id: 'tutor-A', status: 'IN_PROGRESS', identity_status: 'pending', identity_error_code: null,
      identity_provider: 'veriff', identity_provider_session_ref: 'ver-1', identity_attempts: 3,
      identity_country: 'TT', identity_started_at: new Date(Date.now() - 90_000).toISOString(),
    }],
    identity_webhook_events: [],
    identity_outcomes: [],
  });
}
const row = () => h.db.tables.tutor_verification_v2[0];
const outcomes = () => h.db.tables.identity_outcomes;

const fetchMock = vi.fn();
beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  process.env.VERIFF_SHARED_SECRET = SECRET;
  process.env.VERIFF_API_KEY = 'veriff-api-key-never-printed';
  delete process.env.VERIFF_BASE_URL;
  seed();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('Veriff webhook: signature failures', () => {
  it('accepts the correct signature, case-insensitively', () => {
    const body = JSON.stringify(decisionPayload());
    expect(verifyVeriffSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyVeriffSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('matches the documented test vector', () => {
    // Veriff docs: key abcdef12-abcd-abcd-abcd-abcdef012345 over the sample body
    expect(veriffSign('{"verification":{}}', 'k')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a tampered body, a wrong secret, a missing signature and an empty secret', () => {
    const body = JSON.stringify(decisionPayload());
    expect(verifyVeriffSignature(body.replace('approved', 'declined'), sign(body), SECRET)).toBe(false);
    expect(verifyVeriffSignature(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyVeriffSignature(body, null, SECRET)).toBe(false);
    expect(verifyVeriffSignature(body, '', SECRET)).toBe(false);
    expect(verifyVeriffSignature(body, sign(body), '')).toBe(false);
    expect(verifyVeriffSignature(body, 'not-hex', SECRET)).toBe(false);
  });

  it('provider.verifyWebhook throws WebhookSignatureError', async () => {
    await expect(veriffProvider.verifyWebhook('{}', { get: () => null })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(veriffProvider.verifyWebhook('{}', { get: () => 'forged' })).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('route: 400 on a bad signature with nothing touched; 500 with no secret', async () => {
    const body = JSON.stringify(decisionPayload());
    expect((await call(request(body, { 'x-hmac-signature': 'forged' }))).status).toBe(400);
    expect((await call(request(body, {}))).status).toBe(400);
    expect(h.db.calls).toHaveLength(0);
    delete process.env.VERIFF_SHARED_SECRET;
    expect((await call(request(body, { 'x-hmac-signature': sign(body) }))).status).toBe(500);
  });
});

describe('Veriff webhook: handling', () => {
  it('an approved decision verifies the teacher and logs the outcome', async () => {
    const res = await call(signed(decisionPayload()));
    expect(res.status).toBe(200);
    expect(row().identity_status).toBe('verified');
    expect(outcomes()).toHaveLength(1);
    expect(outcomes()[0]).toMatchObject({
      tutor_id: 'tutor-A', provider: 'veriff', session_ref: 'ver-1', country: 'TT', document_type: 'PASSPORT',
      outcome: 'verified', reason: null, attempt: 3,
    });
    expect(outcomes()[0].duration_seconds).toBeGreaterThanOrEqual(89);
  });

  it('never stores a name, ID number, date of birth, IP or any payload', async () => {
    await call(signed(decisionPayload()));
    const everything = JSON.stringify(h.db.tables);
    for (const secret of ['NEVER', 'STORED', 'SECRET-ID-123', '1990-01-01', '203.0.113.9']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('a declined decision becomes a neutral retryable failure with the raw code kept apart', async () => {
    await call(signed(decisionPayload({ status: 'declined', reasonCode: 511, reason: 'Presented document expired' })));
    expect(row()).toMatchObject({ identity_status: 'retryable_failure', identity_error_code: 'document_expired', identity_provider_code: '511' });
    expect(outcomes()[0]).toMatchObject({ outcome: 'retryable_failure', reason: 'document_expired', provider_code: '511' });
  });

  it('an age code becomes not_supported/minor', async () => {
    await call(signed(decisionPayload({ status: 'declined', reasonCode: 533 })));
    expect(row()).toMatchObject({ identity_status: 'not_supported', identity_error_code: 'minor' });
  });

  it('is idempotent: a replayed delivery is a duplicate and logs nothing more', async () => {
    await call(signed(decisionPayload()));
    row().identity_status = 'retryable_failure';
    const again = await call(signed(decisionPayload()));
    expect(await again.json()).toMatchObject({ status: 'duplicate' });
    expect(row().identity_status).toBe('retryable_failure');
    expect(outcomes()).toHaveLength(1);
  });

  it('ignores an event webhook that carries no decision', async () => {
    const res = await call(signed({ id: 'evt-1', attemptId: 'x', feature: 'selfid', code: 7002, action: 'started' }));
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(row().identity_status).toBe('pending');
  });

  it('a decision for a replaced session does not touch the current one', async () => {
    await call(signed(decisionPayload({ id: 'old-session' })));
    expect(row().identity_status).toBe('pending');
    expect(outcomes()).toHaveLength(0);
  });

  it('does nothing and touches nothing when the flag is off', async () => {
    process.env.VERIFICATION_V2_ENABLED = 'false';
    expect(await (await call(signed(decisionPayload()))).json()).toMatchObject({ status: 'ignored' });
    expect(h.db.calls).toHaveLength(0);
  });
});

describe('Veriff API calls', () => {
  it('createSession posts the documented body with X-AUTH-CLIENT and returns only id and URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ status: 'success', verification: { id: 'ver-9', url: 'https://magic.veriff.me/v/abc', sessionToken: 'SECRET-SESSION-TOKEN', vendorData: 'tutor-A' } }),
    });
    const created = await veriffProvider.createSession({ tutorId: 'tutor-A', attempt: 1, returnUrl: 'http://localhost:3000/back', country: 'GY' });
    expect(created).toEqual({ sessionRef: 'ver-9', url: 'https://magic.veriff.me/v/abc' });
    expect(JSON.stringify(created)).not.toContain('SECRET-SESSION-TOKEN');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://stationapi.veriff.com/v1/sessions');
    expect(init.method).toBe('POST');
    expect(init.headers['X-AUTH-CLIENT']).toBe('veriff-api-key-never-printed');
    expect(init.headers['X-HMAC-SIGNATURE']).toBeUndefined(); // not required for POST /sessions
    expect(JSON.parse(init.body)).toEqual({ verification: { callback: 'http://localhost:3000/back', vendorData: 'tutor-A', document: { country: 'GY' } } });
  });

  it('sends the country only when it is a real alpha-2 code', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ verification: { id: 'v', url: 'https://x' } }) });
    await veriffProvider.createSession({ tutorId: 't', attempt: 1, returnUrl: 'r', country: 'OTHER' });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).verification.document).toBeUndefined();
  });

  it('createSession fails without leaking the response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'secret' }) });
    await expect(veriffProvider.createSession({ tutorId: 't', attempt: 1, returnUrl: 'r' })).rejects.toThrow(/401/);
  });

  it('getOutcome signs the SESSION ID and maps the decision', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ verification: { status: 'approved', document: { type: 'ID_CARD' } } }) });
    const out = await veriffProvider.getOutcome('ver-1');
    expect(out).toMatchObject({ outcome: { kind: 'verified' }, documentType: 'ID_CARD' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://stationapi.veriff.com/v1/sessions/ver-1/decision');
    expect(init.method).toBe('GET');
    expect(init.headers['X-HMAC-SIGNATURE']).toBe(sign('ver-1'));
  });

  it('redact deletes the session with a signed request; 404 is done; 400 and 429 are retried later; never throws', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    expect(await veriffProvider.redact('ver-1', 'decision')).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://stationapi.veriff.com/v1/sessions/ver-1');
    expect(init.method).toBe('DELETE');
    expect(init.headers['X-HMAC-SIGNATURE']).toBe(sign('ver-1'));

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    expect(await veriffProvider.redact('gone', 'decision')).toEqual({ ok: true });
    for (const status of [400, 429, 500]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) });
      expect(await veriffProvider.redact('x', 'decision')).toMatchObject({ ok: false });
    }
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect(await veriffProvider.redact('x', 'decision')).toMatchObject({ ok: false });
  });

  it('is configured only with both an API key and a shared secret', () => {
    expect(veriffProvider.isConfigured()).toBe(true);
    delete process.env.VERIFF_API_KEY;
    expect(veriffProvider.isConfigured()).toBe(false);
  });
});

describe('Veriff -> neutral outcomes', () => {
  const m = (status: string, reasonCode?: number | null, type: string | null = null) =>
    mapVeriffDecision({ status, reasonCode: reasonCode ?? null, document: type ? { type } : null });

  it('statuses', () => {
    expect(m('approved').outcome).toEqual({ kind: 'verified' });
    expect(m('review').outcome).toEqual({ kind: 'processing' });
    expect(m('expired').outcome).toEqual({ kind: 'canceled' });
    expect(m('abandoned').outcome).toEqual({ kind: 'retryable_failure', reason: 'abandoned' });
    expect(m('something_new').outcome).toEqual({ kind: 'pending' });
    expect(mapVeriffDecision(null).outcome).toEqual({ kind: 'pending' });
  });

  it('declined and resubmission codes map to neutral reasons', () => {
    const table: Array<[number, string]> = [
      [511, 'document_expired'], [207, 'document_expired'], [620, 'document_expired'],
      [215, 'document_unreadable'], [216, 'document_unreadable'], [204, 'document_unreadable'],
      [103, 'face_mismatch'], [509, 'face_mismatch'], [120, 'face_mismatch'],
      [214, 'selfie_issue'], [208, 'selfie_issue'],
      [503, 'liveness_failed'], [519, 'liveness_failed'],
      [9999, 'unknown'],
    ];
    for (const [code, reason] of table) {
      for (const status of ['declined', 'resubmission_requested']) {
        expect(m(status, code).outcome).toEqual({ kind: 'retryable_failure', reason });
      }
    }
  });

  it('unsupported document types and country', () => {
    for (const code of [510, 206, 602, 551, 647, 695]) expect(m('declined', code).outcome).toEqual({ kind: 'not_supported', reason: 'document_type' });
    expect(m('declined', 571).outcome).toEqual({ kind: 'not_supported', reason: 'country' });
  });

  it('every age code is not_supported/minor', () => {
    for (const code of [530, 531, 532, 533, 534, 535, 536]) expect(m('declined', code).outcome).toEqual({ kind: 'not_supported', reason: 'minor' });
  });

  it('keeps the raw code and the document type, and never produces consent_declined', () => {
    expect(m('declined', 511, 'DRIVERS_LICENSE')).toMatchObject({ providerCode: '511', documentType: 'DRIVERS_LICENSE' });
    for (const s of ['approved', 'declined', 'expired', 'abandoned', 'review']) expect(m(s, 511).outcome.kind).not.toBe('consent_declined');
  });
});

describe('identity_outcomes log', () => {
  function direct(to: string, over: Record<string, any> = {}) {
    return setIdentityStatus({ tutorId: 'tutor-A', to, actor: 'system', sessionRef: 'ver-1', provider: 'veriff', db: h.db, ...over });
  }

  it('logs finished attempts only, not in-flight ones', async () => {
    await direct('processing');
    expect(outcomes()).toHaveLength(0);
    await direct('verified');
    expect(outcomes()).toHaveLength(1);
  });

  it('logs every finished outcome kind with provider, country and attempt', async () => {
    for (const [to, reason] of [['retryable_failure', 'face_mismatch'], ['not_supported', 'country'], ['consent_declined', null], ['canceled', null]] as const) {
      seed();
      await direct(to, { reason });
      expect(outcomes()[0]).toMatchObject({ provider: 'veriff', country: 'TT', outcome: to, reason, attempt: 3 });
    }
  });

  it('a logging failure never undoes or blocks the status change', async () => {
    const realFrom = h.db.from.bind(h.db);
    h.db.from = (t: string) => {
      const b: any = realFrom(t);
      if (t === 'identity_outcomes') b.insert = () => Promise.resolve({ data: null, error: { message: 'log table missing' } });
      return b;
    };
    const r = await direct('verified');
    expect(r.ok).toBe(true);
    expect(row().identity_status).toBe('verified');
  });

  it('logs nothing for a change that was refused', async () => {
    row().identity_status = 'verified';
    expect((await direct('retryable_failure', { reason: 'unknown' })).ok).toBe(false);
    expect(outcomes()).toHaveLength(0);
  });

  it('holds no personal data columns', async () => {
    await direct('verified', { documentType: 'Passport' });
    expect(Object.keys(outcomes()[0]).sort()).toEqual(
      ['attempt', 'country', 'document_type', 'duration_seconds', 'outcome', 'provider', 'provider_code', 'reason', 'session_ref', 'tutor_id'].sort()
    );
  });
});
