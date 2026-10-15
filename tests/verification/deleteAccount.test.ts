import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  order: [] as string[],
  cleanupMode: 'ok' as 'ok' | 'reject' | 'throw',
}));

// A database where every method is chainable and awaiting it yields success.
function universalClient() {
  const handler: ProxyHandler<any> = {
    get(t, prop) {
      if (prop in t) return (t as any)[prop];
      if (prop === 'then') return (res: any) => Promise.resolve({ data: [], error: null }).then(res);
      return (...args: any[]) => {
        if (prop === 'from') h.order.push(`from:${args[0]}`);
        if (prop === 'deleteUser') return Promise.resolve({ error: null });
        return new Proxy({}, handler);
      };
    },
  };
  const target: any = {
    auth: { admin: { deleteUser: async () => { h.order.push('auth.deleteUser'); return { error: null }; } } },
  };
  return new Proxy(target, handler);
}

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      signOut: async () => ({ error: null }),
    },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => universalClient() }));
vi.mock('@/lib/customerio/sync', () => ({ removeCustomer: async () => { h.order.push('customerio'); } }));
vi.mock('@/lib/verificationV2/accountDeletion', () => ({
  cleanupVerificationDataForAccountDeletion: async () => {
    h.order.push('verification-cleanup');
    if (h.cleanupMode === 'reject') throw new Error('cleanup exploded');
    return { ok: true, timedOut: false, details: [] };
  },
}));

import { DELETE } from '@/app/api/delete-account/route';

beforeEach(() => {
  h.order = [];
  h.cleanupMode = 'ok';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
});

describe('DELETE /api/delete-account and verification cleanup', () => {
  it('runs the verification cleanup before the profile is deleted', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const cleanup = h.order.indexOf('verification-cleanup');
    const profileDelete = h.order.lastIndexOf('from:profiles');
    expect(cleanup).toBeGreaterThan(-1);
    expect(cleanup).toBeLessThan(profileDelete);
    expect(h.order).toContain('auth.deleteUser');
  });

  it('a cleanup that FAILS (rejects) does not block or break account deletion', async () => {
    h.cleanupMode = 'reject';
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(h.order).toContain('from:profiles');
    expect(h.order).toContain('auth.deleteUser');
  });
});
