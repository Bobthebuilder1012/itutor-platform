// Provider-agnostic identity verification: the neutral vocabulary and the one
// interface every provider implements.
//
// THE RULE: the rest of the system (status transitions, the database, the API
// and every screen) speaks ONLY the neutral outcomes below. Nothing outside
// lib/identity/providers/* and lib/identity/mapping.ts knows a provider's own
// status or error codes. Switching or adding a provider is a change inside
// lib/identity/ plus config/identityRouting.ts, not a rewrite of the flow.

export type ProviderName = 'stripe' | 'didit' | 'veriff';

export const PROVIDER_NAMES: ProviderName[] = ['stripe', 'didit', 'veriff'];

/** Why a failed check may be tried again. Neutral: no provider's own codes. */
export type RetryReason =
  | 'document_expired'
  | 'document_unreadable'
  | 'document_invalid'
  | 'face_mismatch'
  | 'liveness_failed'
  | 'selfie_issue'
  | 'device_unsupported'
  | 'abandoned'
  | 'unknown';

/** Why this provider cannot check this person. Another route may be able to. */
export type NotSupportedReason = 'country' | 'minor' | 'document_type';

/**
 * What a provider decided. The first five are the outcomes of a finished
 * attempt; `pending` and `processing` are the in-flight states before one.
 */
export type IdentityOutcome =
  | { kind: 'verified' }
  | { kind: 'retryable_failure'; reason: RetryReason }
  | { kind: 'not_supported'; reason: NotSupportedReason }
  | { kind: 'consent_declined' }
  | { kind: 'canceled' }
  | { kind: 'pending' }
  | { kind: 'processing' };

export type OutcomeKind = IdentityOutcome['kind'];

/** What is stored in tutor_verification_v2.identity_status. */
export type StoredIdentityStatus = OutcomeKind;

/** An outcome plus the provider's own raw code, kept for coverage testing only. */
export interface ProviderOutcome {
  outcome: IdentityOutcome;
  /** The provider's raw reason code, if any. Never shown to users, never branched on. */
  providerCode: string | null;
  /** The hosted page, when the session is still open and the provider can give it back. */
  resumeUrl?: string | null;
  /** The document type the provider reports (passport, ID card, driver's licence). A label only. */
  documentType?: string | null;
}

export interface CreateSessionInput {
  tutorId: string;
  /** 1-based attempt number for THIS provider. */
  attempt: number;
  returnUrl: string;
  /** ISO 3166-1 alpha-2 country of the document the teacher chose, if any. */
  country?: string | null;
}

export interface CreatedSession {
  /** The provider's own reference for this session. A reference, not a secret. */
  sessionRef: string;
  /** Where to send the teacher: the provider's hosted verification page. */
  url: string;
}

export interface ProviderWebhookEvent {
  /** Unique per delivery, for idempotency. */
  eventId: string;
  sessionRef: string | null;
  tutorId: string | null;
  /** True when this event is not one we act on (the handler acknowledges it). */
  ignore: boolean;
  /**
   * The outcome carried by the signed payload, or null when the payload is not
   * authoritative and the handler must call getOutcome(sessionRef) instead.
   */
  outcome: ProviderOutcome | null;
  livemode: boolean | null;
}

export type RedactResult = { ok: true } | { ok: false; error: string };

export type RedactReason = 'decision' | 'account_deletion';

export interface IdentityProvider {
  readonly name: ProviderName;
  /** Credentials present, so this provider can be offered. An unconfigured provider is skipped. */
  isConfigured(): boolean;
  /** The webhook signing secret is set. false for a provider with no webhooks. */
  webhookConfigured(): boolean;
  createSession(input: CreateSessionInput): Promise<CreatedSession>;
  /**
   * Verifies the provider's signature over the RAW body and parses the event.
   * Throws WebhookSignatureError when verification fails.
   */
  verifyWebhook(rawBody: string, headers: HeaderReader): Promise<ProviderWebhookEvent>;
  /** Asks the provider for the authoritative current outcome of a session. */
  getOutcome(sessionRef: string): Promise<ProviderOutcome>;
  /** Removes what the provider holds for this session. Idempotent; never throws. */
  redact(sessionRef: string, reason: RedactReason): Promise<RedactResult>;
  /** Optional: close an unfinished session so it cannot be reopened. Never throws. */
  cancelSession?(sessionRef: string): Promise<void>;
}

export interface HeaderReader {
  get(name: string): string | null;
}

export class WebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class WebhookNotSupportedError extends Error {
  constructor(message = 'This provider has no webhooks') {
    super(message);
    this.name = 'WebhookNotSupportedError';
  }
}

export function isProviderName(v: unknown): v is ProviderName {
  return typeof v === 'string' && (PROVIDER_NAMES as string[]).includes(v);
}
