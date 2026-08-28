'use client';

/**
 * Sign up OR log in, as a pop-up, for a visitor joining Class Match Week.
 *
 * This replaces a hard navigation to /signup. That page is a dark full-width
 * brand layout, so arriving there from a green campaign screen read as landing on
 * a different product at the exact moment the visitor had done the work and had
 * the least patience for a jolt. Here the campaign stays visible behind a blurred
 * scrim and the account step reads as the last step of what they were doing.
 *
 * BOTH MODES, because plenty of people tapping Reserve already have an account
 * from a previous term (docs 03 §3.2 says so explicitly) and sending them to
 * "create an account" is a dead end. SignupCard carries its own "Log in" link
 * that navigates away; the toggle here keeps the choice inside the pop-up, so it
 * is offered before they go looking for it.
 *
 * The forms themselves are the real ones — components/auth/SignupCard and
 * components/auth/LoginForm. Only the chrome around them changes, so validation,
 * verification and the Google button cannot drift from the main site's.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import SignupCard from '@/components/auth/SignupCard';
import LoginForm from '@/components/auth/LoginForm';
import { cn } from '@/lib/utils';
import type { SubmissionRole } from '@/lib/classMatchWeek/types';

export default function CampaignAuthOverlay({
  role,
  redirectTo,
}: {
  /** Answered at the landing page, so the signup card never asks for it again. */
  role: SubmissionRole;
  redirectTo: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const panelRef = useRef<HTMLDivElement | null>(null);

  /**
   * Closing goes back to the campaign, not to `/`.
   *
   * Their answers are already stored server-side against the `cmw_token` cookie,
   * so nothing is lost by leaving — and dumping someone on the marketing home
   * page after they answered five questions loses the thread entirely.
   */
  const close = () => router.push('/class-match-week');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const tab = (value: 'signup' | 'login', label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={cn(
        'flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors',
        mode === value ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
      )}
    >
      {label}
    </button>
  );

  return (
    <div
      // bg-black/40, not bg-ink/40: `ink` is a bare var() token with no
      // <alpha-value>, so Tailwind drops the /40 modifier and the scrim renders
      // with no tint at all — blur without dim.
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Join Class Match Week"
      onMouseDown={(e) => {
        // Only a press that both starts and ends on the backdrop dismisses, so a
        // drag begun inside the form never closes it.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-full border border-border bg-background p-1">
            {tab('signup', 'Create account')}
            {tab('login', 'Log in')}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-ink-muted transition-colors hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Both forms read useSearchParams; the boundary keeps that legal. */}
        <Suspense fallback={null}>
          {mode === 'signup' ? (
            <SignupCard variant="modal" role={role} redirectTo={redirectTo} onClose={close} />
          ) : (
            <div className="rounded-3xl border border-border bg-background p-6 shadow-2xl">
              <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Log in and we&rsquo;ll take you straight to your matches.
              </p>
              <div className="mt-4">
                <LoginForm redirectTo={redirectTo} onSwitchMode={() => setMode('signup')} />
              </div>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
