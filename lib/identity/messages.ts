// Teacher-facing wording for neutral outcomes. Client-safe, no provider names or
// codes anywhere: the screens say what happened, not who decided it.

import type { NotSupportedReason, RetryReason } from './types';

const RETRY: Record<RetryReason, string> = {
  document_expired: 'That document has expired. Please use a valid, in-date document.',
  document_unreadable: 'We could not read that document. Make sure it is well lit, flat and fully in frame.',
  document_invalid: 'We could not verify that document. Make sure it is genuine and the photo page is clear.',
  face_mismatch: 'The selfie did not match the photo on the document. Please try again.',
  liveness_failed: 'We could not confirm you were present. Please try again in good light.',
  selfie_issue: 'The selfie could not be accepted. Please retake it in good light.',
  device_unsupported: 'That device could not be used. Try a phone or a laptop with a camera.',
  abandoned: 'The check was not completed. Please try again and follow every step.',
  unknown: 'We could not verify your identity this time. Please check your document and try again.',
};

const NOT_SUPPORTED: Record<NotSupportedReason, string> = {
  country: 'The automatic check cannot read documents from that country.',
  minor: 'The automatic check could not be completed for your age.',
  document_type: 'The automatic check cannot read that type of document.',
};

export function describeRetryReason(reason: string | null): string {
  return RETRY[(reason as RetryReason) ?? 'unknown'] ?? RETRY.unknown;
}

export function describeNotSupported(reason: string | null): string {
  return NOT_SUPPORTED[(reason as NotSupportedReason) ?? 'document_type'] ?? NOT_SUPPORTED.document_type;
}
