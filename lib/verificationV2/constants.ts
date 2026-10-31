// Shared by the API routes and the browser components. No server-only imports.

export type VerificationV2Status =
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REVOKED'
  | 'REVERIFICATION_REQUIRED';

/** What the page shows. NOT_STARTED means no row exists yet. */
export type VerificationV2FlowStatus = 'NOT_STARTED' | VerificationV2Status;

/**
 * The neutral identity outcomes (lib/identity/types.ts). Nothing here names a
 * provider: the screens and the API describe what happened, not who decided.
 */
export type IdentityStatus =
  | 'pending' // a session exists, the teacher has not finished
  | 'processing'
  | 'verified'
  | 'retryable_failure' // the check failed; `reason` says why; trying again may work
  | 'not_supported' // this route cannot check them (country, minor, document type)
  | 'consent_declined'
  | 'canceled';

export type CredentialKind = 'CSEC' | 'CAPE' | 'DEGREE';

/** Bump when the consent wording changes; stored with the consent timestamp. */
export const CONSENT_VERSION = '2026-10-v1';

/** Client-safe: the screens and the routes both use these. */
export const SETUP_MESSAGE = 'Verification setup is not finished on this environment.';
export const SETUP_CODE = 'setup_not_finished';

export const MAX_IDENTITY_ATTEMPTS = 3;
export const MAX_EXTRAS = 3;
export const MAX_CREDENTIALS = 20;

export const PROOF_BUCKET = 'tutor-credential-proofs';
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
/** Allowed proof MIME types and the extension each is stored under. */
export const PROOF_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};


export interface CredentialDto {
  id: string;
  kind: CredentialKind;
  subject: string | null;
  grade: string | null;
  examYear: number | null;
  school: string | null;
  degree: string | null;
  field: string | null;
  graduationYear: number | null;
  proofUrl: string | null;
  proofFilename: string | null;
  hasProofFile: boolean;
}

export interface ExtraDto {
  id: string;
  title: string;
  description: string;
  linkUrl: string | null;
}

export interface VerificationV2StateDto {
  status: VerificationV2FlowStatus;
  consentAt: string | null;
  identity: {
    status: IdentityStatus | null;
    /** The neutral reason for retryable_failure or not_supported, else null. */
    reason: string | null;
    /** The document country the teacher chose (ISO alpha-2 or OTHER). */
    country: string | null;
    attempts: number;
    maxAttempts: number;
    /** Another attempt on the same route. */
    canRetry: boolean;
    /** Another provider is available if this one cannot check them ("try another way"). */
    furtherRoute: boolean;
    /** What the teacher may pick as their document country. */
    countries: { code: string; label: string }[];
    /** False when no identity provider is configured on this environment. The check cannot be
     *  started, and the other steps are not blocked by it. */
    available: boolean;
  };
  submittedAt: string | null;
  decisionReason: string | null;
  /** A short reference the teacher can quote to support. Not an id; null before an application exists. */
  reference: string | null;
  /** Locked once in review, verified or revoked. */
  editable: boolean;
  /** Furthest step the teacher may be on, computed from saved data. 1..4 */
  step: 1 | 2 | 3 | 4;
  credentials: CredentialDto[];
  extras: ExtraDto[];
}
