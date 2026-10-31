import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: 'msg_1' }, error: null })),
  track: vi.fn(async () => ({ ok: true })),
  identify: vi.fn(async () => ({ ok: true })),
  del: vi.fn(async () => ({ ok: true })),
  profile: { id: 'u1', email: 'someone.real@customer.example', updated_at: 'x' } as any,
}));

vi.mock('resend', () => ({ Resend: class { emails = { send: h.send }; } }));
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => ({
    from: () => {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: h.profile, error: null }),
        upsert: async () => ({ error: null }),
        delete: () => api,
        then: (res: any) => res({ error: null }),
      };
      return api;
    },
  }),
}));
vi.mock('@/lib/customerio/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/customerio/client')>()),
  trackEvent: h.track,
  identify: h.identify,
  deleteCustomer: h.del,
}));

import { allowlistEntries, checkRecipient, domainOf, isProductionRuntime, outboundEmailOpen } from '@/lib/email/allowlist';
import { sendEmail } from '@/lib/services/emailService';
import { getCustomerIoConfig, isProfileSyncable } from '@/lib/customerio/config';
import { forwardEvent } from '@/lib/customerio/events';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { removeCustomer } from '@/lib/customerio/sync';

const PRODUCTION = { VERCEL_ENV: 'production', NODE_ENV: 'production' };
const STAGING = { VERCEL_ENV: 'preview', NODE_ENV: 'production' }; // Vercel builds staging with NODE_ENV=production too
const LOCAL = { NODE_ENV: 'development' };

describe('which environment counts as production', () => {
  it('is VERCEL_ENV on Vercel, NODE_ENV elsewhere', () => {
    expect(isProductionRuntime(PRODUCTION)).toBe(true);
    expect(isProductionRuntime(STAGING)).toBe(false);
    expect(isProductionRuntime({ VERCEL_ENV: 'development', NODE_ENV: 'production' })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true); // self-hosted production
    expect(isProductionRuntime(LOCAL)).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'test' })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });
});

describe('checkRecipient: the one rule', () => {
  it('production with no list: everyone (behaviour unchanged)', () => {
    for (const raw of [undefined, '', '  ', ' , ']) {
      expect(checkRecipient('anyone@customer.example', { ...PRODUCTION, EMAIL_ALLOWLIST: raw }).allowed).toBe(true);
    }
  });

  it('production with a list: only the listed (behaviour unchanged)', () => {
    const env = { ...PRODUCTION, EMAIL_ALLOWLIST: 'me@mine.example' };
    expect(checkRecipient('me@mine.example', env).allowed).toBe(true);
    expect(checkRecipient('anyone@customer.example', env)).toEqual({ allowed: false, reason: 'not_in_allowlist' });
  });

  it('NOT production with no list: NOBODY, whatever the address', () => {
    for (const base of [STAGING, LOCAL, { NODE_ENV: 'test' }, {}]) {
      for (const raw of [undefined, '', '   ', ',,']) {
        const r = checkRecipient('me@mine.example', { ...base, EMAIL_ALLOWLIST: raw });
        expect(r).toEqual({ allowed: false, reason: 'no_allowlist_outside_production' });
      }
    }
  });

  it('NOT production with a list: only the listed', () => {
    const env = { ...STAGING, EMAIL_ALLOWLIST: 'Me@Mine.example, @team.example' };
    expect(checkRecipient('me@mine.example', env).allowed).toBe(true); // case-insensitive
    expect(checkRecipient('  ME@MINE.EXAMPLE ', env).allowed).toBe(true);
    expect(checkRecipient('colleague@team.example', env).allowed).toBe(true); // whole domain
    expect(checkRecipient('real.customer@gmail.com', env)).toEqual({ allowed: false, reason: 'not_in_allowlist' });
    expect(checkRecipient('me@mine.example.evil.com', env).allowed).toBe(false);
    expect(checkRecipient('xme@mine.example', env).allowed).toBe(false);
    expect(checkRecipient('', env)).toEqual({ allowed: false, reason: 'no_address' });
    expect(checkRecipient(null, env).allowed).toBe(false);
  });

  it('helpers', () => {
    expect(allowlistEntries({ EMAIL_ALLOWLIST: ' A@x.com ,,@Y.com' })).toEqual(['a@x.com', '@y.com']);
    expect(outboundEmailOpen(PRODUCTION)).toBe(true);
    expect(outboundEmailOpen(STAGING)).toBe(false);
    expect(outboundEmailOpen({ ...STAGING, EMAIL_ALLOWLIST: 'a@b.c' })).toBe(true);
    expect(domainOf('Someone@Customer.Example')).toBe('customer.example');
    expect(domainOf('nonsense')).toBe('unknown');
  });
});

