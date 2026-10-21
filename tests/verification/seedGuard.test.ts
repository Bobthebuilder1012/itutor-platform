import { spawnSync } from 'child_process';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// Each case starts a Node process; give them room on a slow disk.
vi.setConfig({ testTimeout: 90_000 });

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

// ---------------------------------------------------------------
const applyScript = path.resolve(__dirname, '../../scripts/apply-migrations-local.mjs');

function apply(env: Record<string, string>, args: string[] = []) {
  const clean: Record<string, string> = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' };
  const r = spawnSync(process.execPath, [applyScript, ...args], { env: { ...clean, ...env }, encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('the migration apply script refuses anything that is not local or your own empty project', () => {
  it('needs DATABASE_URL', () => {
    expect(apply({}).out).toMatch(/DATABASE_URL is not set/);
  });

  it('refuses production and staging refs (direct and pooler hosts), even when named as allowed', () => {
    for (const ref of ['nfkrfciozjxrodkusrhh', 'lhxlhzgisrauqipuxaxh', 'thjsdcbzlvjradczhgso']) {
      const direct = apply({ DATABASE_URL: `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres`, SEED_ALLOWED_PROJECT_REF: ref }, ['--confirm-ref', ref]);
      expect(direct.out).toMatch(/known production or staging/);
      const pooler = apply({ DATABASE_URL: `postgresql://postgres.${ref}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`, SEED_ALLOWED_PROJECT_REF: ref }, ['--confirm-ref', ref]);
      expect(pooler.out).toMatch(/known production or staging/);
    }
  });

  it('refuses an unknown project unless it is allowed AND confirmed with the same ref', () => {
    const url = 'postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres';
    expect(apply({ DATABASE_URL: url }).out).toMatch(/SEED_ALLOWED_PROJECT_REF/);
    expect(apply({ DATABASE_URL: url, SEED_ALLOWED_PROJECT_REF: 'abcdefghijklmnop' }).out).toMatch(/--confirm-ref abcdefghijklmnop/);
    expect(apply({ DATABASE_URL: url, SEED_ALLOWED_PROJECT_REF: 'zzzzzzzzzzzzzzzz' }, ['--confirm-ref', 'zzzzzzzzzzzzzzzz']).out).toMatch(/does not match/);
    expect(apply({ DATABASE_URL: 'postgresql://u:p@somewhere.example.com/db' }).out).toMatch(/cannot tell which Supabase project/);
  });

  it('lets localhost through the guard, then fails to connect because nothing listens', () => {
    const r = apply({ DATABASE_URL: 'postgresql://postgres:pw@127.0.0.1:1/postgres' });
    expect(r.out).not.toMatch(/REFUSING/);
    expect(r.code).not.toBe(0);
  });

  it('never prints the database password', () => {
    const r = apply({ DATABASE_URL: 'postgresql://postgres:super-secret-pw@db.nfkrfciozjxrodkusrhh.supabase.co:5432/postgres' });
    expect(r.out).not.toContain('super-secret-pw');
  });
});
