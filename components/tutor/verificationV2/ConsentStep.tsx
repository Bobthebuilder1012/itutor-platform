'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { Card, ErrorBanner, PrimaryButton, STEP_META, readError } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onChange: () => Promise<void>;
  onNext: () => void;
}

export default function ConsentStep({ state, onChange, onNext }: Props) {
  const [checked, setChecked] = useState(!!state.consentAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (state.consentAt) return onNext();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tutor/verification-v2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save your consent'));
      await onChange();
      onNext();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={STEP_META[1].title} subtitle={STEP_META[1].subtitle} state={state.consentAt ? 'complete' : 'incomplete'}>
      <p className="text-sm text-muted-foreground">Here is exactly what happens with your information.</p>

      <ul className="mt-4 space-y-4 text-sm text-ink">
        <li>
          <span className="font-semibold">What we collect.</span> A check of your government ID and a selfie
          (done by our identity check partner), your qualifications (CSEC, CAPE or degree details with proof), and up to three
          optional extras you choose to add.
        </li>
        <li>
          <span className="font-semibold">What is public.</span> Once you are verified, your qualification
          details (subject, grade, year, school, degree) and your extras are shown to students and parents on
          your profile. Your proof files, such as a certificate scan, are seen by our reviewers and, once a credential is approved, by students and parents through short-lived links.
        </li>
        <li>
          <span className="font-semibold">Your ID.</span> Our identity check partner handles your ID and selfie. We never see or
          store the images or your ID number. We keep only a reference to the check and whether it passed.
        </li>
        <li>
          <span className="font-semibold">A copy is kept for a short time.</span> The partner holds the ID data until we ask
          it to delete it after we have made a decision on your application.
        </li>
      </ul>

      <p className="mt-4 text-sm text-muted-foreground">
        Read our{' '}
        <Link href="/privacy" target="_blank" className="font-medium text-brand underline">
          Privacy Policy
        </Link>{' '}
        for more.
      </p>

      <label className="mt-6 flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-brand"
          checked={checked}
          disabled={!!state.consentAt || busy}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>
          I understand the above and agree to an identity check, and to my qualifications and extras being
          shown publicly once I am verified.
        </span>
      </label>

      <div className="mt-6">
        <ErrorBanner message={error} />
        <PrimaryButton onClick={accept} disabled={!checked} busy={busy}>
          {state.consentAt ? 'Continue' : 'I agree, continue'}
        </PrimaryButton>
      </div>
    </Card>
  );
}
