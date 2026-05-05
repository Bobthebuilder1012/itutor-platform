/**
 * Groups / marketplace UI: production stays off unless NEXT_PUBLIC_GROUPS_ENABLED=true.
 * Local next dev: on when the var is unset so nav matches the shipped routes.
 */
export function isGroupsFeatureEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_GROUPS_ENABLED || '').toLowerCase().trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV === 'development';
}
