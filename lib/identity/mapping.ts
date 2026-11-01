// THE ONE FILE where a provider's own statuses and error codes become our
// neutral outcomes. Add a provider, or learn a new code, here and nowhere else.
//
// Unknown codes are never guessed into a confident outcome: an unknown failure
// is `retryable_failure / unknown` and the raw code is kept (providerCode) so it
// shows up in coverage testing (docs/IDENTITY_COVERAGE_TEST.md).

import type { IdentityOutcome, OutcomeKind, ProviderOutcome, RetryReason, StoredIdentityStatus } from './types';

// ---------------------------------------------------------------
// Stripe Identity
// ---------------------------------------------------------------
// Session status is requires_input | processing | verified | canceled.
// requires_input with no last_error means the teacher has not finished. With a
// last_error, last_error.code says why (Stripe's documented codes).

const STRIPE_RETRY: Record<string, RetryReason> = {
  abandoned: 'abandoned',
  document_expired: 'document_expired',
  document_unverified_other: 'document_invalid',
  selfie_face_mismatch: 'face_mismatch',
  selfie_manipulated: 'selfie_issue',
  selfie_document_missing_photo: 'document_invalid',
  selfie_unverified_other: 'selfie_issue',
  device_not_supported: 'device_unsupported',
};

export function mapStripeSession(s: {
  status: string;
  last_error?: { code?: string | null } | null;
}): ProviderOutcome {
  switch (s.status) {
    case 'verified':
      return { outcome: { kind: 'verified' }, providerCode: null };
    case 'processing':
      return { outcome: { kind: 'processing' }, providerCode: null };
    case 'canceled':
      return { outcome: { kind: 'canceled' }, providerCode: null };
    default: {
      const code = s.last_error?.code ?? null;
      if (!code) return { outcome: { kind: 'pending' }, providerCode: null };
      if (code === 'consent_declined') return { outcome: { kind: 'consent_declined' }, providerCode: code };
      if (code === 'under_supported_age') return { outcome: { kind: 'not_supported', reason: 'minor' }, providerCode: code };
      if (code === 'country_not_supported') return { outcome: { kind: 'not_supported', reason: 'country' }, providerCode: code };
      if (code === 'document_type_not_supported') {
        return { outcome: { kind: 'not_supported', reason: 'document_type' }, providerCode: code };
      }
      return { outcome: { kind: 'retryable_failure', reason: STRIPE_RETRY[code] ?? 'unknown' }, providerCode: code };
    }
  }
}

// ---------------------------------------------------------------
// Didit  (https://docs.didit.me, read 2026-10)
// ---------------------------------------------------------------
// Session statuses (documented): Not Started, In Progress, Approved, Declined,
// In Review, Awaiting User, Resubmitted, Expired, Abandoned, Kyc Expired.
// Warning codes (documented): QR_NOT_DETECTED, DATA_INCONSISTENT,
// IMAGE_TOO_BLURRY, LOW_LIVENESS_SCORE, LOW_FACE_MATCH_SIMILARITY,
// DOCUMENT_EXPIRED.
//
// TODO(didit, NOT DOCUMENTED): Didit's docs do not list a code for "this
// country or document type is not supported", nor a consent-declined signal.
// Until those are confirmed against the sandbox, an unsupported document shows
// up here as retryable_failure/unknown and the raw code is kept in providerCode.
// The ONLY not_supported case implemented is `minor`, from the documented
// `age` field. This is the first thing the coverage test must resolve.

const DIDIT_RETRY: Record<string, RetryReason> = {
  DOCUMENT_EXPIRED: 'document_expired',
  IMAGE_TOO_BLURRY: 'document_unreadable',
  LOW_LIVENESS_SCORE: 'liveness_failed',
  LOW_FACE_MATCH_SIMILARITY: 'face_mismatch',
  DATA_INCONSISTENT: 'document_invalid',
  QR_NOT_DETECTED: 'document_invalid',
};
const DIDIT_RETRY_PRIORITY = [
  'DOCUMENT_EXPIRED',
  'IMAGE_TOO_BLURRY',
  'LOW_LIVENESS_SCORE',
  'LOW_FACE_MATCH_SIMILARITY',
  'DATA_INCONSISTENT',
  'QR_NOT_DETECTED',
];

