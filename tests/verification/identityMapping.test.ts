import { describe, expect, it } from 'vitest';
import {
  mapDiditDecision,
  mapStripeSession,
  normalizeIdentityReason,
  normalizeIdentityStatus,
  outcomeToStored,
} from '@/lib/identity/mapping';
import { describeNotSupported, describeRetryReason } from '@/lib/identity/messages';
import type { NotSupportedReason, RetryReason } from '@/lib/identity/types';

describe('Stripe -> neutral outcomes', () => {
  const stripe = (status: string, code?: string | null) => mapStripeSession({ status, last_error: code === undefined ? null : { code } });

  it('maps the session statuses', () => {
    expect(stripe('verified').outcome).toEqual({ kind: 'verified' });
    expect(stripe('processing').outcome).toEqual({ kind: 'processing' });
    expect(stripe('canceled').outcome).toEqual({ kind: 'canceled' });
  });

  it('requires_input with no error means the teacher has not finished: pending, not a failure', () => {
    expect(stripe('requires_input').outcome).toEqual({ kind: 'pending' });
    expect(stripe('requires_input', null).outcome).toEqual({ kind: 'pending' });
  });

  it('consent_declined stays its own outcome', () => {
    expect(stripe('requires_input', 'consent_declined')).toEqual({
      outcome: { kind: 'consent_declined' }, providerCode: 'consent_declined',
    });
  });

  it('not-supported cases: minor, country, document type', () => {
    expect(stripe('requires_input', 'under_supported_age').outcome).toEqual({ kind: 'not_supported', reason: 'minor' });
    expect(stripe('requires_input', 'country_not_supported').outcome).toEqual({ kind: 'not_supported', reason: 'country' });
    expect(stripe('requires_input', 'document_type_not_supported').outcome).toEqual({ kind: 'not_supported', reason: 'document_type' });
  });

  it('retryable failures carry a NEUTRAL reason and keep the raw code separately', () => {
    const table: Array<[string, RetryReason]> = [
      ['document_expired', 'document_expired'],
      ['selfie_face_mismatch', 'face_mismatch'],
      ['selfie_manipulated', 'selfie_issue'],
      ['selfie_unverified_other', 'selfie_issue'],
      ['document_unverified_other', 'document_invalid'],
      ['selfie_document_missing_photo', 'document_invalid'],
      ['device_not_supported', 'device_unsupported'],
      ['abandoned', 'abandoned'],
    ];
    for (const [raw, neutral] of table) {
      expect(stripe('requires_input', raw)).toEqual({ outcome: { kind: 'retryable_failure', reason: neutral }, providerCode: raw });
    }
  });

  it('an unknown code is retryable/unknown, never a confident guess, and the code is kept', () => {
    expect(stripe('requires_input', 'some_new_code_2030')).toEqual({
      outcome: { kind: 'retryable_failure', reason: 'unknown' }, providerCode: 'some_new_code_2030',
    });
  });
});

