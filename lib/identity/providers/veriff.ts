// Veriff behind the provider interface.
//
// PLACEHOLDER until step 6 of the build (backup providers). It reports itself as
// not configured, so the routing skips it and the chain behaves as stripe -> didit.
// Do not use it yet.

import {
  type CreatedSession,
  type IdentityProvider,
  type ProviderOutcome,
  type ProviderWebhookEvent,
  type RedactResult,
} from '../types';

const NOT_BUILT = 'Veriff provider is not implemented yet';

export const veriffProvider: IdentityProvider = {
  name: 'veriff',
  isConfigured: () => false,
  webhookConfigured: () => false,
  async createSession(): Promise<CreatedSession> {
    throw new Error(NOT_BUILT);
  },
  async verifyWebhook(): Promise<ProviderWebhookEvent> {
    throw new Error(NOT_BUILT);
  },
  async getOutcome(): Promise<ProviderOutcome> {
    throw new Error(NOT_BUILT);
  },
  async redact(): Promise<RedactResult> {
    return { ok: false, error: NOT_BUILT };
  },
};
