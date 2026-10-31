import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';
import { availableRoute, decideNextStep, hasFurtherRoute, routeFor } from '@/lib/identity/routing';
import { identityRouting } from '@/config/identityRouting';
import type { IdentityProvider, ProviderName } from '@/lib/identity/types';

// ---------- pure routing ----------
describe('routeFor / availableRoute', () => {
  it('the default route is didit -> stripe -> veriff, with no manual step', () => {
    delete process.env.IDENTITY_PRIMARY_PROVIDER;
    expect(routeFor(null)).toEqual(['didit', 'stripe', 'veriff']);
    expect(routeFor('TT')).toEqual(['didit', 'stripe', 'veriff']);
    expect(routeFor('TT')).not.toContain('manual');
  });

  it('a per-country override replaces the route for that country only', () => {
    delete process.env.IDENTITY_PRIMARY_PROVIDER;
    const cfg = { ...identityRouting, countryRoutes: { GY: ['didit', 'veriff'] as ProviderName[] } };
    expect(routeFor('GY', cfg)).toEqual(['didit', 'veriff']);
    expect(routeFor('gy', cfg)).toEqual(['didit', 'veriff']);
    expect(routeFor('TT', cfg)).toEqual(['didit', 'stripe', 'veriff']);
  });

  it('the default provider goes first even if the chain lists it later', () => {
    const cfg = { ...identityRouting, defaultProvider: 'didit' as ProviderName, fallbackChain: ['stripe', 'didit', 'veriff'] as ProviderName[] };
    expect(routeFor(null, cfg)).toEqual(['didit', 'stripe', 'veriff']);
  });

  it('skips providers that are not configured', () => {
    expect(availableRoute(['stripe', 'didit', 'veriff'], (p) => p === 'stripe')).toEqual(['stripe']);
    expect(availableRoute(['stripe', 'didit', 'veriff'], () => false)).toEqual([]);
  });
});

