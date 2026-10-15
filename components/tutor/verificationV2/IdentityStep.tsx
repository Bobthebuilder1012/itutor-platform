'use client';

import { useEffect, useState } from 'react';
import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { describeIdentityError } from '@/lib/verificationV2/identity';
import { Card, ErrorBanner, ManualVerificationNote, PrimaryButton, SecondaryButton, readError } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onChange: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

export default function IdentityStep({ state, onChange, onBack, onNext }: Props) {
  const { identity } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While Stripe is still deciding, check again every few seconds.
  useEffect(() => {
    if (identity.status !== 'processing') return;
    const t = setInterval(() => void onChange(), 4000);
    return () => clearInterval(t);
  }, [identity.status, onChange]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor/verification-v2/identity', { method: 'POST' });
      if (res.ok) {
        const body = await res.json();
        if (body.url) {
          // Stripe's hosted flow. It sends the teacher back to this page.
          window.location.href = body.url;
          return;
        }
        await onChange();
      } else {
        setError(await readError(res, 'Could not start the identity check'));
        await onChange();
      }
    } catch {
      setError('Could not start the identity check');
    } finally {
      setBusy(false);
    }
  }

  const attemptsLeft = Math.max(0, identity.maxAttempts - identity.attempts);

  let body: React.ReactNode;
  if (identity.status === 'verified') {
    body = (
      <>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Your identity has been verified.
        </div>
        <div className="mt-6 flex gap-3">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
          <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
        </div>
      </>
    );
  } else if (identity.manualPath) {
    body = (
      <>
        <ManualVerificationNote
          reason={
            identity.status === 'under_supported_age'
              ? 'We could not complete the automatic check for your age.'
              : 'The identity check was declined.'
          }
        />
        <div className="mt-6">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        </div>
      </>
    );
  } else if (identity.status === 'processing') {
    body = (
      <>
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Stripe is checking your documents. This usually takes a minute. You can leave this page open.
        </div>
        <div className="mt-6">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        </div>
      </>
    );
  } else {
    const failed = identity.status === 'requires_input';
    const cancelled = identity.status === 'canceled';
    const unfinished = identity.status === 'pending';
    // An unfinished 3rd session can still be resumed; only a spent one is final.
    const exhausted = identity.attempts >= identity.maxAttempts && !unfinished;

    body = (
      <>
        {failed && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">We could not verify your identity.</p>
            <p className="mt-1">{describeIdentityError(identity.errorCode)}</p>
          </div>
        )}
        {cancelled && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            That check was cancelled. You can start a new one.
          </div>
        )}
        {unfinished && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You have not finished the check yet. Pick up where you left off.
          </div>
        )}

        {exhausted ? (
          <ManualVerificationNote reason="You have used all identity check attempts." />
        ) : (
          <>
            {!identity.status && (
              <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
                <li>Have your passport, driving licence or ID card ready.</li>
                <li>You will take a photo of it and a quick selfie, on Stripe&apos;s secure page.</li>
                <li>You will come back here automatically when you are done.</li>
              </ul>
            )}
            <ErrorBanner message={error} />
            <PrimaryButton onClick={start} busy={busy}>
              {unfinished ? 'Continue identity check' : failed || cancelled ? 'Try again' : 'Start identity check'}
            </PrimaryButton>
            {(failed || cancelled) && (
              <p className="mt-3 text-xs text-gray-500">
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
    <Card>
      <h2 className="text-xl font-bold">Verify your identity</h2>
      <p className="mb-5 mt-1 text-sm text-gray-600">
        A quick check of your government ID and a selfie, run by Stripe.
      </p>
      {body}
    </Card>
  );
}
