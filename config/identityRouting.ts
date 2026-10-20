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
// offers the NEXT route automatically. Attempts are capped IN TOTAL per teacher
// (maxTotalAttempts), not per provider. If they decline consent no other provider
// is tried. When nothing is left they are told to contact support.

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
  /**
   * Identity sessions one teacher may start in TOTAL, across every provider.
   * A not_supported answer counts as an attempt, so the default 3 allows one try
   * on each of stripe, didit and veriff, or three tries on one. When it is used
   * up the teacher is shown "contact support".
   */
  maxTotalAttempts: number;
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
  maxTotalAttempts: 3,
  minimumAge: 18,
  countries: [
    { code: 'TT', label: 'Trinidad and Tobago' },
    { code: 'GY', label: 'Guyana' },
    { code: 'BB', label: 'Barbados' },
    { code: 'JM', label: 'Jamaica' },
    { code: 'OTHER', label: 'Another country' },
  ],
};
