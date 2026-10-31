import { isProductionRuntime } from '@/lib/email/allowlist';

/**
 * Teacher verification v2 (identity check + credentials + extras).
 *
 *   VERIFICATION_V2_ENABLED=true     ON everywhere, production included.
 *   VERIFICATION_V2_ENABLED=false    OFF everywhere.
 *   unset or anything else           ON outside production, OFF in production.
 *
 * "Production" is VERCEL_ENV === 'production' on Vercel, NODE_ENV === 'production' off
 * Vercel (lib/email/allowlist.ts). So staging, previews and local development show the
 * feature without any setting, and production stays off until someone sets it to "true".
 *
 * Server side only, deliberately not NEXT_PUBLIC_. The page is a Server Component that
 * checks this before rendering, so no browser bundle needs the value and a stale bundle
 * cannot bypass it. Read per request: changing it needs no rebuild.
 *
 * It does not touch the old flows (app/tutor/verification, app/verification), which keep
 * working whatever this is set to.
 */
export function isVerificationV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env.VERIFICATION_V2_ENABLED ?? '').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return !isProductionRuntime(env);
}