function diditRisks(decision: any): string[] {
  const out: string[] = [];
  for (const iv of decision?.id_verifications ?? []) {
    for (const w of iv?.warnings ?? []) if (typeof w?.risk === 'string') out.push(w.risk);
  }
  return out;
}

function diditMinorAge(decision: any, minimumAge: number): boolean {
  for (const iv of decision?.id_verifications ?? []) {
    if (typeof iv?.age === 'number' && iv.age < minimumAge) return true;
  }
  return false;
}

/** The name Didit read from the document, or null. Used for the profile-name comparison only. */
function diditDocumentName(decision: any): string | null {
  const v = decision?.id_verifications?.[0];
  if (!v) return null;
  const full = typeof v.full_name === 'string' ? v.full_name.trim() : '';
  if (full) return full;
  const joined = [v.first_name, v.last_name].filter((x: unknown) => typeof x === 'string' && x).join(' ').trim();
  return joined || null;
}

export function mapDiditDecision(decision: any, opts: { minimumAge: number }): ProviderOutcome {
  const withDoc = (o: ProviderOutcome): ProviderOutcome => ({
    ...o,
    documentType: decision?.id_verifications?.[0]?.document_type ?? null,
    documentName: diditDocumentName(decision),
  });
  return withDoc(mapDiditDecisionCore(decision, opts));
}

function mapDiditDecisionCore(decision: any, opts: { minimumAge: number }): ProviderOutcome {
  const status: string = decision?.status ?? '';
  const risks = diditRisks(decision);
  const firstRisk = risks[0] ?? null;

  // Age comes from the document; it overrides Approved/Declined alike.
  if ((status === 'Approved' || status === 'Declined') && diditMinorAge(decision, opts.minimumAge)) {
    return { outcome: { kind: 'not_supported', reason: 'minor' }, providerCode: 'AGE_BELOW_MINIMUM' };
  }

  switch (status) {
    case 'Approved':
      return { outcome: { kind: 'verified' }, providerCode: null };
    case 'Declined': {
      const known = DIDIT_RETRY_PRIORITY.find((c) => risks.includes(c));
      return {
        outcome: { kind: 'retryable_failure', reason: known ? DIDIT_RETRY[known]! : 'unknown' },
        providerCode: known ?? firstRisk,
      };
    }
    case 'In Review':
      return { outcome: { kind: 'processing' }, providerCode: null };
    case 'Abandoned':
      return { outcome: { kind: 'retryable_failure', reason: 'abandoned' }, providerCode: 'ABANDONED' };
    case 'Expired':
    case 'Kyc Expired':
      return { outcome: { kind: 'canceled' }, providerCode: status.toUpperCase().replace(/ /g, '_') };
    // Not Started, In Progress, Awaiting User, Resubmitted, and anything new:
    // the teacher still has something to do. Never guessed into a result.
    default:
      return { outcome: { kind: 'pending' }, providerCode: null };
  }
}

// ---------------------------------------------------------------
// Stored form
// ---------------------------------------------------------------

/** The two columns an outcome is stored in: identity_status and identity_error_code. */
export function outcomeToStored(o: IdentityOutcome): { status: StoredIdentityStatus; reason: string | null } {
  switch (o.kind) {
    case 'retryable_failure':
    case 'not_supported':
      return { status: o.kind, reason: o.reason };
    default:
      return { status: o.kind, reason: null };
  }
}

const KINDS: OutcomeKind[] = ['verified', 'retryable_failure', 'not_supported', 'consent_declined', 'canceled', 'pending', 'processing'];

/**
 * Old rows (written before provider-agnostic identity) use Stripe's names.
 * Everything that reads identity_status goes through this, so the old values
 * keep working and nothing downstream ever sees them.
 */
export function normalizeIdentityStatus(raw: string | null | undefined): StoredIdentityStatus | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 'requires_input') return 'retryable_failure';
  if (raw === 'under_supported_age') return 'not_supported';
  return (KINDS as string[]).includes(raw) ? (raw as StoredIdentityStatus) : null;
}

