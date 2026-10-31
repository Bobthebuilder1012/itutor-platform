'use client';

import { useEffect, useState } from 'react';
import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { describeNotSupported, describeRetryReason } from '@/lib/identity/messages';
import { Card, ErrorBanner, Notice, PrimaryButton, SecondaryButton, STEP_META, SupportNote, inputClass, readError } from './ui';

export interface IdentityApi {
  /** Starts, continues or falls back. Resolves with where to send the teacher, or an error. */
  start(country: string): Promise<{ url?: string; status?: string; error?: string }>;
}

const defaultApi: IdentityApi = {
  async start(country) {
    const res = await fetch('/api/tutor/verification-v2/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country }),
    });
    if (res.ok) return res.json();
    return { error: await readError(res, 'Could not start the identity check') };
  },
};

interface Props {
  state: VerificationV2StateDto;
  onChange: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
  /** Replaced in the dev states gallery so no request is made. */
  api?: IdentityApi;
  /** The gallery sets this so "go to the provider" does not leave the page. */
  navigate?: (url: string) => void;
}

/**
 * The identity step. It speaks only NEUTRAL outcomes (verified, retryable_failure,
 * not_supported, consent_declined, canceled): no provider is named anywhere, so
 * switching providers changes nothing on this screen.
 */
export default function IdentityStep({ state, onChange, onBack, onNext, api = defaultApi, navigate }: Props) {
  const { identity } = state;
  const [country, setCountry] = useState<string>(identity.country ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While the provider is still deciding, check again every few seconds.
  useEffect(() => {
    if (identity.status !== 'processing') return;
    const t = setInterval(() => void onChange(), 4000);
    return () => clearInterval(t);
  }, [identity.status, onChange]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const body = await api.start(country);
      if (body.url) {
        // The provider's hosted flow. It sends the teacher back to this page.
        if (navigate) navigate(body.url);
        else window.location.href = body.url;
        return;
      }
      if (body.error) setError(body.error);
      await onChange();
    } catch {
      setError('Could not start the identity check');
    } finally {
      setBusy(false);
    }
  }

  const countrySelect = (
    <div className="mb-4">
      <label htmlFor="id-country" className="mb-1 block text-sm font-medium text-ink">
        Which country is your ID document from?
      </label>
      <select
        id="id-country"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className={inputClass}
      >
        <option value="">Choose a country</option>
        {identity.countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );

  const attemptsLeft = Math.max(0, identity.maxAttempts - identity.attempts);
  const status = identity.status;
  let body: React.ReactNode;

  if (status !== 'verified' && identity.available === false) {
    body = (
      <>
        <Notice>
          <p className="font-semibold">Identity check is not available yet.</p>
          <p className="mt-1">
            We are setting it up. You can add your qualifications and send your application now. We will ask you to do
            the identity check as soon as it is ready.
          </p>
        </Notice>
        <div className="mt-6 flex flex-wrap gap-3">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
          <PrimaryButton onClick={onNext}>Continue to qualifications</PrimaryButton>
        </div>
      </>
    );
  } else if (status === 'verified') {
    body = (
      <>
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm text-ink">
          Your identity has been verified.
        </div>
        <div className="mt-6 flex gap-3">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
          <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
        </div>
      </>
    );
  } else if (status === 'processing') {
    body = (
      <>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-4 text-sm text-ink">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          We are checking your documents. This usually takes a minute. You can leave this page open.
        </div>
        <div className="mt-6">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        </div>
      </>
    );
  } else if (status === 'consent_declined') {
    body = (
      <>
        <SupportNote reason="The identity check was declined." />
        <div className="mt-6">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        </div>
      </>
    );
  } else {
    const failed = status === 'retryable_failure';
    const cancelled = status === 'canceled';
    const unsupported = status === 'not_supported';
    const unfinished = status === 'pending';
    const nothingLeft = (failed || cancelled || unsupported) && !identity.canRetry && !identity.furtherRoute;

    body = (
      <>
        {failed && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">We could not verify your identity.</p>
            <p className="mt-1">{describeRetryReason(identity.reason)}</p>
          </div>
        )}
        {unsupported && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{describeNotSupported(identity.reason)}</p>
            {identity.furtherRoute && <p className="mt-1">We can try another way to check it.</p>}
          </div>
        )}
        {cancelled && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            That check was cancelled. You can start a new one.
          </div>
        )}
        {unfinished && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You have not finished the check yet. Pick up where you left off.
          </div>
        )}

        {nothingLeft ? (
          <SupportNote
            reason={
              unsupported
                ? 'We cannot check this document automatically.'
                : 'You have used all identity check attempts.'
            }
          />
        ) : (
          <>
            {!status && (
              <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-ink">
                <li>Have your passport, driving licence or ID card ready.</li>
                <li>You will take a photo of it and a quick selfie, on a secure page.</li>
                <li>You will come back here automatically when you are done.</li>
              </ul>
            )}
            {countrySelect}
            <ErrorBanner message={error} />
            <PrimaryButton onClick={start} busy={busy} disabled={!country}>
              {unsupported || (failed && !identity.canRetry && identity.furtherRoute)
                ? 'Try another way'
                : unfinished
                  ? 'Continue identity check'
                  : failed || cancelled
                    ? 'Try again'
                    : 'Start identity check'}
            </PrimaryButton>
            {(failed || cancelled) && identity.canRetry && (
              <p className="mt-3 text-xs text-muted-foreground">
                {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} left.
              </p>
            )}
          </>
        )}
        <div className="mt-6">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        </div>
      </>
    );
  }

  return (
    <Card title={STEP_META[2].title} subtitle={STEP_META[2].subtitle} state={status === 'verified' ? 'complete' : 'incomplete'}>
      {body}
    </Card>
  );
}
