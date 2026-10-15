// Verification policy knobs. Edit here; nothing else hardcodes these decisions.
// Used by lib/verification/transitions.ts.

export type VerificationActor = 'tutor' | 'system' | 'reviewer' | 'admin';

export interface VerificationPolicy {
  /**
   * Who may take a teacher from VERIFIED to REVOKED (profile and v2 status).
   * Decided: admin role only. A reviewer who is not an admin cannot revoke.
   * Add 'reviewer' here to widen it; no code change is needed.
   */
  revokeAllowedActors: VerificationActor[];
}

export const verificationPolicy: VerificationPolicy = {
  revokeAllowedActors: ['admin'],
};

// TODO(policy, undecided): how a REVOKED teacher gets back in (reinstatement or
// reverification). Until that is decided REVOKED has no way out through the
// code: every old and new flow is blocked from moving a REVOKED teacher to
// "in review", "not submitted" or "verified". See lib/verification/transitions.ts.
