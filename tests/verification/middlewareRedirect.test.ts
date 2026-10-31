import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));

import { middleware } from '@/middleware';

const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, 'https://staging.example'), { headers: cookie ? { cookie } : {} });

describe('/tutor/verification-v2 for a signed-out visitor', () => {
  it('is a real 307 to the login page, remembering where they were going', async () => {
    const res = await middleware(req('/tutor/verification-v2'));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('next')).toBe('/tutor/verification-v2');
  });

  it('is not redirected by this rule when a session cookie is present', async () => {
    const res = await middleware(req('/tutor/verification-v2', 'sb-abc-auth-token=x'));
    expect(res.headers.get('location') ?? '').not.toContain('/login');
  });

  it('does not touch other tutor pages or the API routes', async () => {
    for (const p of ['/tutor/dashboard', '/api/tutor/verification-v2/state']) {
      const res = await middleware(req(p));
      expect(res.headers.get('location') ?? '', p).not.toContain('next=%2Ftutor%2Fverification-v2');
    }
  });
});
