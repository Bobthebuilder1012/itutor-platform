// Open policy decisions for teacher verification, kept as CONFIG so nobody has
// to find them in code. Every value here is a placeholder or an explicit
// "undecided". Changing a value changes behaviour; nothing else hardcodes these.

export interface ReviewerPolicy {
  /**
   * TODO(policy, undecided): the named reviewer.
   * Empty = any admin or reviewer may review v2 applications (today's behaviour).
   * Set profile ids and/or emails to restrict v2 decisions to those people only.
   * Revoke stays admin-only regardless (config/verificationPolicy.ts).
   */
  namedReviewerIds: string[];
  namedReviewerEmails: string[];
}

export const reviewerPolicy: ReviewerPolicy = {
  namedReviewerIds: [],
  namedReviewerEmails: [],
};

/**
 * Whether this person may decide v2 applications. Pure, for tests and routes.
 * Assumes the caller is already an admin or reviewer.
 */
export function mayDecideV2(
  who: { id: string; email?: string | null },
  policy: ReviewerPolicy = reviewerPolicy
): boolean {
  const ids = policy.namedReviewerIds;
  const emails = policy.namedReviewerEmails.map((e) => e.trim().toLowerCase());
  if (ids.length === 0 && emails.length === 0) return true;
  if (ids.includes(who.id)) return true;
  return !!who.email && emails.includes(who.email.trim().toLowerCase());
}

export interface Under18Policy {
  /**
   * TODO(policy, undecided): what happens to a tutor under 18. Stripe Identity
   * can return `under_supported_age`, which today sends the teacher to the
   * manual-verification path ("contact us"). Nothing else is enforced.
   * 'manual' = current behaviour. Other modes are NOT implemented yet.
   */
  mode: 'manual';
}

export const under18Policy: Under18Policy = { mode: 'manual' };

export interface TeacherRestrictions {
  /**
   * TODO(policy, undecided): what an UNVERIFIED or REVOKED teacher may not do.
   * Today verification gates nothing in the product, and nothing reads these
   * flags yet. They exist so the decision has one home. Wiring any of them to a
   * real check is a separate piece of work.
   */
  unverified: { cannotCreateClasses: boolean; cannotReceiveBookings: boolean; cannotReceivePayouts: boolean };
  revoked: { cannotCreateClasses: boolean; cannotReceiveBookings: boolean; cannotReceivePayouts: boolean };
}

export const teacherRestrictions: TeacherRestrictions = {
  unverified: { cannotCreateClasses: false, cannotReceiveBookings: false, cannotReceivePayouts: false },
  revoked: { cannotCreateClasses: false, cannotReceiveBookings: false, cannotReceivePayouts: false },
};
