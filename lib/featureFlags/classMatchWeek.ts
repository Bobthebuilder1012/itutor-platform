export const CLASS_MATCH_WEEK_DISABLED_MESSAGE =
  'Class Match Week is not running right now.';

/**
 * The Class Match Week kill switch.
 *
 * Set `CLASS_MATCH_WEEK_ENABLED=false` to take the whole campaign off the site
 * without touching a single database row: the countdown in every top bar, the
 * dashboard banners, the teacher tab in My Classes, the portal pages, and every
 * /api/class-match endpoint all go quiet together.
 *
 * WHY ONE FLAG REACHES ALL OF THEM. Every campaign surface — twelve routes and
 * pages at the time of writing — decides whether there is anything to show by
 * asking `getLiveCampaign()` for the live campaign row, and renders an empty
 * state when the answer is null. So the flag is enforced inside that one
 * function rather than being threaded through each caller: off means "there is
 * no live campaign", which is a state every surface already handles correctly
 * because it is the state they spend most of the year in.
 *
 * It is deliberately server-side and NOT `NEXT_PUBLIC_`. Client components learn
 * the campaign through `/api/class-match/campaign`, which answers `null` when
 * this is off, so no browser bundle needs the value and flipping it cannot be
 * defeated by a saved URL or a stale bundle.
 *
 * Defaults to ENABLED so previews, staging and local development keep working
 * with no extra configuration.
 *
 * WHAT IT DOES NOT DO. It does not end a campaign or delete anything. Turning it
 * back on restores exactly the campaign that was running: the same row, the same
 * opt-ins, the same sessions, the same reservations and the same coupons. Only
 * the countdown loses the days it was switched off for.
 */
export function isClassMatchWeekEnabled(): boolean {
  const val = (process.env.CLASS_MATCH_WEEK_ENABLED ?? 'true').toLowerCase();
  return val !== 'false';
}
