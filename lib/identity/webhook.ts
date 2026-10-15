// The shared identity webhook handler. One implementation for every provider:
//   - the PROVIDER verifies its own signature over the raw body (400 on failure)
//   - idempotent on the event id (identity_webhook_events)
//   - stores no payload: event id, type-less provider name, session ref, result
//   - applies only NEUTRAL outcomes, through setIdentityStatus
//   - off unless VERIFICATION_V2_ENABLED=true (acknowledged, no database access)
//
// Routes: app/api/webhooks/stripe-identity (the original path, kept so the Stripe
// endpoint does not move) and app/api/webhooks/identity/[provider].

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { isRuleRefusal, setIdentityStatus, type Db } from '@/lib/verification/setStatus';
import { outcomeToStored } from './mapping';
import { getProvider } from './registry';
import {
  WebhookNotSupportedError,
  WebhookSignatureError,
  type ProviderName,
  type ProviderOutcome,
  type ProviderWebhookEvent,
} from './types';

/** Give up after this many deliveries of the same event. */
const MAX_ATTEMPTS = 5;

type Outcome = 'processed' | 'skipped' | 'failed' | 'abandoned';

async function record(
  db: Db,
  provider: ProviderName,
  ev: ProviderWebhookEvent,
  outcome: Outcome,
  attempts: number,
  errorMessage?: string
): Promise<boolean> {
  const { error } = await db.from('identity_webhook_events').upsert(
    {
      event_id: ev.eventId,
      event_type: 'identity.result',
      provider,
      livemode: ev.livemode ?? false,
      session_id: ev.sessionRef,
      processing_status: outcome,
      attempts,
      error_message: errorMessage ?? null,
      processed_at: outcome === 'failed' ? null : new Date().toISOString(),
    },
    { onConflict: 'event_id' }
  );
  if (error) console.error(`[identity-webhook:${provider}] could not record event:`, error.message);
  return !error;
}

/** Finds the teacher for a session when the payload did not carry our id. */
async function tutorForSession(db: Db, provider: ProviderName, ref: string): Promise<string | null> {
  const { data } = await db
    .from('tutor_verification_v2')
    .select('tutor_id')
    .eq('identity_provider', provider)
    .eq('identity_provider_session_ref', ref)
    .maybeSingle();
  if (data?.tutor_id) return data.tutor_id;
  if (provider === 'stripe') {
    const legacy = await db.from('tutor_verification_v2').select('tutor_id').eq('stripe_identity_session_id', ref).maybeSingle();
    return legacy.data?.tutor_id ?? null;
  }
  return null;
}

/**
 * Applies one provider outcome to the teacher it belongs to.
 * 'applied' = changed (or already held); 'ignored' = nothing to do (old session,
 * a refused rule). Throws on a database fault so the event stays retryable.
 */
export async function applyProviderOutcome(
  db: Db,
  provider: ProviderName,
  ev: ProviderWebhookEvent,
  result: ProviderOutcome
): Promise<'applied' | 'ignored'> {
  if (!ev.sessionRef) return 'ignored';
  const tutorId = ev.tutorId ?? (await tutorForSession(db, provider, ev.sessionRef));
  if (!tutorId) return 'ignored';

  const stored = outcomeToStored(result.outcome);
  const res = await setIdentityStatus({
    tutorId,
    to: stored.status,
    reason: stored.reason,
    providerCode: result.providerCode,
    actor: 'system',
    sessionRef: ev.sessionRef,
    provider,
    db,
  });

  if (res.ok) return 'applied';
  if (isRuleRefusal(res) || res.code === 'stale_session' || res.code === 'not_found') return 'ignored';
  // conflict (a concurrent change) and db_error are retried by the provider.
  throw new Error(res.message);
}

export async function handleIdentityWebhook(providerName: ProviderName, request: Request): Promise<NextResponse> {
  const provider = getProvider(providerName);

  if (!provider.webhookConfigured()) {
    console.error(`[identity-webhook:${providerName}] signing secret is not configured`);
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // CRITICAL: the raw body string. Signatures are over the exact bytes sent.
  const rawBody = await request.text();

  let ev: ProviderWebhookEvent;
  try {
    ev = await provider.verifyWebhook(rawBody, request.headers);
  } catch (err) {
    if (err instanceof WebhookNotSupportedError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (err instanceof WebhookSignatureError) {
      console.warn(`[identity-webhook:${providerName}] signature verification failed`);
    } else {
      console.warn(`[identity-webhook:${providerName}] could not verify:`, (err as Error).message);
    }
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`[identity-webhook:${providerName}] verified event:`, JSON.stringify({ id: ev.eventId, ignore: ev.ignore }));

  if (!isVerificationV2Enabled() || ev.ignore) {
    return NextResponse.json({ received: true, status: 'ignored' });
  }

  const db = getServiceClient() as Db;

  // De-duplicate on the event id. Only a finished row is terminal.
  const { data: existing, error: readError } = await db
    .from('identity_webhook_events')
    .select('event_id, processing_status, attempts')
    .eq('event_id', ev.eventId)
    .maybeSingle();

  if (readError) {
    console.error(`[identity-webhook:${providerName}] de-dup table unreadable:`, readError.message);
    return NextResponse.json({ received: false, status: 'dedupe_unavailable', retry: true }, { status: 500 });
  }

  if (
    existing &&
    (existing.processing_status === 'processed' ||
      existing.processing_status === 'skipped' ||
      existing.processing_status === 'abandoned')
  ) {
    return NextResponse.json({ received: true, status: 'duplicate' });
  }

  const attempts = (existing?.attempts ?? 0) + 1;
  if (attempts > MAX_ATTEMPTS) {
    await record(db, providerName, ev, 'abandoned', attempts, `Exceeded ${MAX_ATTEMPTS} processing attempts`);
    return NextResponse.json({ received: true, status: 'abandoned' });
  }

  try {
    // A provider whose payload is not authoritative is asked for the real result.
    const result = ev.outcome ?? (ev.sessionRef ? await provider.getOutcome(ev.sessionRef) : null);
    if (!result) {
      await record(db, providerName, ev, 'skipped', attempts);
      return NextResponse.json({ received: true, status: 'ignored' });
    }

    const applied = await applyProviderOutcome(db, providerName, ev, result);
    const saved = await record(db, providerName, ev, applied === 'applied' ? 'processed' : 'skipped', attempts);
    if (!saved) {
      return NextResponse.json({ received: false, status: 'record_failed', retry: true }, { status: 500 });
    }
    return NextResponse.json({ received: true, status: applied });
  } catch (err) {
    const message = (err as Error).message ?? 'unknown error';
    console.error(`[identity-webhook:${providerName}] processing error, will retry:`, message);
    await record(db, providerName, ev, 'failed', attempts, message);
    return NextResponse.json({ received: false, status: 'processing_error', retry: true }, { status: 500 });
  }
}
