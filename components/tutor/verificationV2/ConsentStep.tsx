'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { Card, ErrorBanner, PrimaryButton, readError } from './ui';

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
    <Card>
      <h2 className="text-xl font-bold">Before we start</h2>
      <p className="mt-1 text-sm text-gray-600">Here is exactly what happens with your information.</p>

      <ul className="mt-5 space-y-4 text-sm text-gray-800">
        <li>
          <span className="font-semibold">What we collect.</span> A check of your government ID and a selfie
          (done by Stripe), your qualifications (CSEC, CAPE or degree details with proof), and up to three
          optional extras you choose to add.
        </li>
        <li>
          <span className="font-semibold">What is public.</span> Once you are verified, your qualification
          details (subject, grade, year, school, degree) and your extras are shown to students and parents on
          your profile. Proof files are seen only by our reviewers.
        </li>
        <li>
          <span className="font-semibold">Your ID.</span> Stripe handles your ID and selfie. We never see or
          store the images or your ID number. We keep only a reference to the check and whether it passed.
        </li>
        <li>
          <span className="font-semibold">Stripe keeps a copy.</span> Stripe holds the ID data until we ask it
          to redact it after we have made a decision on your application.
        </li>
      </ul>

      <p className="mt-4 text-sm text-gray-600">
        Read our{' '}
        <Link href="/privacy" target="_blank" className="font-medium text-[#199356] underline">
          Privacy Policy
        </Link>{' '}
        for more.
      </p>

      <label className="mt-6 flex items-start gap-3 text-sm text-gray-900">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#199356]"
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