describe('decideNextStep: the fallback chain', () => {
  const route: ProviderName[] = ['stripe', 'didit', 'veriff'];
  const base = { route, attempts: 1, tried: [] as ProviderName[] };

  it('starts on the first provider', () => {
    expect(decideNextStep({ ...base, status: null, current: null, attempts: 0 })).toEqual({ action: 'start', provider: 'stripe' });
  });

  it('reuses an open session', () => {
    for (const status of ['pending', 'processing'] as const) {
      expect(decideNextStep({ ...base, status, current: 'stripe', tried: ['stripe'] })).toEqual({ action: 'reuse', provider: 'stripe' });
    }
  });

  it('not_supported falls back to the NEXT provider automatically', () => {
    expect(decideNextStep({ ...base, status: 'not_supported', current: 'stripe', tried: ['stripe'] })).toEqual({ action: 'next', provider: 'didit' });
    expect(decideNextStep({ ...base, status: 'not_supported', current: 'didit', tried: ['stripe', 'didit'] })).toEqual({ action: 'next', provider: 'veriff' });
  });

  it('after the last provider there is nothing left: contact support', () => {
    expect(decideNextStep({ ...base, status: 'not_supported', current: 'veriff', tried: ['stripe', 'didit', 'veriff'] })).toEqual({ action: 'none', reason: 'no_route' });
  });

  it('never goes back to a provider already tried', () => {
    const r = decideNextStep({ ...base, status: 'not_supported', current: 'didit', tried: ['stripe', 'didit', 'veriff'] });
    expect(r).toEqual({ action: 'none', reason: 'no_route' });
  });

  it('a retryable failure retries the same provider while the TOTAL attempts are under the cap', () => {
    for (const attempts of [1, 2]) {
      expect(decideNextStep({ ...base, status: 'retryable_failure', current: 'stripe', attempts, tried: ['stripe'] })).toEqual({ action: 'retry_same', provider: 'stripe' });
    }
  });

  it('the attempt cap is TOTAL across providers: when it is used up nothing new starts, whatever the outcome', () => {
    expect(identityRouting.maxTotalAttempts).toBe(3);
    for (const status of ['retryable_failure', 'canceled', 'not_supported'] as const) {
      expect(decideNextStep({ ...base, status, current: 'stripe', attempts: 3, tried: ['stripe'] })).toEqual({ action: 'none', reason: 'attempt_limit' });
    }
    expect(decideNextStep({ ...base, status: null, current: null, attempts: 3 })).toEqual({ action: 'none', reason: 'attempt_limit' });
  });

  it('the cap is configurable per call', () => {
    expect(decideNextStep({ ...base, status: 'canceled', current: 'stripe', attempts: 2, tried: ['stripe'], maxAttempts: 2 })).toEqual({ action: 'none', reason: 'attempt_limit' });
    expect(decideNextStep({ ...base, status: 'canceled', current: 'stripe', attempts: 2, tried: ['stripe'], maxAttempts: 5 })).toEqual({ action: 'retry_same', provider: 'stripe' });
  });

  it('an open session can always be continued, even at the cap', () => {
    expect(decideNextStep({ ...base, status: 'pending', current: 'didit', attempts: 3, tried: ['stripe', 'didit'] })).toEqual({ action: 'reuse', provider: 'didit' });
    expect(decideNextStep({ ...base, status: 'processing', current: 'didit', attempts: 3, tried: ['stripe', 'didit'] })).toEqual({ action: 'reuse', provider: 'didit' });
  });

  it('one try on each of stripe, didit and veriff fits in the default cap', () => {
    // stripe says not_supported after attempt 1, didit after attempt 2, then veriff can still start (attempts 2 < 3)
    expect(decideNextStep({ ...base, status: 'not_supported', current: 'stripe', attempts: 1, tried: ['stripe'] })).toEqual({ action: 'next', provider: 'didit' });
    expect(decideNextStep({ ...base, status: 'not_supported', current: 'didit', attempts: 2, tried: ['stripe', 'didit'] })).toEqual({ action: 'next', provider: 'veriff' });
    // veriff said not_supported on attempt 3: every provider tried, contact support
    expect(decideNextStep({ ...base, status: 'not_supported', current: 'veriff', attempts: 3, tried: ['stripe', 'didit', 'veriff'] })).toEqual({ action: 'none', reason: 'attempt_limit' });
  });

  it('a cancelled check is treated like a retryable failure', () => {
    expect(decideNextStep({ ...base, status: 'canceled', current: 'stripe', attempts: 1, tried: ['stripe'] })).toEqual({ action: 'retry_same', provider: 'stripe' });
  });

  it('consent declined tries NO other provider and there is no manual route', () => {
    expect(decideNextStep({ ...base, status: 'consent_declined', current: 'stripe', tried: ['stripe'] })).toEqual({ action: 'none', reason: 'consent_declined' });
  });

  it('verified is done', () => {
    expect(decideNextStep({ ...base, status: 'verified', current: 'stripe', tried: ['stripe'] })).toEqual({ action: 'done' });
  });

  it('an empty route (nothing configured) is no_route', () => {
    expect(decideNextStep({ ...base, route: [], status: null, current: null })).toEqual({ action: 'none', reason: 'no_route' });
  });

  it('skips a provider that is not configured when falling back', () => {
    const only = availableRoute(route, (p) => p !== 'didit');
    expect(decideNextStep({ route: only, status: 'not_supported', current: 'stripe', attempts: 1, tried: ['stripe'] })).toEqual({ action: 'next', provider: 'veriff' });
  });

  it('a provider that dropped out of the route cannot be retried', () => {
    expect(decideNextStep({ route: ['didit'], status: 'retryable_failure', current: 'stripe', attempts: 1, tried: ['stripe'] })).toEqual({ action: 'next', provider: 'didit' });
  });

  it('hasFurtherRoute tells the UI whether to offer "try another way"', () => {
    expect(hasFurtherRoute(route, 'stripe', ['stripe'])).toBe(true);
    expect(hasFurtherRoute(route, 'veriff', ['stripe', 'didit', 'veriff'])).toBe(false);
  });
});

// ---------- startIdentityCheck with fake providers ----------
const h = vi.hoisted(() => ({
  providers: {} as Record<string, any>,
  configured: ['stripe', 'didit', 'veriff'] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => { throw new Error('not used'); } }));
vi.mock('@/lib/identity/registry', async () => {
  const routing = await import('@/lib/identity/routing');
  return {
    getProvider: (name: string) => h.providers[name],
    routeForCountry: (country: string | null) => routing.availableRoute(routing.routeFor(country), (p) => h.configured.includes(p)),
  };
});

import { startIdentityCheck } from '@/lib/identity/start';

function fakeProvider(name: ProviderName, over: Partial<IdentityProvider> = {}): any {
  const created: string[] = [];
  return {
    name,
    created,
    redacted: [] as string[],
    isConfigured: () => true,
    webhookConfigured: () => true,
    createSession: vi.fn(async ({ attempt }: any) => {
      const ref = `${name}_s${attempt}_${created.length + 1}`;
      created.push(ref);
      return { sessionRef: ref, url: `https://hosted.example/${name}/${ref}` };
    }),
    verifyWebhook: vi.fn(),
    getOutcome: vi.fn(async () => ({ outcome: { kind: 'pending' }, providerCode: null, resumeUrl: null })),
    redact: vi.fn(async function (this: any, ref: string) { this.redacted?.push(ref); return { ok: true }; }),
    ...over,
  };
}

