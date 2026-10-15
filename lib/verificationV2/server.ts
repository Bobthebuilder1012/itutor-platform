// Server-only helpers for the v2 verification routes.
// Every write in v2 goes through getServiceClient(): teachers have no write
// policy on tutor_verification_v2, and a trigger blocks profile status writes
// from anything but the service role.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireTutor } from '@/lib/middleware/tutorAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { mapIdentitySession } from './identity';
import { isRuleRefusal, setIdentityStatus } from '@/lib/verification/setStatus';
import {
  MANUAL_IDENTITY_STATUSES,
  MAX_IDENTITY_ATTEMPTS,
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
  stripe_identity_session_id: string | null;
  identity_status: IdentityStatus | null;
  identity_error_code: string | null;
  identity_attempts: number;
  identity_verified_at: string | null;
  identity_session_history: string[] | null;
  submitted_at: string | null;
  decision_reason: string | null;
}

const ROW_COLUMNS =
  'tutor_id, status, consent_at, consent_version, stripe_identity_session_id, identity_status, identity_error_code, identity_attempts, identity_verified_at, identity_session_history, submitted_at, decision_reason';

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
  return (data as VerificationRow | null) ?? null;
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
 * Asks Stripe where a session stands and stores the result. Used on page load
 * and when the teacher returns from Stripe, so the page does not depend on the
 * webhook arriving first. Never throws: if Stripe is unreachable the saved
 * status is returned unchanged.
 */
export async function refreshIdentityFromStripe(
  db: Db,
  row: VerificationRow
): Promise<VerificationRow> {
  const sessionId = row.stripe_identity_session_id;
  const open: Array<IdentityStatus | null> = [null, 'pending', 'processing', 'requires_input'];
  if (!sessionId || !open.includes(row.identity_status)) return row;
  try {
    const session = await getStripeClient().identity.verificationSessions.retrieve(sessionId);
    const mapped = mapIdentitySession(session);
    if (mapped.status === row.identity_status && mapped.errorCode === row.identity_error_code) {
      return row;
    }
    // Through the one status function: a passed check is never downgraded and a
    // result for a replaced session is ignored.
    const result = await setIdentityStatus({
      tutorId: row.tutor_id,
      to: mapped.status,
      errorCode: mapped.errorCode,
      actor: 'system',
      sessionId,
      db,
    });
    if (!result.ok) {
      // Refusals (stale session, a rule) mean the stored value stands.
      if (!isRuleRefusal(result) && result.code !== 'stale_session' && result.code !== 'conflict') {
        console.warn('[verification-v2] identity refresh not saved:', result.message);
      }
      return row;
    }
    return {
      ...row,
      identity_status: mapped.status as IdentityStatus,
      identity_error_code: mapped.errorCode,
      identity_verified_at:
        mapped.status === 'verified' ? new Date().toISOString() : row.identity_verified_at,
    };
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
  const manualPath = !!identityStatus && MANUAL_IDENTITY_STATUSES.includes(identityStatus);

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
      errorCode: row?.identity_error_code ?? null,
      attempts,
      maxAttempts: MAX_IDENTITY_ATTEMPTS,
      canRetry:
        !manualPath &&
        identityStatus !== 'verified' &&
        identityStatus !== 'processing' &&
        attempts < MAX_IDENTITY_ATTEMPTS,
      manualPath,
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
  if (row && profileStatus !== 'REVOKED') row = await refreshIdentityFromStripe(db, row);
  const [credentials, extras] = await Promise.all([
    loadCredentials(db, tutorId),
    loadExtras(db, tutorId),
  ]);
  return buildState(row, credentials, extras, profileStatus);
}
