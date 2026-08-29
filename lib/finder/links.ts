/**
 * Where an anonymous Finder visitor's links point.
 *
 * Every one of them goes through `/find/claim?to=…` rather than straight to the
 * destination. That hop adopts the anonymous run onto whatever account was just
 * created or signed into (see app/find/claim/route.ts), so the answers the
 * family gave before they had an account survive the account. A link that
 * skipped it would strand the run: the cookie still names it, but nothing ever
 * attaches it to a user, and the matches quietly become someone else's problem
 * the next time the cookie expires.
 *
 * Kept as plain string builders in one file because both a server component
 * (MatchResults, the browse page) and a client component (MatchCard) need the
 * same URLs, and two copies of an encoding rule is how one of them ends up
 * subtly different.
 */

export type FinderRole = 'student' | 'parent';

/** The claim hop, with a validated-at-the-route destination hanging off it. */
function claim(to: string): string {
  return `/find/claim?to=${to}`;
}

/**
 * Create an account, then continue to `to`.
 *
 * The role rides along so signup can skip its own role step — the visitor
 * already answered that question at /start, and asking twice reads as the
 * product not having listened.
 */
export function signupThen(role: FinderRole, to: string): string {
  return `/signup?role=${role}&redirect=${encodeURIComponent(claim(to))}`;
}

/** Sign in to an existing account, then continue to `to`. */
export function loginThen(to: string): string {
  return `/login?redirect=${encodeURIComponent(claim(to))}`;
}

/**
 * Where a class card goes.
 *
 * ANONYMOUSLY THIS IS SIGNUP, NOT THE CLASS PAGE. It used to be the class page
 * for everyone, on the reasoning that /api/groups/[groupId] serves anonymous
 * reads and the Join button would ask for the account one screen later — "the
 * account is asked for at the moment it is genuinely needed". The owner decided
 * otherwise: View class asks for the account first, and the class opens on the
 * other side of it. The redirect is what keeps that from being a dead end — the
 * visitor lands on the class they clicked, not on a dashboard.
 */
export function classHref(groupId: string, role: FinderRole, anonymous: boolean): string {
  const to = `/student/explore/${groupId}`;
  return anonymous ? signupThen(role, to) : to;
}
