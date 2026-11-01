/**
 * The new iTutor UI — the design-system rebuild of the parent and student
 * apps.
 *
 * DELIBERATELY `NEXT_PUBLIC_`, UNLIKE MOST FLAGS IN THIS DIRECTORY. The other
 * server-side flags here (Class Match Week, Finder, paid classes) gate routes
 * and API responses, so the browser never needs the value and a server-only
 * read is the safer choice. This one is different: it decides which *shell and
 * components render*, and that decision is taken inside client components. A
 * non-public variable would be `undefined` in the browser bundle and the flag
 * would silently read as its default on every client page — the exact failure
 * `isPaidClassesEnabled()` has today on the two booking pages.
 *
 * So this follows `isGroupsFeatureEnabled()`: one `NEXT_PUBLIC_` variable the
 * client genuinely sees.
 *
 * DEFAULTS TO OFF, which is the opposite of most flags here. The others
 * default on so previews and local development keep working; this one guards a
 * parallel UI that is incomplete by definition until the screens are built, so
 * the old UI stays the default until someone opts in. Only the exact string
 * `true` turns it on — an unset, empty or misspelled value is off.
 *
 * WHAT IT DOES NOT DO. It changes nothing about the existing pages. The new UI
 * has its own layout shell (`NewUiShell`) and its own light-only tokens; it
 * does not touch `DashboardLayout` or the dark `itutor-*` styles.
 */

export const NEW_UI_DISABLED_MESSAGE =
  'The new iTutor interface is not switched on yet.';

export function isNewUiEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_NEW_UI_ENABLED ?? '').toLowerCase().trim() === 'true';
}
