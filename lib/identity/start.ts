// Starting (or continuing) a teacher's identity check, provider-agnostic.
//
// The route calls this and maps the result to HTTP. It decides which provider
// with lib/identity/routing.ts (the fallback chain), creates the session, and
// records it through setIdentityStatus. Nothing here names a provider's own
// codes: it only sees neutral outcomes.

import { identityRouting } from '@/config/identityRouting';
import { setIdentityStatus, type Db } from '@/lib/verification/setStatus';
import { getProvider, routeForCountry } from './registry';
import { notifyIdentityOutcome } from '@/lib/verificationV2/notify';
import { outcomeToStored } from './mapping';
import { decideNextStep } from './routing';
import { isProviderName, type ProviderName } from './types';

export interface IdentityRowLike {
  identity_status: string | null;
  identity_attempts: number;
  identity_provider: string | null;
  identity_provider_session_ref: string | null;
  stripe_identity_session_id: string | null;
  identity_session_refs: { provider: ProviderName; ref: string }[] | null;
  identity_session_history: string[] | null;
  identity_providers_tried: string[] | null;
  identity_country: string | null;
  identity_error_code: string | null;
}

export type StartResult =
  | { ok: true; kind: 'redirect'; url: string; provider: ProviderName }
  | { ok: true; kind: 'verified' | 'processing' }
  | { ok: false; httpStatus: number; error: string; code: string; extra?: Record<string, unknown> };

const fail = (httpStatus: number, code: string, error: string, extra?: Record<string, unknown>): StartResult => ({
  ok: false,
  httpStatus,
  code,
  error,
  extra,
});

export function isValidCountry(code: unknown): code is string {
  return typeof code === 'string' && identityRouting.countries.some((c) => c.code === code);
}

export async function startIdentityCheck(opts: {
  db: Db;
  tutorId: string;
  row: IdentityRowLike;
  /** The country from the request, if the teacher just picked one. */
  country?: string | null;
  returnUrl: string;
}): Promise<StartResult> {
  const { db, tutorId, row } = opts;

  if (opts.country !== undefined && opts.country !== null && !isValidCountry(opts.country)) {
    return fail(400, 'invalid_country', 'Choose the country your document is from');
  }
  const country = opts.country ?? row.identity_country;
  if (!country) return fail(400, 'country_required', 'Choose the country your document is from');

  const status = (row.identity_status ?? null) as Parameters<typeof decideNextStep>[0]['status'];
  const current: ProviderName | null =
    row.identity_provider && isProviderName(row.identity_provider)
      ? row.identity_provider
      : row.stripe_identity_session_id
        ? 'stripe'
        : null;
  const currentRef = row.identity_provider_session_ref ?? row.stripe_identity_session_id;
  const tried = (row.identity_providers_tried ?? []).filter(isProviderName);

  const step = decideNextStep({
    route: routeForCountry(country),
    status,
    current,
    attempts: row.identity_attempts,
    tried,
  });

  if (step.action === 'done') return { ok: true, kind: 'verified' };
  if (step.action === 'none') {
    return fail(
      409,
      step.reason === 'consent_declined' ? 'consent_declined' : step.reason === 'attempt_limit' ? 'attempt_limit' : 'no_route',
      step.reason === 'consent_declined'
        ? 'The identity check was declined. Please contact support.'
        : 'We could not complete the identity check automatically. Please contact support.',
      { support: true }
    );
  }

  // ---- reuse an open session instead of burning an attempt ----
  if (step.action === 'reuse' && current && currentRef) {
    try {
      const provider = getProvider(current);
      const existing = await provider.getOutcome(currentRef);
      const stored = outcomeToStored(existing.outcome);
      if (stored.status !== status || stored.reason !== row.identity_error_code) {
        const saved = await setIdentityStatus({
          tutorId,
          to: stored.status,
          reason: stored.reason,
          providerCode: existing.providerCode,
          documentType: existing.documentType ?? null,
          actor: 'system',
          sessionRef: currentRef,
          provider: current,
          db,
        });
        if (!saved.ok && saved.code === 'db_error') {
          return fail(saved.httpStatus, saved.code, saved.message);
        }
        if (saved.ok) await notifyIdentityOutcome(db, tutorId, stored.status, stored.reason);
      }
      if (stored.status === 'verified') return { ok: true, kind: 'verified' };
      if (stored.status === 'processing') return { ok: true, kind: 'processing' };
      if (stored.status === 'pending' && existing.resumeUrl) {
        return { ok: true, kind: 'redirect', url: existing.resumeUrl, provider: current };
      }
      // Finished badly, or no way to resume: fall through to a fresh attempt below.
      return startFresh(opts, country, current, currentRef, stored.status === 'pending' ? 'retry_same' : null);
    } catch (err) {
      console.warn('[identity/start] could not reuse session:', (err as Error).message);
      return startFresh(opts, country, current, currentRef, 'retry_same');
    }
  }

  return startFresh(opts, country, step.action === 'reuse' ? (current as ProviderName) : step.provider, currentRef, step.action);
}