// ---------------------------------------------------------------
// The sender itself: a non-listed recipient is suppressed BEFORE anything reaches Resend.
describe('sendEmail suppresses a recipient who is not on the list', () => {
  const mail = (to: string) => sendEmail({ to, subject: 'Hello', html: '<p>hi</p>' });

  beforeEach(() => {
    h.send.mockClear();
    vi.stubEnv('RESEND_API_KEY', 're_test_placeholder_key');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('staging with the list unset: nothing is sent to anyone', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', '');
    const r = await mail('real.customer@gmail.com');
    expect(r).toEqual({ success: true, messageId: 'suppressed' });
    expect((await mail('me@mine.example')).messageId).toBe('suppressed');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('staging with a list: a listed address is sent, a customer is not', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', 'me@mine.example');
    const customer = await mail('real.customer@gmail.com');
    expect(customer.messageId).toBe('suppressed');
    expect(h.send).not.toHaveBeenCalled();
    const mine = await mail('me@mine.example');
    expect(mine.success).toBe(true);
    expect(mine.messageId).toBe('msg_1');
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('production with no list still sends (unchanged)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('EMAIL_ALLOWLIST', '');
    expect((await mail('real.customer@gmail.com')).messageId).toBe('msg_1');
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('the log line names the reason and the domain, never the address', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', '');
    await mail('real.customer@gmail.com');
    const logged = JSON.stringify((console.log as any).mock.calls);
    expect(logged).toContain('no_allowlist_outside_production');
    expect(logged).toContain('gmail.com');
    expect(logged).not.toContain('real.customer');
  });
});

// ---------------------------------------------------------------
// Customer.io: every call goes through the same rule.
describe('Customer.io follows the same rule', () => {
  beforeEach(() => {
    for (const m of [h.track, h.identify, h.del]) m.mockClear();
    vi.stubEnv('CUSTOMERIO_ENABLED', 'true');
    vi.stubEnv('CUSTOMERIO_SITE_ID', 'site');
    vi.stubEnv('CUSTOMERIO_API_KEY', 'key-not-real');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');
    h.profile = { id: 'u1', email: 'someone.real@customer.example', updated_at: 'x' };
  });
  afterEach(() => vi.unstubAllEnvs());

  it('outside production with no list there is no Customer.io at all', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', '');
    expect(getCustomerIoConfig()).toBeNull();
    await forwardEvent(PRODUCT_EVENTS.SIGNUP_COMPLETED, { role: 'tutor' }, 'u1');
    expect(await removeCustomer('u1')).toBe(false);
    expect(h.track).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it('outside production with a list, a profile is synced only if its email is listed', () => {
    vi.stubEnv('EMAIL_ALLOWLIST', 'me@mine.example');
    const config = getCustomerIoConfig()!;
    expect(config).not.toBeNull();
    expect(isProfileSyncable(config, { email: 'me@mine.example' }).allowed).toBe(true);
    expect(isProfileSyncable(config, { email: 'someone.real@customer.example' })).toEqual({ allowed: false, reason: 'not_in_email_allowlist' });
  });

  it('events and deletes for a user whose email is not listed are dropped', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', 'me@mine.example');
    await forwardEvent(PRODUCT_EVENTS.SIGNUP_COMPLETED, { role: 'tutor' }, 'u1');
    expect(await removeCustomer('u1')).toBe(false);
    expect(h.track).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it('events for a listed user go through', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', 'me@mine.example');
    h.profile = { id: 'u2', email: 'me@mine.example', updated_at: 'x' };
    await forwardEvent(PRODUCT_EVENTS.SIGNUP_COMPLETED, { role: 'tutor' }, 'u2');
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('production is unchanged: no list means no extra gate and no lookup', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('EMAIL_ALLOWLIST', '');
    expect(getCustomerIoConfig()).not.toBeNull();
    await forwardEvent(PRODUCT_EVENTS.SIGNUP_COMPLETED, { role: 'tutor' }, 'u1');
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('still off unless CUSTOMERIO_ENABLED=true, in production too', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('CUSTOMERIO_ENABLED', 'false');
    expect(getCustomerIoConfig()).toBeNull();
  });
});
