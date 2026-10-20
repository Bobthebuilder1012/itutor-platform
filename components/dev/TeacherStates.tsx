'use client';

// DEV ONLY. Every teacher-facing screen: overall status, the four steps, and
// every neutral identity outcome. Nothing here makes a request.

import { useMemo } from 'react';
import type { IdentityStatus } from '@/lib/verificationV2/constants';
import StatusView from '@/components/tutor/verificationV2/StatusView';
import ConsentStep from '@/components/tutor/verificationV2/ConsentStep';
import IdentityStep from '@/components/tutor/verificationV2/IdentityStep';
import CredentialsStep from '@/components/tutor/verificationV2/CredentialsStep';
import ExtrasStep from '@/components/tutor/verificationV2/ExtrasStep';
import { describeNotSupported, describeRetryReason } from '@/lib/identity/messages';
import type { NotSupportedReason, RetryReason } from '@/lib/identity/types';
import { Cell, Section } from './GalleryParts';
import { CREDENTIALS, EXTRAS, mkState } from './galleryData';

const RETRY_REASONS: RetryReason[] = ['document_expired', 'document_unreadable', 'document_invalid', 'face_mismatch', 'liveness_failed', 'selfie_issue', 'device_unsupported', 'abandoned', 'unknown'];
const NOT_SUPPORTED: NotSupportedReason[] = ['country', 'minor', 'document_type'];
const noop = async () => {};
type IdentityOver = Partial<ReturnType<typeof mkState>['identity']>;

export default function TeacherStates({ onAction }: { onAction: (text: string) => void }) {
  const api = useMemo(
    () => ({
      async start(country: string) {
        onAction(`Start / try again pressed with country "${country}". A real run would send the teacher to the provider.`);
        return { status: 'pending' };
      },
    }),
    [onAction]
  );

  const identityCases: Array<[string, IdentityOver]> = [
    ['not started (no country)', {}],
    ['not started (country chosen)', { country: 'TT' }],
    ['pending (unfinished)', { status: 'pending' as IdentityStatus, country: 'TT', attempts: 1 }],
    ['processing', { status: 'processing' as IdentityStatus, country: 'TT', attempts: 1 }],
    ['verified', { status: 'verified' as IdentityStatus, country: 'TT', attempts: 1 }],
    ['canceled (can retry)', { status: 'canceled' as IdentityStatus, country: 'TT', attempts: 1, canRetry: true }],
    ['canceled (attempts left on another provider)', { status: 'canceled' as IdentityStatus, country: 'TT', attempts: 2, furtherRoute: true }],
    ['retryable_failure (all 3 attempts used: contact support)', { status: 'retryable_failure' as IdentityStatus, reason: 'face_mismatch', country: 'TT', attempts: 3 }],
    ['consent_declined (contact support)', { status: 'consent_declined' as IdentityStatus, country: 'TT', attempts: 1 }],
    ['not_supported, every provider tried (contact support)', { status: 'not_supported' as IdentityStatus, reason: 'country', country: 'GY', attempts: 3 }],
  ];

  return (
    <>
      <Section id="teacher-status" title="Teacher status screens" note="What a teacher sees on /tutor/verification-v2 for each overall status.">
        <Cell label="NOT_STARTED"><StatusView state={mkState({ status: 'NOT_STARTED', consentAt: null })} onBegin={() => onAction('Begin pressed')} /></Cell>
        <Cell label="IN_REVIEW (submitted)"><StatusView state={mkState({ status: 'IN_REVIEW', submittedAt: '2026-10-02T09:00:00.000Z', editable: false })} onBegin={() => {}} /></Cell>
        <Cell label="VERIFIED"><StatusView state={mkState({ status: 'VERIFIED', editable: false })} onBegin={() => {}} /></Cell>
        <Cell label="REJECTED (with reason)"><StatusView state={mkState({ status: 'REJECTED', decisionReason: 'The results slip is cropped. Please upload the full page.' })} onBegin={() => onAction('Update and resubmit pressed')} /></Cell>
        <Cell label="REVERIFICATION_REQUIRED"><StatusView state={mkState({ status: 'REVERIFICATION_REQUIRED' })} onBegin={() => onAction('Start reverification pressed')} /></Cell>
        <Cell label="REVOKED"><StatusView state={mkState({ status: 'REVOKED', editable: false })} onBegin={() => {}} /></Cell>
      </Section>

      <Section id="steps" title="The four steps" note="Progress is saved. Consent, credentials and extras (identity has its own section).">
        <Cell label="1. Consent (not yet accepted)"><ConsentStep state={mkState({ consentAt: null, step: 1 })} onChange={noop} onNext={() => {}} /></Cell>
        <Cell label="1. Consent (accepted)"><ConsentStep state={mkState()} onChange={noop} onNext={() => {}} /></Cell>
        <Cell label="3. Credentials (empty)"><CredentialsStep state={mkState({ step: 3, identity: { status: 'verified' } })} onChange={noop} onBack={() => {}} onNext={() => {}} /></Cell>
        <Cell label="3. Credentials (two added)"><CredentialsStep state={mkState({ step: 3, credentials: CREDENTIALS, identity: { status: 'verified' } })} onChange={noop} onBack={() => {}} onNext={() => {}} /></Cell>
        <Cell label="4. Extras (none)"><ExtrasStep state={mkState({ step: 4, credentials: CREDENTIALS, identity: { status: 'verified' } })} onChange={noop} onBack={() => {}} /></Cell>
        <Cell label="4. Extras (3 of 3, limit reached)"><ExtrasStep state={mkState({ step: 4, credentials: CREDENTIALS, extras: EXTRAS, identity: { status: 'verified' } })} onChange={noop} onBack={() => {}} /></Cell>
      </Section>

      <Section id="identity" title="Identity step: every neutral outcome" note="The screen never names a provider. The same screens appear whichever provider did the check.">
        {identityCases.map(([label, identity]) => (
          <Cell key={label} label={label}>
            <IdentityStep state={mkState({ identity })} onChange={noop} onBack={() => {}} onNext={() => {}} api={api} navigate={(u) => onAction(`Would redirect to ${u}`)} />
          </Cell>
        ))}
        {RETRY_REASONS.map((reason) => (
          <Cell key={`retry-${reason}`} label={`retryable_failure / ${reason}`}>
            <IdentityStep state={mkState({ identity: { status: 'retryable_failure', reason, country: 'TT', attempts: 1, canRetry: true } })} onChange={noop} onBack={() => {}} onNext={() => {}} api={api} />
          </Cell>
        ))}
        {NOT_SUPPORTED.map((reason) => (
          <Cell key={`ns-${reason}`} label={`not_supported / ${reason} (next provider offered automatically)`}>
            <IdentityStep state={mkState({ identity: { status: 'not_supported', reason, country: 'TT', attempts: 1, furtherRoute: true } })} onChange={noop} onBack={() => {}} onNext={() => {}} api={api} />
          </Cell>
        ))}
      </Section>

      <Section id="messages" title="Every teacher-facing identity message" note="No provider names, no raw codes.">
        <Cell label="retryable_failure reasons">
          <ul className="space-y-2 text-sm">{RETRY_REASONS.map((r) => <li key={r}><span className="font-mono text-xs text-gray-500">{r}</span><br />{describeRetryReason(r)}</li>)}</ul>
        </Cell>
        <Cell label="not_supported reasons">
          <ul className="space-y-2 text-sm">{NOT_SUPPORTED.map((r) => <li key={r}><span className="font-mono text-xs text-gray-500">{r}</span><br />{describeNotSupported(r)}</li>)}</ul>
        </Cell>
      </Section>
    </>
  );
}
