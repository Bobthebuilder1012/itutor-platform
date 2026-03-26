/**
 * Groups / marketplace UI is gated until explicitly enabled.
 * Production: omit the var or set false — nav and routes stay hidden.
 * Staging/dev: set NEXT_PUBLIC_GROUPS_ENABLED=true in Vercel / .env.local
 */
export function isGroupsFeatureEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_GROUPS_ENABLED || '').toLowerCase() === 'true';
}
