import { afterEach, describe, expect, it } from 'vitest';
import { identityRouting, primaryProviderFromEnv } from '@/config/identityRouting';
import { availableRoute, decideNextStep, routeFor } from '@/lib/identity/routing';

const saved = process.env.IDENTITY_PRIMARY_PROVIDER;
afterEach(() => {
  if (saved === undefined) delete process.env.IDENTITY_PRIMARY_PROVIDER;
  else process.env.IDENTITY_PRIMARY_PROVIDER = saved;
});

describe('IDENTITY_PRIMARY_PROVIDER picks the first provider', () => {
  it('unset means didit first, stripe as the backup', () => {
    delete process.env.IDENTITY_PRIMARY_PROVIDER;
    expect(routeFor('TT')).toEqual(['didit', 'stripe', 'veriff']);
    expect(identityRouting.defaultProvider).toBe('didit');
  });

  it('an empty or invalid value falls back to didit', () => {
    for (const v of ['', '  ', 'nonsense', 'manual']) {
      process.env.IDENTITY_PRIMARY_PROVIDER = v;
      expect(routeFor('TT')[0]).toBe('didit');
    }
  });

  it('stripe swaps the order, and the value is case and space tolerant', () => {
    process.env.IDENTITY_PRIMARY_PROVIDER = ' Stripe ';
    expect(routeFor('TT')).toEqual(['stripe', 'didit', 'veriff']);
  });

  it('veriff can be primary too, and nothing is ever listed twice', () => {
    process.env.IDENTITY_PRIMARY_PROVIDER = 'veriff';
    const r = routeFor(null);
    expect(r[0]).toBe('veriff');
    expect(new Set(r).size).toBe(r.length);
  });

  it('primaryProviderFromEnv reads the object it is given', () => {
    expect(primaryProviderFromEnv({ IDENTITY_PRIMARY_PROVIDER: 'stripe' })).toBe('stripe');
    expect(primaryProviderFromEnv({})).toBe('didit');
  });

  it('with only stripe configured, didit-primary still works as stripe alone', () => {
    delete process.env.IDENTITY_PRIMARY_PROVIDER;
    expect(availableRoute(routeFor('TT'), (p) => p === 'stripe')).toEqual(['stripe']);
  });

  it('the 3 attempt total still applies across didit and stripe', () => {
    delete process.env.IDENTITY_PRIMARY_PROVIDER;
    expect(identityRouting.maxTotalAttempts).toBe(3);
    const base = { route: ['didit', 'stripe'] as any, status: 'not_supported' as any, current: 'didit' as any };
    expect(decideNextStep({ ...base, attempts: 1, tried: ['didit'] })).toEqual({ action: 'next', provider: 'stripe' });
    expect(decideNextStep({ ...base, attempts: 3, tried: ['didit'] })).toEqual({ action: 'none', reason: 'attempt_limit' });
  });
});
