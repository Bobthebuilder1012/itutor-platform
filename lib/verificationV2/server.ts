// Server-only helpers for the v2 verification routes.
// Every write in v2 goes through getServiceClient(): teachers have no write
// policy on tutor_verification_v2, and a trigger blocks profile status writes
// from anything but the service role.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireTutor } from '@/lib/middleware/tutorAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { isRuleRefusal, setIdentityStatus } from '@/lib/verification/setStatus';
import { identityRouting } from '@/config/identityRouting';
import { normalizeIdentityReason, normalizeIdentityStatus, outcomeToStored } from '@/lib/identity/mapping';
import { getProvider, routeForCountry } from '@/lib/identity/registry';
import { decideNextStep } from '@/lib/identity/routing';
import { isProviderName, type ProviderName } from '@/lib/identity/types';
import {
  type CredentialDto,
  type ExtraDto,
  type IdentityStatus,
  type VerificationV2StateDto,
  type VerificationV2Status,
} from './constants';

export type Db = SupabaseClient<any, 'public', any>;

export interface VerificationRow {
  tutor_id: string;
  status: VerificationV2Status;
  consent_at: string | null;
  consent_version: string | null;
  /** Legacy Stripe column. New code reads identity_provider_session_ref. */
  stripe_identity_session_id: string | null;
  identity_status: IdentityStatus | null;
  /** The NEUTRAL reason (retry reason / not-supported reason), not a provider code. */
  identity_error_code: string | null;
  identity_attempts: number;
  identity_verified_at: string | null;
  /** Legacy Stripe history. New code reads identity_session_refs. */
  identity_session_history: string[] | null;
  identity_provider: ProviderName | null;
  identity_provider_session_ref: string | null;
  identity_session_refs: { provider: ProviderName; ref: string }[] | null;
  identity_providers_tried: ProviderName[] | null;
  identity_country: string | null;
  submitted_at: string | null;
  decision_reason: string | null;
}

const ROW_COLUMNS =
  'tutor_id, status, consent_at, consent_version, stripe_identity_session_id, identity_status, identity_error_code, identity_attempts, identity_verified_at, identity_session_history, identity_provider, identity_provider_session_ref, identity_session_refs, identity_providers_tried, identity_country, submitted_at, decision_reason';

/**
 * Rows written before provider-agnostic identity hold Stripe's status names.
 * Everything downstream of here only ever sees the neutral ones.
 */
function normalizeRow(raw: any): VerificationRow {
  return {
    ...raw,
    identity_status: normalizeIdentityStatus(raw.identity_status),
    identity_error_code: normalizeIdentityReason(raw.identity_status, raw.identity_error_code),
  } as VerificationRow;
}

export function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * Flag, then tutor auth. 404 when the flag is off so the feature is invisible.
 *
 * A REVOKED teacher is refused here (403) for every route except the read-only
 * state route (`allowRevoked`), so no step of the new flow can be used to get
 * back to "in review". The wall is also in lib/verification/transitions.ts.
 */
export async function guardV2(opts: { allowRevoked?: boolean } = {}): Promise<
  | { error: NextResponse; tutorId?: undefined; db?: undefined; revoked?: undefined; profileStatus?: undefined }
  | { error: null; tutorId: string; db: Db; revoked: boolean; profileStatus: string | null }
