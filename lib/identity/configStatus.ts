// Which identity-provider settings are missing, for the admin screen. NAMES ONLY: this
// never returns, logs or echoes a value. A missing setting makes the provider skip itself
// (see isConfigured on each provider), so the teacher sees a plain "contact support" path
// instead of an error; this is how an admin finds out why.

import { primaryProviderFromEnv } from '@/config/identityRouting';
import type { ProviderName } from './types';

type Env = Record<string, string | undefined>;

const REQUIRED: Record<ProviderName, string[]> = {
  didit: ['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET'],
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_IDENTITY_WEBHOOK_SECRET'],
  veriff: ['VERIFF_API_KEY', 'VERIFF_SHARED_SECRET'],
};

export interface IdentitySetupProblem {
  provider: ProviderName;
  primary: boolean;
  /** Variable names, never values. */
  missing: string[];
  message: string;
}

const set = (env: Env, name: string) => (env[name] ?? '').trim().length > 0;

export function identitySetupProblems(env: Env = process.env): IdentitySetupProblem[] {
  const primary = primaryProviderFromEnv(env);
  const out: IdentitySetupProblem[] = [];
  for (const provider of Object.keys(REQUIRED) as ProviderName[]) {
    const missing = REQUIRED[provider].filter((n) => !set(env, n));
    if (missing.length === 0) continue;
    const isPrimary = provider === primary;
    const partlyConfigured = missing.length < REQUIRED[provider].length;
    // The first provider must be complete. A backup is reported only when half set up.
    if (!isPrimary && !partlyConfigured) continue;
    out.push({
      provider,
      primary: isPrimary,
      missing,
      message: isPrimary
        ? `The first identity provider (${provider}) is not fully set up, so teachers cannot start an identity check with it. Missing: ${missing.join(', ')}.`
        : `The backup identity provider (${provider}) is only partly set up and will be skipped. Missing: ${missing.join(', ')}.`,
    });
  }
  return out;
}
