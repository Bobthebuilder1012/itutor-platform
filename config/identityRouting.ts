// Which identity provider a teacher is sent to, and what happens when it cannot
// check them. CONFIG: change here, never in the flow.
//
//   route for a country = countryRoutes[country] if present,
//                         otherwise [defaultProvider, ...the rest of fallbackChain]
//   A provider that is not configured (no credentials) is skipped, so with only
//   Stripe configured the default config behaves as just stripe.
//   There is NO manual identity review in the chain.
//
// When a provider says not_supported (country, minor, document type) the flow
// offers the NEXT route automatically. When the teacher runs out of attempts on
// a provider it does the same. If they decline consent no other provider is
// tried: they are told to contact support.

import type { ProviderName } from '@/lib/identity/types';

export interface DocumentCountry {
  /** ISO 3166-1 alpha-2, or 'OTHER'. */
  code: string;
  label: string;
}

export interface IdentityRoutingConfig {
  defaultProvider: ProviderName;
  /** Tried in this order after the default: stripe -> didit -> veriff. */
  fallbackChain: ProviderName[];
  /** Per-country override: the full ordered route for that document country. */
  countryRoutes: Partial<Record<string, ProviderName[]>>;
  /** Attempts on ONE provider before the next route is offered. */
  maxAttemptsPerProvider: number;
  /**
   * TODO(policy, undecided): the age below which a document is "minor" and the
   * automatic route reports not_supported/minor. 18 matches the Terms ("must be
   * at least 18"). What happens to a minor afterwards is config/verificationReview.ts.
   */
  minimumAge: number;
  /** What the teacher can pick as their document country at the identity step. */
  countries: DocumentCountry[];
}

export const identityRouting: IdentityRoutingConfig = {
  defaultProvider: 'stripe',
  fallbackChain: ['stripe', 'didit', 'veriff'],
  countryRoutes: {
    // Examples, deliberately empty until the coverage test (docs/IDENTITY_COVERAGE_TEST.md)
    // says which provider reads which country's documents:
    //   TT: ['didit', 'stripe', 'veriff'],
    //   GY: ['didit', 'veriff'],
    //   BB: ['stripe', 'didit', 'veriff'],
  },
  maxAttemptsPerProvider: 3,
  minimumAge: 18,
  countries: [
    { code: 'TT', label: 'Trinidad and Tobago' },
    { code: 'GY', label: 'Guyana' },
    { code: 'BB', label: 'Barbados' },
    { code: 'JM', label: 'Jamaica' },
    { code: 'OTHER', label: 'Another country' },
  ],
};