async function startFresh(
  opts: { db: Db; tutorId: string; row: IdentityRowLike; returnUrl: string },
  country: string,
  provider: ProviderName,
  previousRef: string | null,
  _action: string | null
): Promise<StartResult> {
  const { db, tutorId, row } = opts;
  const current: ProviderName | null =
    row.identity_provider && isProviderName(row.identity_provider)
      ? row.identity_provider
      : row.stripe_identity_session_id
        ? 'stripe'
        : null;

  // After a failure the next move may be a different provider; re-decide with the
  // real state so the attempt count and the route are right.
  const route = routeForCountry(country);
  const tried = (row.identity_providers_tried ?? []).filter(isProviderName);
  let target = provider;
  if (!route.includes(target)) {
    const redo = decideNextStep({ route, status: 'not_supported', current, attempts: row.identity_attempts, tried });
    if (redo.action !== 'next' && redo.action !== 'start') {
      return fail(409, 'no_route', 'We could not complete the identity check automatically. Please contact support.', { support: true });
    }
    target = redo.provider;
  }

  // Attempts are counted IN TOTAL across providers (config maxTotalAttempts).
  const attempt = row.identity_attempts + 1;
  if (attempt > identityRouting.maxTotalAttempts) {
    return fail(429, 'attempt_limit', 'You have used all identity check attempts', { support: true });
  }

  const impl = getProvider(target);
  let created;
  try {
    created = await impl.createSession({ tutorId, attempt, returnUrl: opts.returnUrl, country });
  } catch (err) {
    console.error(`[identity/start] ${target} create failed:`, (err as Error).message);
    return fail(502, 'provider_error', 'Could not start the identity check. Please try again.');
  }

  // Close out the previous unfinished session so it cannot be reopened.
  if (previousRef && current && current === target && getProvider(current).cancelSession) {
    await getProvider(current).cancelSession!(previousRef);
  }

  const refs = [...(row.identity_session_refs ?? [])];
  if (!refs.some((r) => r.provider === target && r.ref === created.sessionRef)) {
    refs.push({ provider: target, ref: created.sessionRef });
  }
  const legacy =
    target === 'stripe'
      ? {
          stripe_identity_session_id: created.sessionRef,
          identity_session_history: Array.from(new Set([...(row.identity_session_history ?? []), created.sessionRef])),
        }
      : {};

  const started = await setIdentityStatus({
    tutorId,
    to: 'pending',
    reason: null,
    providerCode: null,
    actor: 'tutor',
    expectAttempts: row.identity_attempts,
    extra: {
      identity_attempts: attempt,
      identity_provider: target,
      identity_provider_session_ref: created.sessionRef,
      identity_session_refs: refs,
      identity_providers_tried: Array.from(new Set([...tried, target])),
      identity_country: country,
      identity_started_at: new Date().toISOString(),
      ...legacy,
    },
    db,
  });

  if (!started.ok) {
    if (started.code === 'conflict') {
      // A concurrent identical request saved first. Same session if the provider
      // is idempotent (Stripe); otherwise ours is an orphan and is removed.
      const { data: fresh } = await db
        .from('tutor_verification_v2')
        .select('identity_provider_session_ref')
        .eq('tutor_id', tutorId)
        .maybeSingle();
      if (fresh?.identity_provider_session_ref === created.sessionRef) {
        return { ok: true, kind: 'redirect', url: created.url, provider: target };
      }
      await impl.redact(created.sessionRef, 'decision');
      return fail(409, 'in_flight', 'Another request is already starting your check. Please wait a moment.');
    }
    return fail(started.httpStatus, started.code, started.message);
  }

  return { ok: true, kind: 'redirect', url: created.url, provider: target };
}
