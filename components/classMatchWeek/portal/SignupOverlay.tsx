'use client';

/**
 * Account creation, presented over the questionnaire instead of after it.
 *
 * Finishing the questions used to navigate to /signup, which replaced a green
 * campaign screen with a dark full-page layout — two unrelated pages stitched
 * together at the exact moment the visitor has done the work and has the least
 * patience for a jolt. Overlaying keeps the answered questionnaire visible and
 * blurred behind the card, so the account step reads as the last step of what
 * they were already doing.
 *
 * The card itself is the real one (components/auth/SignupCard) — same steps,
 * same validation, same Google button. Only its chrome changes.
 */

import { Suspense, useEffect, useRef } from 'react';
import SignupCard from '@/components/auth/SignupCard';
import type { SubmissionRole } from '@/lib/classMatchWeek/types';

export default function SignupOverlay({
  open,
  onClose,
  role,
  redirectTo,
}: {
  open: boolean;
  onClose: () => void;
  role: SubmissionRole;
  redirectTo: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape closes, and the page behind must not scroll while a full-height
  // card is open — on a phone that scroll goes to the wrong element and the
  // form appears stuck.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Move focus into the dialog so keyboard and screen-reader users land on the
  // form rather than continuing from wherever the questionnaire left them.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-6 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Create your iTutor account"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop dismisses —
        // a drag that began inside the form must never close it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-xl shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* SignupCard reads useSearchParams; the boundary keeps that legal
            wherever this overlay is mounted. */}
        <Suspense fallback={null}>
          <SignupCard variant="modal" onClose={onClose} role={role} redirectTo={redirectTo} />
        </Suspense>
      </div>
    </div>
  );
}
