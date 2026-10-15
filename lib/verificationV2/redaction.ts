// Redacts a teacher's identity-provider sessions so the provider stops holding
// their ID images and data. Called after a decision (config/verificationRetention.ts)
// and on account deletion. It does not decide anything and it never throws.
//
// Provider-agnostic: every session ever created is recorded as {provider, ref}
// (identity_session_refs), because a failed attempt still leaves the uploaded ID
// at the provider. Rows from before that column fall back to the Stripe columns.
// Nothing is logged from a provider's response; only our tutor id and a count.

import { getServiceClient } from '@/lib/supabase/server';
import { retentionPolicy } from '@/config/verificationRetention';
import { getProvider } from '@/lib/identity/registry';
import { isProviderName, type IdentityProvider, type ProviderName } from '@/lib/identity/types';
import type { Db } from '@/lib/verification/setStatus';

export type RedactResult =
  | { ok: true; redacted: number; skipped: 'disabled' | 'no_session' | 'already_redacted' | null }
  | { ok: false; redacted: number; failed: number; error: string };

type SessionRef = { provider: ProviderName; ref: string };

/** Every session recorded for a row, new column first, legacy Stripe columns as a fallback. */
export function sessionRefsOf(row: {
  identity_session_refs?: unknown;
  identity_session_history?: string[] | null;
  stripe_identity_session_id?: string | null;
}): SessionRef[] {
  const out = new Map<string, SessionRef>();
  const add = (provider: unknown, ref: unknown) => {
    if (isProviderName(provider) && typeof ref === 'string' && ref) out.set(`${provider}:${ref}`, { provider, ref });
  };
  if (Array.isArray(row.identity_session_refs)) {
    for (const r of row.identity_session_refs as any[]) add(r?.provider, r?.ref);
  }
  for (const ref of row.identity_session_history ?? []) add('stripe', ref);
  add('stripe', row.stripe_identity_session_id);
  return Array.from(out.values());
}

export async function redactIdentitySessions(opts: {
  tutorId: string;
  db?: Db;
  /** Test seam: replaces the provider lookup. */
  providerFor?: (name: ProviderName) => Pick<IdentityProvider, 'redact'>;
  /** Account deletion redacts regardless of the post-decision setting. */
  force?: boolean;
}): Promise<RedactResult> {
  if (!opts.force && !retentionPolicy.redactStripeSessionAfterDecision) {
    return { ok: true, redacted: 0, skipped: 'disabled' };
  }

  try {
    const db = opts.db ?? (getServiceClient() as Db);
    const { data: row, error } = await db
      .from('tutor_verification_v2')
      .select(
        'stripe_identity_session_id, identity_session_history, identity_session_refs, identity_redacted_at'
      )
      .eq('tutor_id', opts.tutorId)
      .maybeSingle();
    if (error) return { ok: false, redacted: 0, failed: 0, error: 'Could not read the verification' };

    const refs = row ? sessionRefsOf(row) : [];
    if (!row || refs.length === 0) return { ok: true, redacted: 0, skipped: 'no_session' };
    if (row.identity_redacted_at) return { ok: true, redacted: 0, skipped: 'already_redacted' };

    const reason = opts.force ? 'account_deletion' : 'decision';
    let redacted = 0;
    let failed = 0;
    let lastError = '';
    for (const { provider, ref } of refs) {
      try {
        const impl = opts.providerFor ? opts.providerFor(provider) : getProvider(provider);
        const res = await impl.redact(ref, reason);
        if (res.ok) redacted++;
        else {
          failed++;
          lastError = res.error;
        }
      } catch (err) {
        failed++;
        lastError = (err as Error).message ?? 'redact failed';
      }
    }

    if (failed > 0) {
      console.error(`[verification-v2/redact] ${failed} of ${refs.length} sessions not redacted for tutor ${opts.tutorId}`);
      return { ok: false, redacted, failed, error: lastError };
    }

    const { error: upErr } = await db
      .from('tutor_verification_v2')
      .update({ identity_redacted_at: new Date().toISOString() })
      .eq('tutor_id', opts.tutorId);
    if (upErr) return { ok: false, redacted, failed: 0, error: 'Redacted at the provider but could not record it' };
    return { ok: true, redacted, skipped: null };
  } catch (err) {
    console.error('[verification-v2/redact] failed:', (err as Error).message);
    return { ok: false, redacted: 0, failed: 0, error: (err as Error).message ?? 'redact failed' };
  }
}
