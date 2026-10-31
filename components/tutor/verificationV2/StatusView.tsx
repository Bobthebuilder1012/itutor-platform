'use client';

import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { Card, PrimaryButton, SUPPORT_EMAIL } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onBegin: () => void;
}

/** DD Mon YYYY, the site's date format. */
function fmt(iso: string | Date | null): string | null {
  if (!iso) return null;
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** The date we aim to have decided by: 14 days after submission. A date, never a countdown. */
export function expectedBy(submittedAt: string | null): string | null {
  if (!submittedAt) return null;
  const d = new Date(submittedAt);
  if (Number.isNaN(d.getTime())) return null;
  return fmt(new Date(d.getTime() + 14 * 86_400_000));
}

function SupportLink({ subject, children }: { subject: string; children: React.ReactNode }) {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`}
      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:bg-muted"
    >
      {children}
    </a>
  );
}

export default function StatusView({ state, onBegin }: Props) {
  const submitted = fmt(state.submittedAt);
  const by = expectedBy(state.submittedAt);
  const ref = state.reference;

  switch (state.status) {
    case 'NOT_STARTED':
      return (
        <Card>
          <h2 className="font-semibold text-ink">Get verified</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It takes three steps: read and agree to how your information is used, check your identity, and add
            your qualifications. It takes about five minutes.
          </p>
          <div className="mt-4">
            <PrimaryButton onClick={onBegin}>Begin</PrimaryButton>
          </div>
        </Card>
      );

    case 'IN_REVIEW':
      return (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="font-semibold text-ink">Submitted, in review</h2>
          <p className="mt-1 text-sm text-ink">
            Our team is reviewing your application{submitted ? ` (submitted ${submitted})` : ''}.
            {by ? ` We aim to decide by ${by}.` : ''} You cannot change it while it is being reviewed, and this page
            updates by itself when there is a decision.
          </p>
        </Card>
      );

    case 'VERIFIED':
      return (
        <Card className="border-brand/30 bg-brand/5">
          <h2 className="font-semibold text-ink">Verified</h2>
          <p className="mt-1 text-sm text-ink">Your application has been approved. Your Verified badge now shows on your profile.</p>
        </Card>
      );

    case 'REJECTED':
      return (
        <Card className="border-red-200 bg-red-50">
          <h2 className="font-semibold text-ink">Not approved</h2>
          {state.decisionReason && (
            <div className="mt-3 rounded-xl border border-red-200 bg-card p-4 text-sm text-ink">
              <p className="font-semibold">Reason</p>
              <p className="mt-1">{state.decisionReason}</p>
            </div>
          )}
          <p className="mt-3 text-sm text-ink">You can fix the issues and submit again.</p>
          {ref && <p className="mt-2 text-xs text-muted-foreground">Reference {ref}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryButton onClick={onBegin}>Update and resubmit</PrimaryButton>
            <SupportLink subject={`Verification ${ref ?? ''}`.trim()}>Contact support</SupportLink>
          </div>
        </Card>
      );

    case 'REVERIFICATION_REQUIRED':
      return (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="font-semibold text-ink">Please verify again</h2>
          <p className="mt-1 text-sm text-ink">
            We have asked you to verify again. This is not a rejection. Check your details, add anything that is
            missing and submit for review.
          </p>
          <div className="mt-4">
            <PrimaryButton onClick={onBegin}>Start reverification</PrimaryButton>
          </div>
        </Card>
      );

    case 'REVOKED':
      return (
        <Card className="border-red-200 bg-red-50">
          <h2 className="font-semibold text-ink">Verification removed</h2>
          <p className="mt-1 text-sm text-ink">
            Your verified status has been removed. Please contact support to find out what to do next.
          </p>
          {ref && <p className="mt-2 text-xs text-muted-foreground">Reference {ref}</p>}
          <div className="mt-4">
            <SupportLink subject={`Verification ${ref ?? ''}`.trim()}>Contact support</SupportLink>
          </div>
        </Card>
      );

    default:
      // IN_PROGRESS is shown as the wizard, never here.
      return null;
  }
}
