// One definition of "this teacher is verified", for every display check and
// query filter.
//
// WHY THIS EXISTS: profiles.tutor_verification_status is stored UPPERCASE
// ('VERIFIED', CHECK constraint in migration 024). Four places compared it to
// lowercase 'verified', which can never match, so the public profile badge, the
// class-card badge, the finder's verified score and the "verified only" search
// filter all silently did nothing. Use this, never a string literal.

export const VERIFIED_STATUS = 'VERIFIED' as const;

/**
 * True when the stored status means verified. Tolerates case and stray
 * whitespace so a differently-cased value cannot silently read as unverified.
 * Anything else (null, undefined, 'PENDING', 'REVOKED', ...) is false.
 */
export function isTutorVerified(status: unknown): boolean {
  return typeof status === 'string' && status.trim().toUpperCase() === VERIFIED_STATUS;
}