/** An old row's stored reason for a legacy status (under_supported_age had no reason column value). */
export function normalizeIdentityReason(rawStatus: string | null | undefined, rawReason: string | null | undefined): string | null {
  if (rawStatus === 'under_supported_age') return 'minor';
  if (rawStatus === 'requires_input') {
    return rawReason ? (STRIPE_RETRY[rawReason] ?? 'unknown') : 'unknown';
  }
  return rawReason ?? null;
}

// ---------------------------------------------------------------
// Veriff  (https://devdocs.veriff.com, read 2026-10)
// ---------------------------------------------------------------
// Decision statuses (documented): approved, declined, resubmission_requested,
// review, expired, abandoned. reasonCode is an integer from Veriff's "granular
// reason codes" table; the table says codes depend on each integration's
// configuration, so not every code will appear.
//
// TODO(veriff, unclear): there is NO explicit "country not supported" code (571
// "Unable to identify country" is the closest and is mapped to country here), and
// no liveness-specific code (503/519/526/548 are deceit / injection signals and
// are mapped to liveness_failed as the nearest neutral reason).
// TODO(veriff, unclear): the age codes 530-536 are documented as "under 13" to
// "under 25" with seven codes for ages 13, 14, 16, 18, 20, 21, 25. The code-to-age
// order is inferred. All seven become not_supported/minor so nobody loops on a
// check that cannot pass; confirm in the sandbox.

const VERIFF_AGE_CODES = [530, 531, 532, 533, 534, 535, 536];

const VERIFF_CODE_REASON: Record<number, RetryReason> = {
  // expired document
  511: 'document_expired', 207: 'document_expired', 620: 'document_expired',
  // poor document image
  204: 'document_unreadable', 215: 'document_unreadable', 216: 'document_unreadable',
  // poor selfie / face image
  543: 'selfie_issue', 546: 'selfie_issue', 214: 'selfie_issue', 678: 'selfie_issue',
  208: 'selfie_issue', 202: 'selfie_issue', 606: 'selfie_issue', 641: 'selfie_issue',
  // face does not match the document
  103: 'face_mismatch', 120: 'face_mismatch', 509: 'face_mismatch', 581: 'face_mismatch',
  // deceit / injection / spoofing
  503: 'liveness_failed', 519: 'liveness_failed', 526: 'liveness_failed', 548: 'liveness_failed',
};

const VERIFF_DOCUMENT_TYPE_UNSUPPORTED = [510, 206, 602, 551, 647, 695];

export function mapVeriffDecision(v: {
  status?: string | null;
  reasonCode?: number | null;
  document?: { type?: string | null; country?: string | null } | null;
} | null | undefined): ProviderOutcome {
  const status = v?.status ?? '';
  const code = typeof v?.reasonCode === 'number' ? v.reasonCode : null;
  const providerCode = code !== null ? String(code) : null;
  const documentType = v?.document?.type ?? null;
  const done = (outcome: IdentityOutcome, pc: string | null = providerCode): ProviderOutcome => ({
    outcome,
    providerCode: pc,
    documentType,
  });

  switch (status) {
    case 'approved':
      return done({ kind: 'verified' }, null);
    case 'review':
      return done({ kind: 'processing' }, null);
    case 'expired':
      return done({ kind: 'canceled' }, 'expired');
    case 'abandoned':
      return done({ kind: 'retryable_failure', reason: 'abandoned' }, 'abandoned');
    case 'declined':
    case 'resubmission_requested': {
      if (code !== null && VERIFF_AGE_CODES.includes(code)) return done({ kind: 'not_supported', reason: 'minor' });
      if (code !== null && VERIFF_DOCUMENT_TYPE_UNSUPPORTED.includes(code)) {
        return done({ kind: 'not_supported', reason: 'document_type' });
      }
      if (code === 571) return done({ kind: 'not_supported', reason: 'country' });
      return done({ kind: 'retryable_failure', reason: (code !== null && VERIFF_CODE_REASON[code]) || 'unknown' });
    }
    // Anything else (including a missing status) means the teacher has more to do.
    default:
      return done({ kind: 'pending' }, null);
  }
}
