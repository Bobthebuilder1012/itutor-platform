// Every cap in the teacher activation feature, in one file.
//
// A verified tutor can now cause mail to be sent from our domain to arbitrary
// addresses, which is a spam surface the platform did not previously have.
// These are the controls on it, and keeping them together is what makes them
// auditable — a limit enforced in the route that defines it is a limit nobody
// can find later.

/** Invitations one teacher may create per rolling 24 hours. */
export const MAX_NEW_INVITES_PER_DAY = 200;

/** Times a single invitation may be re-sent, beyond the original. */
export const MAX_RESENDS_PER_INVITE = 3;

/**
 * Minimum gap between sends of the same invitation.
 *
 * Six hours rather than 24: a teacher who realises within the hour that they
 * sent to the wrong person, fixed it and wants to try again is the common case,
 * and making them wait a day for that is punishing the attentive. Three resends
 * is the real ceiling.
 */
export const MIN_RESEND_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Invitations one bulk "resend pending" press may cover. */
export const MAX_BULK_RESEND = 50;

/**
 * How long a pending invitation may sit unopened before it is called stale.
 *
 * This is the "needs attention" stand-in for a bounce. Seven days is chosen so
 * that a weekend plus a school week has passed: anything less flags addresses
 * that are simply being read slowly.
 */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * CSV upload ceilings.
 *
 * 100 rows keeps the whole upload inside one serverless invocation with the
 * sending done inline, so there is no queue and no cron on the happy path. A
 * teacher migrating a class of 30 is the real case; 500 would buy a drain job
 * for a case nobody has. The limit is a refusal with "split the file", never a
 * partial import — a half-imported file is worse than a rejected one because
 * the teacher cannot tell which half.
 */
export const MAX_CSV_ROWS = 100;
export const MAX_CSV_BYTES = 128 * 1024;

/** Rows per insert chunk when writing a batch. */
export const CSV_INSERT_CHUNK = 25;

/** Pause between sends in a batch, so a provider rate limit hits one row. */
export const BATCH_SEND_DELAY_MS = 120;

/** How long an invitation stays valid. Mirrors the migration's default. */
export const INVITE_TTL_DAYS = 30;

/**
 * How long the browser holds an invite token before signup.
 *
 * Longer than a session because the email is read on a phone and the signup
 * happens on a laptop that evening. Shorter than the invitation's 30 days
 * because a stale cookie must not silently attach a month-old invitation to an
 * unrelated signup.
 */
export const INVITE_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;
