import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/components/dev/VerificationStatesGallery', () => ({ default: () => null }));

import Page from '@/app/dev/verification-states/page';

const env = process.env as Record<string, string | undefined>;
const KEYS = ['VERIFICATION_DEV_TOOLS', 'NODE_ENV', 'VERCEL_ENV'] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete env[k];
    else env[k] = original[k];
  }
  notFound.mockClear();
});
const set = (v: Record<string, string | undefined>) => {
  for (const k of KEYS) delete env[k];
  Object.assign(env, v);
};

describe('/dev/verification-states is a preview for non-production environments', () => {
  it('is open by default outside production (local, tests, a Vercel preview or staging)', () => {
    for (const e of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { VERCEL_ENV: 'preview', NODE_ENV: 'production' }, { VERCEL_ENV: 'development' }]) {
      set(e);
      expect(() => Page(), JSON.stringify(e)).not.toThrow();
    }
    expect(notFound).not.toHaveBeenCalled();
  });

  it('404s when VERIFICATION_DEV_TOOLS is explicitly "false"', () => {
    set({ NODE_ENV: 'development', VERIFICATION_DEV_TOOLS: 'false' });
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
    set({ VERCEL_ENV: 'preview', VERIFICATION_DEV_TOOLS: ' FALSE ' });
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
  });

  it('404s in production, even with the switch on', () => {
    set({ VERCEL_ENV: 'production', NODE_ENV: 'production', VERIFICATION_DEV_TOOLS: 'true' });
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
    set({ NODE_ENV: 'production', VERIFICATION_DEV_TOOLS: 'true' }); // self-hosted production
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
  });

  it('the gallery and its fixtures make no network requests and read no environment secrets', () => {
    const dir = path.resolve(__dirname, '../../components/dev');
    for (const f of ['VerificationStatesGallery.tsx', 'TeacherStates.tsx', 'AdminAndBadges.tsx', 'FallbackExplorer.tsx', 'galleryData.ts', 'GalleryParts.tsx']) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/process\.env/);
      expect(src, f).not.toMatch(/supabase/i);
    }
  });
});
