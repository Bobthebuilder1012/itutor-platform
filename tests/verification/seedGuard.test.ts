import { spawnSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';

const script = path.resolve(__dirname, '../../scripts/seed-verification-test-users.mjs');

// Every case here must stop BEFORE any network call, so the test is offline.
function seed(env: Record<string, string>, args: string[] = []) {
  const clean: Record<string, string> = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' };
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...clean, ...env }, encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const KEY = { SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key' };

describe('the seed script refuses anything that is not local or your own project', () => {
  it('refuses the production and staging refs, even when named as allowed', () => {
    for (const ref of ['nfkrfciozjxrodkusrhh', 'lhxlhzgisrauqipuxaxh', 'thjsdcbzlvjradczhgso']) {
      const r = seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, SEED_ALLOWED_PROJECT_REF: ref }, ['--confirm-ref', ref]);
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/known production or staging/);
    }
  });

  it('refuses an unknown remote project unless it is allowed AND confirmed with the same ref', () => {
    const url = 'https://abcdefghijklmnop.supabase.co';
    expect(seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: url }).out).toMatch(/SEED_ALLOWED_PROJECT_REF/);
    expect(seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: url, SEED_ALLOWED_PROJECT_REF: 'abcdefghijklmnop' }).out).toMatch(/--confirm-ref abcdefghijklmnop/);
    expect(seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: url, SEED_ALLOWED_PROJECT_REF: 'zzzzzzzzzzzzzzzz' }, ['--confirm-ref', 'zzzzzzzzzzzzzzzz']).out).toMatch(/does not match/);
    expect(seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: url, SEED_ALLOWED_PROJECT_REF: 'abcdefghijklmnop' }, ['--confirm-ref', 'wrongwrongwrong1']).out).toMatch(/repeat the ref/);
  });

  it('refuses a live Stripe key, a missing configuration and a non-Supabase host', () => {
    expect(seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', STRIPE_SECRET_KEY: 'sk_live_abc' }).out).toMatch(/LIVE key/);
    expect(seed({}).out).toMatch(/must be set/);
    expect(seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: 'https://example.com' }).out).toMatch(/not localhost/);
  });

  it('lets a localhost database through the guard (and then fails to connect, because nothing listens there)', () => {
    const r = seed({ ...KEY, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1' });
    expect(r.out).not.toMatch(/REFUSING/);
    expect(r.out).toMatch(/SEED FAILED/);
  });

  it('never prints the service key', () => {
    const r = seed({ SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-key', NEXT_PUBLIC_SUPABASE_URL: 'https://nfkrfciozjxrodkusrhh.supabase.co' });
    expect(r.out).not.toContain('super-secret-service-key');
  });
});
