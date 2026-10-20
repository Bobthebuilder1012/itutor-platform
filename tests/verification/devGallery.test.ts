import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/components/dev/VerificationStatesGallery', () => ({ default: () => null }));

import Page from '@/app/dev/verification-states/page';

const env = process.env as Record<string, string | undefined>;
const original = { dev: env.VERIFICATION_DEV_TOOLS, node: env.NODE_ENV };
afterEach(() => {
  env.VERIFICATION_DEV_TOOLS = original.dev;
  env.NODE_ENV = original.node;
  notFound.mockClear();
});

describe('/dev/verification-states is dev only', () => {
  it('404s without VERIFICATION_DEV_TOOLS=true', () => {
    delete env.VERIFICATION_DEV_TOOLS;
    env.NODE_ENV = 'development';
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
    env.VERIFICATION_DEV_TOOLS = 'false';
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
    env.VERIFICATION_DEV_TOOLS = '1';
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
  });

  it('404s in a production build even with the switch on', () => {
    env.VERIFICATION_DEV_TOOLS = 'true';
    env.NODE_ENV = 'production';
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
  });

  it('renders only with the switch on in a non-production build', () => {
    env.VERIFICATION_DEV_TOOLS = 'true';
    env.NODE_ENV = 'development';
    expect(() => Page()).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
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