const T = 't1';
function seed(row: Record<string, any> = {}) {
  return makeFakeDb({
    tutor_verification_v2: [{
      tutor_id: T, status: 'IN_PROGRESS', consent_at: 'x', identity_status: null, identity_error_code: null, identity_attempts: 0,
      identity_provider: null, identity_provider_session_ref: null, stripe_identity_session_id: null,
      identity_session_refs: [], identity_session_history: [], identity_providers_tried: [], identity_country: null, ...row,
    }],
  });
}
const rowOf = (db: ReturnType<typeof seed>) => db.tables.tutor_verification_v2[0]!;
const start = (db: ReturnType<typeof seed>, country: string | null = 'TT') =>
  startIdentityCheck({ db: db as any, tutorId: T, row: rowOf(db) as any, country, returnUrl: 'http://localhost:3000/back' });

beforeEach(() => {
  // These tests are about the mechanics of starting and falling back, written with
  // Stripe first. The primary-provider switch has its own file (identityPrimary.test.ts).
  process.env.IDENTITY_PRIMARY_PROVIDER = 'stripe';
  h.configured = ['stripe', 'didit', 'veriff'];
  h.providers = { stripe: fakeProvider('stripe'), didit: fakeProvider('didit'), veriff: fakeProvider('veriff') };
});

