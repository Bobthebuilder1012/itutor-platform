// The only place that knows which providers exist.

import { diditProvider } from './providers/didit';
import { veriffProvider } from './providers/veriff';
import { stripeProvider } from './providers/stripe';
import { availableRoute, routeFor } from './routing';
import type { IdentityProvider, ProviderName } from './types';

const PROVIDERS: Record<ProviderName, IdentityProvider> = {
  stripe: stripeProvider,
  didit: diditProvider,
  veriff: veriffProvider,
};

export function getProvider(name: ProviderName): IdentityProvider {
  return PROVIDERS[name];
}

export function isProviderConfigured(name: ProviderName): boolean {
  return PROVIDERS[name].isConfigured();
}

/** The route for a document country, with unconfigured providers skipped. */
export function routeForCountry(country: string | null | undefined): ProviderName[] {
  return availableRoute(routeFor(country), isProviderConfigured);
}
