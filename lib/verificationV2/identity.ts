// Pure helpers for Stripe Identity results. Safe to import from the browser:
// the Stripe import is type-only and erased at build time.

import type Stripe from 'stripe';
import type { IdentityStatus } from './constants';

/**
 * Collapses a Stripe VerificationSession into the one result status we store.
 *
 * Stripe's own `status` is requires_input | processing | verified | canceled.
 * "requires_input" covers two different situations, told apart by last_error:
 *   - no last_error: the teacher has not finished (or closed the window), so the
 *     same session can still be opened. We call that 'pending'.
 *   - last_error set: Stripe tried and could not verify. consent_declined and
 *     under_supported_age have no retry (manual path); the rest allow a retry.
 */
export function mapIdentitySession(
  s: Pick<Stripe.Identity.VerificationSession, 'status' | 'last_error'>
): { status: IdentityStatus; errorCode: string | null } {
  switch (s.status) {
    case 'verified':
      return { status: 'verified', errorCode: null };
    case 'processing':
      return { status: 'processing', errorCode: null };
    case 'canceled':
      return { status: 'canceled', errorCode: null };
    default: {
      const code = s.last_error?.code ?? null;
      if (code === 'consent_declined') {
        return { status: 'consent_declined', errorCode: code };
      }
      if (code === 'under_supported_age') {
        return { status: 'under_supported_age', errorCode: code };
      }
      if (code) return { status: 'requires_input', errorCode: code };
      return { status: 'pending', errorCode: null };
    }
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  abandoned: 'The check was not completed. Please try again and follow every step.',
  document_expired: 'That document has expired. Please use a valid, in-date document.',
  document_type_not_supported:
    'That type of document is not supported. Use a passport, driving licence or ID card.',
  document_unverified_other:
    'We could not verify that document. Make sure it is genuine, well lit and fully in frame.',
  country_not_supported: 'Documents from that country are not supported.',
  device_not_supported: 'That device could not be used. Try a phone or a laptop with a camera.',
  selfie_face_mismatch: 'The selfie did not match the photo on the document. Please try again.',
  selfie_manipulated: 'The selfie could not be accepted. Please retake it in good light.',
  selfie_document_missing_photo: 'The document has no photo we could compare. Try a different document.',
  selfie_unverified_other: 'We could not verify the selfie. Please retake it in good light.',
};

/** Friendly text for a Stripe last_error.code. Never shows a raw code. */
export function describeIdentityError(code: string | null): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return 'We could not verify your identity this time. Please check your document and try again.';
}