> {
  if (!isVerificationV2Enabled()) return { error: notFound() };
  const auth = await requireTutor();
  if (auth.error || !auth.user) {
    return { error: auth.error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const revoked = auth.profile?.tutor_verification_status === 'REVOKED';
  if (revoked && !opts.allowRevoked) {
    return {
      error: NextResponse.json(
        { error: 'Your verification was revoked. Please contact support.', code: 'locked_revoked' },
        { status: 403 }
      ),
    };
  }
  return {
    error: null,
    tutorId: auth.user.id,
    db: getServiceClient() as Db,
    revoked,
    profileStatus: auth.profile?.tutor_verification_status ?? null,
  };
}

export async function loadRow(db: Db, tutorId: string): Promise<VerificationRow | null> {
  const { data, error } = await db
    .from('tutor_verification_v2')
    .select(ROW_COLUMNS)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeRow(data) : null;
}

export function isEditable(row: VerificationRow | null): boolean {
  return (
    !row ||
    row.status === 'IN_PROGRESS' ||
    row.status === 'REJECTED' ||
    row.status === 'REVERIFICATION_REQUIRED'
  );
}

/** Step 1 done. */
export function hasConsent(row: VerificationRow | null): boolean {
  return !!row?.consent_at;
}

/** Steps 1 and 2 done. */
export function hasIdentity(row: VerificationRow | null): boolean {
  return hasConsent(row) && row?.identity_status === 'verified';
}

export function blocked(error: string, status = 409, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Asks the teacher's provider where their session stands and stores the result.
 * Used on page load and when the teacher returns from the provider, so the page
 * does not depend on a webhook arriving first. Never throws: if the provider is
 * unreachable the saved status is returned unchanged. Provider-agnostic: it only
 * ever sees neutral outcomes.
 */
export async function refreshIdentity(db: Db, row: VerificationRow): Promise<VerificationRow> {
  const provider: ProviderName | null =
    row.identity_provider ?? (row.stripe_identity_session_id ? 'stripe' : null);
  const ref = row.identity_provider_session_ref ?? row.stripe_identity_session_id;
  const open: Array<IdentityStatus | null> = [null, 'pending', 'processing', 'retryable_failure'];
  if (!provider || !ref || !open.includes(row.identity_status)) return row;
  try {
    const { outcome, providerCode } = await getProvider(provider).getOutcome(ref);
    const stored = outcomeToStored(outcome);
    if (stored.status === row.identity_status && stored.reason === row.identity_error_code) return row;

    // Through the one status function: a passed check is never downgraded and a
    // result for a replaced session is ignored.
    const result = await setIdentityStatus({
      tutorId: row.tutor_id,
      to: stored.status,
      reason: stored.reason,
      providerCode,
      actor: 'system',
      sessionRef: ref,
      provider,
      db,
    });
    if (!result.ok) {
      if (!isRuleRefusal(result) && result.code !== 'stale_session' && result.code !== 'conflict') {
        console.warn('[verification-v2] identity refresh not saved:', result.message);
      }
      return row;
    }
    return { ...row, identity_status: stored.status as IdentityStatus, identity_error_code: stored.reason };
  } catch (err) {
    console.warn('[verification-v2] identity refresh failed:', (err as Error).message);
    return row;
  }
}

export async function loadCredentials(db: Db, tutorId: string): Promise<CredentialDto[]> {
  const { data, error } = await db
    .from('tutor_credentials_v2')
    .select(
      'id, kind, subject, grade, exam_year, school, degree, field, graduation_year, proof_url, proof_path, proof_filename'
    )
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id,
    kind: c.kind,
    subject: c.subject,
    grade: c.grade,
    examYear: c.exam_year,
    school: c.school,
    degree: c.degree,
    field: c.field,
    graduationYear: c.graduation_year,
    proofUrl: c.proof_url,
    proofFilename: c.proof_filename,
    hasProofFile: !!c.proof_path,
  }));
}

export async function loadExtras(db: Db, tutorId: string): Promise<ExtraDto[]> {
  const { data, error } = await db
    .from('tutor_extras_v2')
    .select('id, title, description, link_url')
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    linkUrl: e.link_url,
  }));
}

export function buildState(
  row: VerificationRow | null,
  credentials: CredentialDto[],
  extras: ExtraDto[],
  profileStatus: string | null = null
): VerificationV2StateDto {
  const revokedProfile = profileStatus === 'REVOKED';
  const identityStatus = row?.identity_status ?? null;
  const attempts = row?.identity_attempts ?? 0;
  const currentProvider: ProviderName | null =
    row?.identity_provider && isProviderName(row.identity_provider)
      ? row.identity_provider
      : row?.stripe_identity_session_id
        ? 'stripe'
        : null;

  // What the buttons offer, from the same routing the server uses to act.
  const nextStep = decideNextStep({
    route: routeForCountry(row?.identity_country),
    status: identityStatus,
    current: currentProvider,
    attempts,
    tried: (row?.identity_providers_tried ?? []) as ProviderName[],
  });
  const canRetry = nextStep.action === 'retry_same';
  const furtherRoute = nextStep.action === 'next';

  let step: 1 | 2 | 3 | 4 = 1;
  if (hasConsent(row)) step = 2;
  if (hasIdentity(row)) step = 3;
  if (hasIdentity(row) && credentials.length > 0) step = 4;

  // A teacher whose PROFILE is revoked is revoked here too, whatever the v2
  // row says (or whether it exists), and cannot edit.
  // An admin asked this teacher to verify again (profile status). It shows until
  // they submit, after which the v2 row's own IN_REVIEW takes over.
  const reverify =
    profileStatus === 'REVERIFICATION_REQUIRED' && (!row || row.status !== 'IN_REVIEW');
  const status: VerificationV2StateDto['status'] = revokedProfile
    ? 'REVOKED'
    : reverify
      ? 'REVERIFICATION_REQUIRED'
      : (row?.status ?? 'NOT_STARTED');

  return {
    status,
    consentAt: row?.consent_at ?? null,
    identity: {
      status: identityStatus,
      reason: row?.identity_error_code ?? null,
      country: row?.identity_country ?? null,
      attempts,
      maxAttempts: identityRouting.maxAttemptsPerProvider,
      canRetry,
      furtherRoute,
      countries: identityRouting.countries,
    },
    submittedAt: row?.submitted_at ?? null,
    decisionReason: row?.status === 'REJECTED' ? row.decision_reason : null,
    editable: !revokedProfile && isEditable(row),
    step,
    credentials,
    extras,
  };
}

export async function loadState(
  db: Db,
  tutorId: string,
  profileStatus: string | null = null
): Promise<VerificationV2StateDto> {
  let row = await loadRow(db, tutorId);
  // A revoked teacher's state is read-only: do not call Stripe on their behalf.
  if (row && profileStatus !== 'REVOKED') row = await refreshIdentity(db, row);
  const [credentials, extras] = await Promise.all([
    loadCredentials(db, tutorId),
    loadExtras(db, tutorId),
  ]);
  return buildState(row, credentials, extras, profileStatus);
}
