'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useVerificationSummary } from '@/lib/verificationV2/clientHooks';
import type { PublicSummary } from '@/lib/verificationV2/publicView';
import VerificationPanel from './VerificationPanel';

/** What the click panel lists. The badge itself just says "Verified". */
export const LABEL_ID = 'ID checked';
export const LABEL_CREDENTIALS = 'Credentials reviewed';
export const LABEL_EXTRAS = 'Teacher-provided extras (not verified by iTutor)';

/**
 * The badge itself, with no data fetching. Used by VerificationBadges below and by the
 * dev states gallery. Students, parents and visitors see ONE thing: "Verified", on a
 * teacher who is verified. There is no label for in progress, pending or unverified
 * anywhere. What "Verified" covers (identity checked, credentials reviewed, the
 * teacher's own extras) is in the panel that opens when the badge is clicked.
 */
export function BadgeRow({
  summary,
  compact = false,
  className = '',
  onOpen,
}: {
  summary: PublicSummary;
  compact?: boolean;
  className?: string;
  onOpen?: (e: React.SyntheticEvent) => void;
}) {
  // A summary only exists for a verified teacher; one with nothing to say renders nothing.
  if (!summary.idChecked && !summary.credentialsReviewed && !summary.hasExtras) return null;

  const size = compact ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5';
  const icon = compact ? 'size-3' : 'size-3.5';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-testid="verification-badges">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Verified. See what this means"
        className={`inline-flex items-center rounded-full border border-brand/30 bg-brand/10 font-semibold leading-tight text-brand-deep transition hover:bg-brand/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${size}`}
      >
        <ShieldCheck className={icon} aria-hidden />
        Verified
      </button>
    </div>
  );
}

/**
 * Renders nothing unless the teacher is VERIFIED under the v2 flow and the
 * feature is on, so it is safe to place anywhere a teacher is shown. Clicking
 * any label opens the panel with the verified date, credentials and extras.
 *
 * `preventNav` is for use inside a link (a class card): the click opens the
 * panel instead of following the card's link.
 */
export default function VerificationBadges({
  tutorId,
  compact = false,
  preventNav = false,
  className = '',
}: {
  tutorId?: string | null;
  compact?: boolean;
  preventNav?: boolean;
  className?: string;
}) {
  const summary = useVerificationSummary(tutorId);
  const [open, setOpen] = useState(false);
  if (!tutorId || !summary) return null;

  const openPanel = (e: React.SyntheticEvent) => {
    if (preventNav) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpen(true);
  };

  return (
    <>
      <BadgeRow summary={summary} compact={compact} className={className} onOpen={openPanel} />
      {open && <VerificationPanel tutorId={tutorId} onClose={() => setOpen(false)} />}
    </>
  );
}