describe('Didit -> neutral outcomes', () => {
  const opts = { minimumAge: 18 };
  const decision = (status: string, risks: string[] = [], age?: number) => ({
    status,
    id_verifications: [{ status, age, warnings: risks.map((risk) => ({ risk })) }],
  });

  it('Approved is verified', () => {
    expect(mapDiditDecision(decision('Approved'), opts).outcome).toEqual({ kind: 'verified' });
  });

  it('Declined maps each documented warning code to a neutral reason', () => {
    const table: Array<[string, RetryReason]> = [
      ['DOCUMENT_EXPIRED', 'document_expired'],
      ['IMAGE_TOO_BLURRY', 'document_unreadable'],
      ['LOW_LIVENESS_SCORE', 'liveness_failed'],
      ['LOW_FACE_MATCH_SIMILARITY', 'face_mismatch'],
      ['DATA_INCONSISTENT', 'document_invalid'],
      ['QR_NOT_DETECTED', 'document_invalid'],
    ];
    for (const [raw, neutral] of table) {
      expect(mapDiditDecision(decision('Declined', [raw]), opts)).toEqual({
        outcome: { kind: 'retryable_failure', reason: neutral }, providerCode: raw,
      });
    }
  });

  it('with several warnings the most actionable one wins, deterministically', () => {
    const r = mapDiditDecision(decision('Declined', ['LOW_FACE_MATCH_SIMILARITY', 'DOCUMENT_EXPIRED']), opts);
    expect(r.outcome).toEqual({ kind: 'retryable_failure', reason: 'document_expired' });
  });

  it('an undocumented decline reason is retryable/unknown with the raw code kept (the coverage test must resolve it)', () => {
    expect(mapDiditDecision(decision('Declined', ['SOME_UNLISTED_RISK']), opts)).toEqual({
      outcome: { kind: 'retryable_failure', reason: 'unknown' }, providerCode: 'SOME_UNLISTED_RISK',
    });
    expect(mapDiditDecision(decision('Declined'), opts).outcome).toEqual({ kind: 'retryable_failure', reason: 'unknown' });
  });

  it('a document age below the minimum is not_supported/minor, even if Didit approved', () => {
    expect(mapDiditDecision(decision('Approved', [], 16), opts).outcome).toEqual({ kind: 'not_supported', reason: 'minor' });
    expect(mapDiditDecision(decision('Declined', ['IMAGE_TOO_BLURRY'], 17), opts).outcome).toEqual({ kind: 'not_supported', reason: 'minor' });
    expect(mapDiditDecision(decision('Approved', [], 18), opts).outcome).toEqual({ kind: 'verified' });
  });

  it('the minimum age is config, not hardcoded', () => {
    expect(mapDiditDecision(decision('Approved', [], 20), { minimumAge: 21 }).outcome).toEqual({ kind: 'not_supported', reason: 'minor' });
  });

  it('session statuses', () => {
    expect(mapDiditDecision({ status: 'In Review' }, opts).outcome).toEqual({ kind: 'processing' });
    expect(mapDiditDecision({ status: 'Abandoned' }, opts).outcome).toEqual({ kind: 'retryable_failure', reason: 'abandoned' });
    expect(mapDiditDecision({ status: 'Expired' }, opts).outcome).toEqual({ kind: 'canceled' });
    expect(mapDiditDecision({ status: 'Kyc Expired' }, opts).outcome).toEqual({ kind: 'canceled' });
    for (const s of ['Not Started', 'In Progress', 'Awaiting User', 'Resubmitted', 'SomethingNew']) {
      expect(mapDiditDecision({ status: s }, opts).outcome).toEqual({ kind: 'pending' });
    }
  });

  it('never produces consent_declined (Didit documents no such signal; TODO in mapping.ts)', () => {
    for (const s of ['Approved', 'Declined', 'Abandoned', 'Expired', 'In Review']) {
      expect(mapDiditDecision(decision(s), opts).outcome.kind).not.toBe('consent_declined');
    }
  });

  it('tolerates a malformed decision', () => {
    expect(mapDiditDecision(null, opts).outcome).toEqual({ kind: 'pending' });
    expect(mapDiditDecision({}, opts).outcome).toEqual({ kind: 'pending' });
    expect(mapDiditDecision({ status: 'Declined', id_verifications: [{ warnings: [{}, null] }] }, opts).outcome.kind).toBe('retryable_failure');
  });
});

describe('stored form', () => {
  it('writes the status and the neutral reason', () => {
    expect(outcomeToStored({ kind: 'verified' })).toEqual({ status: 'verified', reason: null });
    expect(outcomeToStored({ kind: 'retryable_failure', reason: 'face_mismatch' })).toEqual({ status: 'retryable_failure', reason: 'face_mismatch' });
    expect(outcomeToStored({ kind: 'not_supported', reason: 'country' })).toEqual({ status: 'not_supported', reason: 'country' });
    expect(outcomeToStored({ kind: 'consent_declined' })).toEqual({ status: 'consent_declined', reason: null });
  });

  it('reads old Stripe-named rows as neutral', () => {
    expect(normalizeIdentityStatus('requires_input')).toBe('retryable_failure');
    expect(normalizeIdentityStatus('under_supported_age')).toBe('not_supported');
    expect(normalizeIdentityStatus('verified')).toBe('verified');
    expect(normalizeIdentityStatus(null)).toBeNull();
    expect(normalizeIdentityStatus('garbage')).toBeNull();
    expect(normalizeIdentityReason('under_supported_age', null)).toBe('minor');
    expect(normalizeIdentityReason('requires_input', 'selfie_face_mismatch')).toBe('face_mismatch');
    expect(normalizeIdentityReason('requires_input', 'weird')).toBe('unknown');
    expect(normalizeIdentityReason('retryable_failure', 'document_expired')).toBe('document_expired');
  });
});

describe('teacher-facing wording', () => {
  const retry: RetryReason[] = ['document_expired', 'document_unreadable', 'document_invalid', 'face_mismatch', 'liveness_failed', 'selfie_issue', 'device_unsupported', 'abandoned', 'unknown'];
  const unsupported: NotSupportedReason[] = ['country', 'minor', 'document_type'];

  it('every neutral reason has a message, and none names a provider or a raw code', () => {
    const all = [...retry.map((r) => describeRetryReason(r)), ...unsupported.map((r) => describeNotSupported(r))];
    for (const text of all) {
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/stripe|didit|veriff|_|requires_input/i);
    }
    expect(new Set(retry.map((r) => describeRetryReason(r))).size).toBe(retry.length);
  });

  it('an unknown reason falls back safely', () => {
    expect(describeRetryReason('nonsense')).toBe(describeRetryReason('unknown'));
    expect(describeRetryReason(null)).toBe(describeRetryReason('unknown'));
    expect(describeNotSupported(null).length).toBeGreaterThan(10);
  });
});
