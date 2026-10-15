/**
 * Teacher verification v2 (Stripe Identity + credentials + extras).
 *
 * Set `VERIFICATION_V2_ENABLED=true` to switch it on. Anything else, including
 * unset, is OFF: /tutor/verification-v2 returns 404, every
 * /api/tutor/verification-v2 route returns 404, and the Stripe webhook records
 * the two identity events as skipped instead of touching the database.
 *
 * Server-side only, deliberately not NEXT_PUBLIC_. The page is a Server
 * Component that checks this before rendering, so no browser bundle needs the
 * value and a stale bundle cannot bypass it.
 *
 * It does not touch the old flows (app/tutor/verification, app/verification),
 * which keep working whatever this is set to.
 */
export function isVerificationV2Enabled(): boolean {
  return (process.env.VERIFICATION_V2_ENABLED ?? 'false').toLowerCase() === 'true';
}
