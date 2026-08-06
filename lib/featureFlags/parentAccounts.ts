export const PARENT_ACCOUNTS_DISABLED_MESSAGE =
  'Parent accounts are not available yet. Students sign up for themselves for now.';

export function isParentAccountsEnabled(): boolean {
  // Default to ENABLED so staging, previews and local development keep the
  // parent flow — it is built and works. Production sets
  // PARENT_ACCOUNTS_ENABLED=false to take it off the live signup.
  //
  // Turning this off hides the role option and refuses role='parent'
  // server-side. It does NOT touch parent accounts that already exist: they
  // keep their role, their children and their access.
  const val = (process.env.PARENT_ACCOUNTS_ENABLED ?? 'true').toLowerCase();
  return val !== 'false';
}
