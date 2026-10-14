// Who may hold, spend or redeem credits. Checked on the server by every credit
// endpoint, because nothing else stops a suspended student or parent: the
// suspension redirect (useSuspensionCheck) runs only inside the tutor and
// admin shells, and only in the browser.

import type { SupabaseClient } from '@supabase/supabase-js';

export type CreditAccount = { id: string; role: 'student' | 'parent'; fullName: string | null; email: string | null };

export async function creditAccountGuard(
  admin: SupabaseClient,
  userId: string
): Promise<{ ok: true; account: CreditAccount } | { ok: false; status: number; body: Record<string, unknown> }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, is_suspended, full_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return { ok: false, status: 401, body: { error: 'Sign in to use credits' } };
  if (profile.is_suspended) {
    return { ok: false, status: 403, body: { error: 'This account is suspended', reason: 'suspended' } };
  }
  if (profile.role !== 'student' && profile.role !== 'parent') {
    return {
      ok: false,
      status: 403,
      body: { error: 'Credits are for student and parent accounts', reason: 'not_eligible_role' },
    };
  }
  return {
    ok: true,
    account: { id: profile.id, role: profile.role, fullName: profile.full_name ?? null, email: profile.email ?? null },
  };
}