describe('startIdentityCheck', () => {
  it('needs a document country, and only a configured one', async () => {
    const db = seed();
    expect(await start(db, null)).toMatchObject({ ok: false, code: 'country_required', httpStatus: 400 });
    expect(await start(db, 'ZZ')).toMatchObject({ ok: false, code: 'invalid_country', httpStatus: 400 });
    expect(h.providers.stripe.createSession).not.toHaveBeenCalled();
  });

  it('first start uses the first provider and records provider, ref, country and the old Stripe columns', async () => {
    const db = seed();
    const r = await start(db, 'GY');
    expect(r).toMatchObject({ ok: true, kind: 'redirect', provider: 'stripe' });
    expect(rowOf(db)).toMatchObject({
      identity_status: 'pending', identity_provider: 'stripe', identity_attempts: 1, identity_country: 'GY',
      identity_providers_tried: ['stripe'],
    });
    const ref = rowOf(db).identity_provider_session_ref;
    expect(ref).toMatch(/^stripe_/);
    expect(rowOf(db).stripe_identity_session_id).toBe(ref); // old column kept working
    expect(rowOf(db).identity_session_refs).toEqual([{ provider: 'stripe', ref }]);
  });

  it('not_supported falls back to the next provider automatically (and the attempt still counts)', async () => {
    const db = seed({ identity_status: 'not_supported', identity_error_code: 'country', identity_provider: 'stripe',
      identity_provider_session_ref: 'stripe_old', stripe_identity_session_id: 'stripe_old', identity_attempts: 1,
      identity_providers_tried: ['stripe'], identity_session_refs: [{ provider: 'stripe', ref: 'stripe_old' }], identity_country: 'GY' });
    const r = await start(db, null);
    expect(r).toMatchObject({ ok: true, kind: 'redirect', provider: 'didit' });
    expect(rowOf(db)).toMatchObject({ identity_status: 'pending', identity_provider: 'didit', identity_attempts: 2, identity_providers_tried: ['stripe', 'didit'] });
    expect(rowOf(db).identity_session_refs).toHaveLength(2); // both kept, so both can be redacted later
    expect(h.providers.stripe.createSession).not.toHaveBeenCalled();
  });

  it('falls through the whole chain, then reports nothing left', async () => {
    const db = seed({ identity_status: 'not_supported', identity_error_code: 'country', identity_provider: 'veriff',
      identity_provider_session_ref: 'v1', identity_attempts: 1, identity_providers_tried: ['stripe', 'didit', 'veriff'], identity_country: 'TT' });
    const r = await start(db, null);
    expect(r).toMatchObject({ ok: false, code: 'no_route', httpStatus: 409, extra: { support: true } });
  });

  it('a failure retries the same provider until the TOTAL cap, then reports contact support', async () => {
    const fail = { identity_status: 'retryable_failure', identity_error_code: 'document_expired', identity_provider: 'stripe',
      identity_provider_session_ref: 's', stripe_identity_session_id: 's', identity_providers_tried: ['stripe'], identity_country: 'TT' };

    const db1 = seed({ ...fail, identity_attempts: 2 });
    expect(await start(db1, null)).toMatchObject({ ok: true, provider: 'stripe' });
    expect(rowOf(db1).identity_attempts).toBe(3);

    const db2 = seed({ ...fail, identity_attempts: 3 });
    expect(await start(db2, null)).toMatchObject({ ok: false, code: 'attempt_limit', extra: { support: true } });
    expect(h.providers.didit.createSession).not.toHaveBeenCalled();
    expect(rowOf(db2).identity_attempts).toBe(3);
  });

  it('attempts accumulate across providers: stripe -> didit -> veriff uses 3 and then stops', async () => {
    h.providers.stripe.getOutcome = vi.fn();
    const db = seed();
    expect(await start(db, 'GY')).toMatchObject({ ok: true, provider: 'stripe' });
    expect(rowOf(db).identity_attempts).toBe(1);

    for (const [next, expected] of [['didit', 2], ['veriff', 3]] as const) {
      Object.assign(rowOf(db), { identity_status: 'not_supported', identity_error_code: 'country' });
      expect(await start(db, null)).toMatchObject({ ok: true, provider: next });
      expect(rowOf(db).identity_attempts).toBe(expected);
    }
    Object.assign(rowOf(db), { identity_status: 'not_supported', identity_error_code: 'country' });
    expect(await start(db, null)).toMatchObject({ ok: false, code: 'attempt_limit', httpStatus: 409, extra: { support: true } });
    expect(rowOf(db).identity_providers_tried).toEqual(['stripe', 'didit', 'veriff']);
  });

  it('records when the check started, for timing', async () => {
    const db = seed();
    await start(db);
    expect(Date.parse(rowOf(db).identity_started_at)).toBeGreaterThan(0);
  });

  it('consent declined offers nothing: no other provider, no manual route', async () => {
    const db = seed({ identity_status: 'consent_declined', identity_provider: 'stripe', identity_provider_session_ref: 's',
      identity_attempts: 1, identity_providers_tried: ['stripe'], identity_country: 'TT' });
    expect(await start(db, null)).toMatchObject({ ok: false, code: 'consent_declined', extra: { support: true } });
    expect(h.providers.didit.createSession).not.toHaveBeenCalled();
  });

  it('only configured providers are used', async () => {
    h.configured = ['didit'];
    const db = seed();
    expect(await start(db)).toMatchObject({ ok: true, provider: 'didit' });
  });

  it('nothing configured says so plainly (503 not_configured), with the contact-support route', async () => {
    h.configured = [];
    const r = await start(seed());
    expect(r).toMatchObject({ ok: false, code: 'not_configured', httpStatus: 503, extra: { support: true } });
    expect((r as any).error).toMatch(/temporarily unavailable/i);
  });

  it('reuses an unfinished session instead of creating another', async () => {
    h.providers.stripe.getOutcome = vi.fn(async () => ({ outcome: { kind: 'pending' }, providerCode: null, resumeUrl: 'https://hosted.example/resume' }));
    const db = seed({ identity_status: 'pending', identity_provider: 'stripe', identity_provider_session_ref: 's1', stripe_identity_session_id: 's1',
      identity_attempts: 1, identity_providers_tried: ['stripe'], identity_country: 'TT' });
    const r = await start(db, null);
    expect(r).toEqual({ ok: true, kind: 'redirect', url: 'https://hosted.example/resume', provider: 'stripe' });
    expect(h.providers.stripe.createSession).not.toHaveBeenCalled();
    expect(rowOf(db).identity_attempts).toBe(1);
  });

  it('reports verified when the provider says the open session passed', async () => {
    h.providers.stripe.getOutcome = vi.fn(async () => ({ outcome: { kind: 'verified' }, providerCode: null }));
    const db = seed({ identity_status: 'pending', identity_provider: 'stripe', identity_provider_session_ref: 's1',
      identity_attempts: 1, identity_providers_tried: ['stripe'], identity_country: 'TT' });
    expect(await start(db, null)).toEqual({ ok: true, kind: 'verified' });
    expect(rowOf(db).identity_status).toBe('verified');
  });

  it('never creates a session for an already verified teacher', async () => {
    const db = seed({ identity_status: 'verified', identity_provider: 'stripe', identity_provider_session_ref: 's1', identity_country: 'TT' });
    expect(await start(db, null)).toEqual({ ok: true, kind: 'verified' });
    expect(h.providers.stripe.createSession).not.toHaveBeenCalled();
  });

  it('a provider that fails to create a session leaves the row untouched', async () => {
    h.providers.stripe.createSession = vi.fn(async () => { throw new Error('boom'); });
    const db = seed();
    expect(await start(db)).toMatchObject({ ok: false, code: 'provider_error', httpStatus: 502 });
    expect(rowOf(db).identity_status).toBeNull();
    expect(rowOf(db).identity_attempts).toBe(0);
  });

  it('an orphan session is redacted when this request loses a race', async () => {
    const db = seed();
    const row = { ...rowOf(db) };
    // Another request already bumped the counter after this one read the row.
    rowOf(db).identity_attempts = 1;
    rowOf(db).identity_provider_session_ref = 'other_session';
    const r = await startIdentityCheck({ db: db as any, tutorId: T, row: row as any, country: 'TT', returnUrl: 'x' });
    expect(r).toMatchObject({ ok: false, code: 'in_flight' });
    expect(h.providers.stripe.redact).toHaveBeenCalledTimes(1);
  });
});
