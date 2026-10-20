'use client';

import { useState } from 'react';
import { BadgeCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { useVerificationSummary } from '@/lib/verificationV2/clientHooks';
import type { PublicSummary } from '@/lib/verificationV2/publicView';
import VerificationPanel from './VerificationPanel';

/** The three labels. Separate facts, never merged into one "verified" badge. */
export const LABEL_ID = 'ID checked';
export const LABEL_CREDENTIALS = 'Credentials reviewed';
export const LABEL_EXTRAS = 'Teacher-provided extras (not verified by iTutor)';

/**
 * The labels themselves, with no data fetching. Used by VerificationBadges below
 * and by the dev states gallery. Renders nothing when no label applies.
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
  if (!summary.idChecked && !summary.credentialsReviewed && !summary.hasExtras) return null;

  const size = compact ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5';
  const icon = compact ? 'size-3' : 'size-3.5';

  const pill = (key: string, tone: string, children: React.ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={onOpen}
      className={`inline-flex items-center rounded-full border font-semibold leading-tight transition hover:brightness-95 ${size} ${tone}`}
    >
      {children}
    </button>
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-testid="verification-badges">
      {summary.idChecked &&
        pill('id', 'border-emerald-200 bg-emerald-50 text-emerald-800', (
          <>
            <ShieldCheck className={icon} aria-hidden />
            {LABEL_ID}
          </>
        ))}
      {summary.credentialsReviewed &&
        pill('cred', 'border-emerald-200 bg-emerald-50 text-emerald-800', (
          <>
            <BadgeCheck className={icon} aria-hidden />
            {LABEL_CREDENTIALS}
          </>
        ))}
      {summary.hasExtras &&
        pill('extras', 'border-gray-200 bg-gray-50 text-gray-700', (
          <>
            <Sparkles className={icon} aria-hidden />
            {LABEL_EXTRAS}
          </>
        ))}
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
