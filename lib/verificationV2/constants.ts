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

export type IdentityStatus =
  | 'pending' // session exists, teacher has not finished the hosted flow
  | 'processing'
  | 'verified'
  | 'requires_input' // Stripe could not verify; errorCode says why
  | 'canceled'
  | 'consent_declined' // manual path
  | 'under_supported_age'; // manual path

export type CredentialKind = 'CSEC' | 'CAPE' | 'DEGREE';

/** Bump when the consent wording changes; stored with the consent timestamp. */
export const CONSENT_VERSION = '2026-10-v1';

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

export const MANUAL_IDENTITY_STATUSES: IdentityStatus[] = [
  'consent_declined',
  'under_supported_age',
];

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
    errorCode: string | null;
    attempts: number;
    maxAttempts: number;
    canRetry: boolean;
    manualPath: boolean;
  };
  submittedAt: string | null;
  decisionReason: string | null;
  /** Locked once in review, verified or revoked. */
  editable: boolean;
  /** Furthest step the teacher may be on, computed from saved data. 1..4 */
  step: 1 | 2 | 3 | 4;
  credentials: CredentialDto[];
  extras: ExtraDto[];
}
