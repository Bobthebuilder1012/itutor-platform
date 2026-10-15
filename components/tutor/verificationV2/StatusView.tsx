'use client';

import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { Card, PrimaryButton, SUPPORT_EMAIL } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onBegin: () => void;
}

function fmt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function StatusView({ state, onBegin }: Props) {
  const submitted = fmt(state.submittedAt);

  switch (state.status) {
    case 'NOT_STARTED':
      return (
        <Card>
          <h2 className="text-xl font-bold">Get verified</h2>
          <p className="mt-2 text-sm text-gray-600">
            Verify your identity and qualifications so students and parents can trust your profile. It takes
            about five minutes.
          </p>
          <div className="mt-5">
            <PrimaryButton onClick={onBegin}>Begin</PrimaryButton>
          </div>
        </Card>
      );

    case 'IN_REVIEW':
      return (
        <Card className="border-yellow-200 bg-yellow-50">
          <h2 className="text-xl font-bold text-yellow-900">Submitted, in review</h2>
          <p className="mt-2 text-sm text-yellow-900">
            Our team is reviewing your application{submitted ? ` (submitted ${submitted})` : ''}. You cannot
            change it while it is being reviewed.
          </p>
        </Card>
      );

    case 'VERIFIED':
      return (
        <Card className="border-green-200 bg-green-50">
          <h2 className="text-xl font-bold text-green-900">Verified</h2>
          <p className="mt-2 text-sm text-green-900">Your application has been approved.</p>
        </Card>
      );

    case 'REJECTED':
      return (
        <Card className="border-red-200 bg-red-50">
          <h2 className="text-xl font-bold text-red-900">Not approved</h2>
          {state.decisionReason && (
            <div className="mt-3 rounded-lg border border-red-200 bg-white p-4 text-sm text-red-900">
              <p className="font-semibold">Reason</p>
              <p className="mt-1">{state.decisionReason}</p>
            </div>
          )}
          <p className="mt-3 text-sm text-red-900">You can fix the issues and submit again.</p>
          <div className="mt-5">
            <PrimaryButton onClick={onBegin}>Update and resubmit</PrimaryButton>
          </div>
        </Card>
      );

    case 'REVERIFICATION_REQUIRED':
      return (
        <Card className="border-blue-200 bg-blue-50">
          <h2 className="text-xl font-bold text-blue-900">Please verify again</h2>
          <p className="mt-2 text-sm text-blue-900">
            We have asked you to verify again. This is not a rejection. Check your details, add anything
            that is missing and submit for review.
          </p>
          <div className="mt-5">
            <PrimaryButton onClick={onBegin}>Start reverification</PrimaryButton>
          </div>
        </Card>
      );

    case 'REVOKED':
      return (
        <Card className="border-red-200 bg-red-50">
          <h2 className="text-xl font-bold text-red-900">Verification revoked</h2>
          <p className="mt-2 text-sm text-red-900">
            Your verified status has been removed. Please contact us at{' '}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{' '}
            to find out why and what to do next.
          </p>
        </Card>
      );

    default:
      // IN_PROGRESS is shown as the wizard, never here.
      return null;
  }
}
