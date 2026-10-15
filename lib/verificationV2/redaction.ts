// Redacts a teacher's Stripe Identity sessions so Stripe stops holding their ID
// images and data. Called after a decision (config/verificationRetention.ts) and
// on account deletion. It does not decide anything and it never throws.
//
// Every session a teacher ever started is redacted (identity_session_history),
// because a failed attempt still leaves the uploaded ID at Stripe. Nothing is
// logged from the Stripe object; only our tutor id and a count.

import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { getServiceClient } from '@/lib/supabase/server';
import { retentionPolicy } from '@/config/verificationRetention';
import type { Db } from '@/lib/verification/setStatus';

export type RedactResult =
  | { ok: true; redacted: number; skipped: 'disabled' | 'no_session' | 'already_redacted' | null }
  | { ok: false; redacted: number; failed: number; error: string };

type StripeLike = { identity: { verificationSessions: { redact: (id: string) => Promise<unknown> } } };

export async function redactIdentitySessions(opts: {
  tutorId: string;
  db?: Db;
  stripe?: StripeLike | Stripe;
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
      .select('stripe_identity_session_id, identity_session_history, identity_redacted_at')
      .eq('tutor_id', opts.tutorId)
      .maybeSingle();
    if (error) return { ok: false, redacted: 0, failed: 0, error: 'Could not read the verification' };

    const ids = Array.from(
      new Set([...(row?.identity_session_history ?? []), row?.stripe_identity_session_id].filter(Boolean))
    ) as string[];
    if (!row || ids.length === 0) return { ok: true, redacted: 0, skipped: 'no_session' };
    if (row.identity_redacted_at) return { ok: true, redacted: 0, skipped: 'already_redacted' };

    const stripe = (opts.stripe ?? getStripeClient()) as StripeLike;
    let redacted = 0;
    let failed = 0;
    let lastError = '';
    for (const id of ids) {
      try {
        await stripe.identity.verificationSessions.redact(id);
        redacted++;
      } catch (err) {
        failed++;
        lastError = (err as Error).message ?? 'redact failed';
      }
    }

    if (failed > 0) {
      console.error(`[verification-v2/redact] ${failed} of ${ids.length} sessions not redacted for tutor ${opts.tutorId}`);
      return { ok: false, redacted, failed, error: lastError };
    }

    const { error: upErr } = await db
      .from('tutor_verification_v2')
      .update({ identity_redacted_at: new Date().toISOString() })
      .eq('tutor_id', opts.tutorId);
    if (upErr) {
      return { ok: false, redacted, failed: 0, error: 'Redacted at Stripe but could not record it' };
    }
    return { ok: true, redacted, skipped: null };
  } catch (err) {
    console.error('[verification-v2/redact] failed:', (err as Error).message);
    return { ok: false, redacted: 0, failed: 0, error: (err as Error).message ?? 'redact failed' };
  }
}
