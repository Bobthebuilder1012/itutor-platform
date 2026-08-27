/**
 * Find Your iTutor — the Finder's flags.
 *
 * Build plan §1 makes every decision in that table reversible behind a flag,
 * and §10 requires the one-time login backfill to ship behind a gate mode:
 * "if it ships with a bug — firing repeatedly, or firing for tutors — it
 * annoys the entire existing user base at once and there is no second chance
 * at a first impression."
 *
 * Deliberately server-side, not NEXT_PUBLIC_. The gate decision is taken in
 * the login and signup redirect paths and in the /find layout, all of which
 * run on the server, so no browser bundle needs the value and flipping it
 * cannot be defeated by a stale bundle or a saved URL.
 */

export const FINDER_DISABLED_MESSAGE =
  'Finding your iTutor is not available right now.';

/**
 * Master switch for every Finder surface: /find, /api/finder/*, the nav items
 * and the dashboard cards. Off behaves as if the feature were never built —
 * nothing is deleted, and the existing Explore / find-tutors paths remain the
 * way students reach classes.
 *
 * Defaults to ENABLED so previews, staging and local development work with no
 * extra configuration, matching the other flags in this directory.
 */
export function isFinderEnabled(): boolean {
  const val = (process.env.FINDER_ENABLED ?? 'true').toLowerCase();
  return val !== 'false';
}

/**
 * How aggressively the Finder is forced on users.
 *
 *   off      — the Finder exists and is reachable from the nav, but nothing is
 *              ever forced. No signup redirect, no login backfill.
 *   internal — the forced interstitial fires only for internal accounts (see
 *              isInternalCohort). This is the setting §10 asks for on first
 *              deploy: prove the one-shot backfill on staff before it reaches
 *              the base, because it only gets one chance.
 *   all      — forced once for every student and parent, including the
 *              existing-user login backfill.
 *
 * Defaults to `internal` — the safe end. Rolling forward to `all` is a
 * deliberate act, which is the point: the default cannot annoy the whole user
 * base by accident on a deploy nobody watched.
 */
export type FinderGateMode = 'off' | 'internal' | 'all';

export function getFinderGateMode(): FinderGateMode {
  const val = (process.env.FINDER_GATE_MODE ?? 'internal').toLowerCase();
  if (val === 'off' || val === 'all' || val === 'internal') return val;
  // An unrecognised value must not silently mean "all".
  return 'internal';
}

/**
 * Email domains treated as the internal cohort while gate mode is `internal`.
 * Defaults to the staff domain; override with a comma-separated list.
 */
export function getInternalEmailDomains(): string[] {
  const raw = process.env.FINDER_INTERNAL_EMAIL_DOMAINS ?? 'myitutor.com';
  return raw
    .split(',')
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function isInternalCohort(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  return getInternalEmailDomains().includes(domain);
}

/**
 * Whether the forced interstitial should fire for this user at all.
 * Role filtering is the caller's job for signup (where the role is known
 * before a profile exists); this answers only the cohort question.
 */
export function shouldForceFinder(email: string | null | undefined): boolean {
  if (!isFinderEnabled()) return false;
  const mode = getFinderGateMode();
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return isInternalCohort(email);
}

/**
 * Recommendations returned per subject. Build plan §1 takes three as the
 * default; §3.3 caps the ranked result set at this number.
 */
export function getFinderMaxMatches(): number {
  const parsed = Number.parseInt(process.env.FINDER_MAX_MATCHES ?? '3', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 3;
  return Math.min(parsed, 12);
}

/**
 * Where an attributed campaign link lands. Build plan §2.3 ships /r/[code]
 * before the Finder itself so print and QR assets can go out early; pointing
 * this at an existing route lets those codes work before /find exists.
 */
export function getFinderLandingPath(): string {
  // Defaults to /start, not /find. A printed code's scanner has no account and no
  // role, and /start is the screen that asks for one — /find would render the
  // picker inline anyway, but landing on the route whose whole job is that
  // question is the clearer of the two.
  const raw = process.env.FINDER_LANDING_PATH ?? '/start';
  return raw.startsWith('/') ? raw : `/${raw}`;
}
