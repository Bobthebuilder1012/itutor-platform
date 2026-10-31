import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => ({}) }));

import { isMissingSchemaError, schemaNotReady, SETUP_CODE, SETUP_MESSAGE } from '@/lib/verificationV2/schemaReady';
import { buildState, identityAvailable } from '@/lib/verificationV2/server';
import { describeCard } from '@/components/tutor/verificationV2/VerificationStatusCard';
import { expectedBy } from '@/components/tutor/verificationV2/StatusView';
import { loadPublicSummaries } from '@/lib/verificationV2/publicView';
import { makeFakeDb } from '../helpers/fakeDb';

describe('"Verification setup is not finished on this environment"', () => {
  it('recognises a missing table or column, from Postgres and from PostgREST', () => {
    for (const e of [
      { code: '42P01', message: 'relation "public.tutor_verification_v2" does not exist' },
      { code: '42703', message: 'column x does not exist' },
      { code: 'PGRST205', message: "Could not find the table 'public.tutor_verification_v2' in the schema cache" },
      { message: 'Could not find the table in the schema cache' },
    ]) {
      expect(isMissingSchemaError(e), JSON.stringify(e)).toBe(true);
    }
    for (const e of [null, undefined, 'x', { code: '23505', message: 'duplicate key' }, { message: 'timeout' }]) {
      expect(isMissingSchemaError(e)).toBe(false);
    }
  });

  it('answers 503 with the message and a code the screens know, and only for that error', async () => {
    const res = schemaNotReady({ code: '42P01', message: 'x' })!;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: SETUP_MESSAGE, code: SETUP_CODE });
    expect(SETUP_MESSAGE).toBe('Verification setup is not finished on this environment.');
    expect(schemaNotReady(new Error('boom'))).toBeNull();
  });

  it('the public badge lookup treats a missing table as "nobody is verified"', async () => {
    const db = makeFakeDb({});
    // The fake returns an error object for every select when told to.
    db.failOn.select = true;
    const orig = db.from;
    (db as any).from = (t: string) => {
      const q: any = orig(t);
      const done = async () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
      q.then = (res: any, rej: any) => done().then(res, rej);
      return q;
    };
    expect(await loadPublicSummaries(db as any, ['11111111-1111-1111-1111-111111111111'])).toEqual({});
  });
});

describe('the identity step when no provider is configured', () => {
  const consented = { tutor_id: 't1', status: 'IN_PROGRESS', consent_at: 'x', identity_status: null, identity_attempts: 0, identity_country: null } as any;

  it('is available when a provider is configured, and then identity gates the steps', () => {
    vi.stubEnv('DIDIT_API_KEY', 'k');
    expect(identityAvailable(consented)).toBe(true);
    const s = buildState(consented, [{ id: 'c' } as any], [], null);
    expect(s.identity.available).toBe(true);
    expect(s.step).toBe(2); // blocked on identity
    vi.unstubAllEnvs();
  });

  it('is not available with no key anywhere, and then the other steps are open', () => {
    vi.stubEnv('DIDIT_API_KEY', '');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('VERIFF_API_KEY', '');
    expect(identityAvailable(consented)).toBe(false);
    const none = buildState(consented, [], [], null);
    expect(none.identity.available).toBe(false);
    expect(none.step).toBe(3); // qualifications are open
    const withCreds = buildState(consented, [{ id: 'c' } as any], [], null);
    expect(withCreds.step).toBe(4); // and so is the last step
    vi.unstubAllEnvs();
  });

  it('without consent nothing opens, whatever the provider state', () => {
    vi.stubEnv('DIDIT_API_KEY', '');
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(buildState({ ...consented, consent_at: null }, [], [], null).step).toBe(1);
    vi.unstubAllEnvs();
  });
});

describe('the dashboard card', () => {
  const base = (over: any = {}) =>
    ({
      status: 'NOT_STARTED', consentAt: null, submittedAt: null, decisionReason: null, reference: null, editable: true, step: 1, credentials: [], extras: [],
      identity: { status: null, reason: null, country: null, attempts: 0, maxAttempts: 3, canRetry: false, furtherRoute: false, countries: [], available: true },
      ...over,
    }) as any;

  it('says something sensible for every status and never shows a zero', () => {
    const lines = [
      describeCard(base()),
      describeCard(base({ status: 'IN_PROGRESS' })),
      describeCard(base({ status: 'IN_PROGRESS', consentAt: 'x' })),
      describeCard(base({ status: 'IN_REVIEW', submittedAt: '2026-10-01T00:00:00Z' })),
      describeCard(base({ status: 'VERIFIED' })),
      describeCard(base({ status: 'REJECTED' })),
      describeCard(base({ status: 'REVERIFICATION_REQUIRED' })),
      describeCard(base({ status: 'REVOKED' })),
    ];
    for (const l of lines) expect(l.line).not.toMatch(/\b0\b/);
    expect(lines[1].line).toBe('Started, not finished yet.');
    expect(lines[2].line).toBe('In progress: 1 of 3 steps done.');
    expect(lines[4].state).toBe('complete');
    expect(lines[0].state).toBe('incomplete');
  });

  it('the expected-by date is 14 days after submission, as DD Mon YYYY, never a countdown', () => {
    expect(expectedBy('2026-10-01T12:00:00Z')).toBe('15 Oct 2026');
    expect(expectedBy(null)).toBeNull();
    expect(describeCard(base({ status: 'IN_REVIEW', submittedAt: '2026-10-01T12:00:00Z' })).line).toContain('15 Oct 2026');
  });
});
