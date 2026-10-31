// Didit settings that have a safe default outside production.
//
// DIDIT_WORKFLOW_ID falls back to the SANDBOX workflow ("Free KYC" in the application
// "iTutor (Sandbox)") in every non-production environment, so a missing variable on staging
// does not stop the teacher flow from being tried. In production there is no fallback: an
// unset id means Didit is not configured. The workflow id is a reference, not a secret.
// The API key and the webhook secret have NO fallback anywhere.

import { isProductionRuntime } from '@/lib/email/allowlist';

export const SANDBOX_WORKFLOW_ID = '9bfa64cd-4fc0-446d-b971-4a9277bb4978';

export function diditWorkflowId(env: Record<string, string | undefined> = process.env): string {
  const set = (env.DIDIT_WORKFLOW_ID ?? '').trim();
  if (set) return set;
  return isProductionRuntime(env) ? '' : SANDBOX_WORKFLOW_ID;
}
