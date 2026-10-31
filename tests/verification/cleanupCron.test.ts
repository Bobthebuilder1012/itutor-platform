import { readFileSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ run: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/verificationV2/cleanup', () => ({ runVerificationCleanup: h.run }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: h.service }));

import { GET } from '@/app/api/cron/verification-cleanup/route';

const SECRET = 'cron-secret-for-tests';
const call = (url = '/api/cron/verification-cleanup', auth: string | null = `Bearer ${SECRET}`) =>
  GET(new NextRequest(new URL(url, 'http://localhost'), { headers: auth ? { authorization: auth } : {} }));
const report = { dryRun: true, v2RejectedFiles: { due: 0, done: 0 }, v2RevokedFiles: { due: 0, done: 0 }, oldRejectedRequests: { due: 0, done: 0 }, redactions: { due: 0, done: 0 }, errors: [] };

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.VERIFICATION_V2_ENABLED = 'true';
  h.run.mockReset().mockResolvedValue(report);
  h.service.mockReset();
});
afterEach(() => {
  delete process.env.VERIFICATION_V2_ENABLED;
});

describe('verification cleanup cron: who may call it', () => {
  it('401 without a secret, with a wrong one, or when CRON_SECRET is not set', async () => {
    expect((await call(undefined, null)).status).toBe(401);
    expect((await call(undefined, 'Bearer nope')).status).toBe(401);
    expect((await call(undefined, SECRET)).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call(undefined, 'Bearer undefined')).status).toBe(401);
    expect((await call(undefined, 'Bearer ')).status).toBe(401);
    expect(h.run).not.toHaveBeenCalled();
  });
});

describe('verification cleanup cron: the feature flag', () => {
  it('does nothing while the flag is off (explicitly false, or unset in production): no sweep, no database client', async () => {
    vi.stubEnv('VERCEL_ENV', 'production'); // unset means OFF in production
    for (const v of [undefined, 'false', 'FALSE', '0', '']) {
      if (v === undefined) delete process.env.VERIFICATION_V2_ENABLED;
      else process.env.VERIFICATION_V2_ENABLED = v;
      for (const url of ['/api/cron/verification-cleanup', '/api/cron/verification-cleanup?apply=1']) {
        const res = await call(url);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ skipped: 'VERIFICATION_V2_ENABLED is off' });
      }
    }
    expect(h.run).not.toHaveBeenCalled();
    expect(h.service).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('the flag does not unlock a request that has no secret', async () => {
    expect((await call(undefined, null)).status).toBe(401);
    expect(h.run).not.toHaveBeenCalled();
  });
});

describe('verification cleanup cron: dry run unless apply=1', () => {
  it('runs a dry run by default', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.run).toHaveBeenCalledWith({ dryRun: true });
  });

  it('only apply=1 turns the dry run off (apply=true or apply=0 stay dry)', async () => {
    await call('/api/cron/verification-cleanup?apply=1');
    expect(h.run).toHaveBeenLastCalledWith({ dryRun: false });
    for (const q of ['apply=true', 'apply=0', 'apply=']) {
      await call(`/api/cron/verification-cleanup?${q}`);
      expect(h.run).toHaveBeenLastCalledWith({ dryRun: true });
    }
  });
});

describe('verification cleanup cron: the schedule', () => {
  const vercel = JSON.parse(readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] };
  const entry = vercel.crons.find((c) => c.path.startsWith('/api/cron/verification-cleanup'));

  it('is scheduled once a day, and applies (the flag is what keeps it idle)', () => {
    expect(entry).toBeDefined();
    expect(entry!.path).toBe('/api/cron/verification-cleanup?apply=1');
    expect(entry!.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it('did not disturb the other schedules', () => {
    expect(vercel.crons.filter((c) => c.path.startsWith('/api/cron/verification-cleanup'))).toHaveLength(1);
    expect(vercel.crons.length).toBeGreaterThanOrEqual(13);
    expect(new Set(vercel.crons.map((c) => c.path)).size).toBe(vercel.crons.length);
  });
});
