// How long verification files and Stripe ID data are kept. CONFIG, not code.
// The numbers are PLACEHOLDERS: the retention period is an open policy decision.

export interface RetentionPolicy {
  /**
   * TODO(policy, undecided): days to keep proof files after a REJECTION and after
   * a REVOCATION before they are deleted. 0 = delete as soon as the decision is
   * made. The delete itself is lib/verificationV2/fileDeletion.ts; the sweep that
   * applies this period is lib/verificationV2/cleanup.ts (not scheduled).
   */
  rejectedDays: number;
  revokedDays: number;
  /**
   * Redact the Stripe Identity session once a decision is made, so Stripe stops
   * holding the ID images. Matches the consent text ("until we redact it after a
   * decision"). Set false to disable without removing code.
   */
  redactStripeSessionAfterDecision: boolean;
  /**
   * Account deletion always deletes verification files and redacts the Stripe
   * session immediately. There is deliberately no retention period for that.
   */
}

export const retentionPolicy: RetentionPolicy = {
  rejectedDays: 30,
  revokedDays: 30,
  redactStripeSessionAfterDecision: true,
};
