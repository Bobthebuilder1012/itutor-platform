// Pure routing: which provider next. No I/O, unit-tested directly
// (tests/verification/identityRouting.test.ts).

import { identityRouting, type IdentityRoutingConfig } from '@/config/identityRouting';
import type { OutcomeKind, ProviderName } from './types';

/** The ordered route for a document country, before availability is applied. */
export function routeFor(country: string | null | undefined, cfg: IdentityRoutingConfig = identityRouting): ProviderName[] {
  const override = country ? cfg.countryRoutes[country.toUpperCase()] : undefined;
  const base = override ?? [cfg.defaultProvider, ...cfg.fallbackChain];
  return Array.from(new Set(base));
}

/** Drops providers that are not configured (no credentials). */
export function availableRoute(route: ProviderName[], isConfigured: (p: ProviderName) => boolean): ProviderName[] {
  return route.filter((p) => isConfigured(p));
}

export type NextStep =
  | { action: 'start'; provider: ProviderName } // first session, or a first session on a new provider
  | { action: 'reuse'; provider: ProviderName } // the current session is still open
  | { action: 'retry_same'; provider: ProviderName } // new attempt on the same provider
  | { action: 'next'; provider: ProviderName } // fall back to the next route
  | { action: 'done' } // already verified
  | { action: 'none'; reason: 'no_route' | 'consent_declined' | 'attempt_limit' }; // nothing left: contact support

/**
 * Decides what the "start / continue / try again" button does.
 *
 *  not started             -> first provider on the route
 *  pending / processing    -> reuse the open session
 *  retryable_failure, canceled
 *                          -> try again on the same provider
 *  any new session         -> only while the teacher's TOTAL attempts (all providers) are under the cap
 *  not_supported           -> the next route, automatically
 *  consent_declined        -> nothing: the teacher chose not to be checked (contact support)
 *  verified                -> done
 */
export function decideNextStep(input: {
  route: ProviderName[]; // already filtered for availability
  status: OutcomeKind | null;
  current: ProviderName | null;
  attempts: number;
  tried: ProviderName[];
  maxAttempts?: number;
}): NextStep {
  const { route, status, current } = input;
  const max = input.maxAttempts ?? identityRouting.maxTotalAttempts;
  if (status === 'verified') return { action: 'done' };
  if (route.length === 0) return { action: 'none', reason: 'no_route' };
  // An open session can always be continued; a NEW one needs an attempt left.
  const exhausted = input.attempts >= max;

  const next = (): NextStep => {
    if (exhausted) return { action: 'none', reason: 'attempt_limit' };
    const from = current ? route.indexOf(current) : -1;
    const candidate = route.slice(from + 1).find((p) => !input.tried.includes(p));
    return candidate ? { action: 'next', provider: candidate } : { action: 'none', reason: 'no_route' };
  };

  if (!current || status === null) {
    return exhausted ? { action: 'none', reason: 'attempt_limit' } : { action: 'start', provider: route[0]! };
  }

  switch (status) {
    case 'pending':
    case 'processing':
      return { action: 'reuse', provider: current };
    case 'retryable_failure':
    case 'canceled':
      // A provider that dropped out of the route (credentials removed) cannot be retried.
      if (route.includes(current) && !exhausted) return { action: 'retry_same', provider: current };
      return next();
    case 'not_supported':
      return next();
    case 'consent_declined':
      // Declining consent is a choice, not a failure of a provider, so no other
      // provider is tried. There is no manual identity route in the chain.
      return { action: 'none', reason: 'consent_declined' };
    default:
      return exhausted ? { action: 'none', reason: 'attempt_limit' } : { action: 'start', provider: route[0]! };
  }
}

/** True when another route exists after this one, so the UI can offer it. */
export function hasFurtherRoute(route: ProviderName[], current: ProviderName | null, tried: ProviderName[]): boolean {
  const from = current ? route.indexOf(current) : -1;
  return route.slice(from + 1).some((p) => !tried.includes(p));
}
