'use client';

/**
 * Skip and Log in — the two ways out of the questionnaire, visible on every step.
 *
 * ONE COMPONENT, TWO VARIANTS, because the same two controls have to render in
 * two places: the bottom-left of the illustration rail on desktop, and the
 * top-right of the question column on mobile (the rail is `hidden lg:block`, so
 * "on the left under the icons" has no phone equivalent — and the phone is the
 * majority device for this audience). Two copies of the JSX would drift, and the
 * way they would drift is one of them quietly sending people somewhere else.
 *
 * WHY MOBILE PUTS THEM TOP-RIGHT. It is the only position that survives the soft
 * keyboard, which covers the bottom of the viewport on the two steps that have a
 * text input (the child's name, and the subject search). A bottom-anchored bar
 * would be hidden on exactly those screens.
 *
 * ACCEPTED COST: two DOM nodes per control, one `lg:hidden` and one
 * `hidden lg:flex`. If stylesheets fail to load a screen reader hears each
 * twice. The single-render alternative is absolutely positioning one copy
 * against `<main>`, which breaks the sticky rail. FinderArt already makes the
 * same trade for the same reason.
 *
 * WHY THE LOG-IN LINK CARRIES NO ?redirect= MID-WIZARD. Someone who taps Log In
 * on question three is trying to reach their account, not to resume a fresh
 * questionnaire they had not finished. The RESULTS screen is different — there,
 * it is `/login?redirect=/find/claim`, so the answers they have just seen get
 * adopted onto the account they are signing in to.
 */

import Link from 'next/link';

interface Props {
  variant: 'rail' | 'header';
  onSkip: () => void;
  /** A signed-in visitor already has an account, so the log-in link is noise. */
  isAuthenticated: boolean;
}

export default function FinderExitControls({ variant, onSkip, isAuthenticated }: Props) {
  if (variant === 'rail') {
    return (
      <div className="flex flex-col items-start gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border border-brand-deep/25 bg-white/70 px-4 py-2 text-[13px] font-semibold text-brand-deep backdrop-blur transition hover:bg-white"
        >
          Skip, show me everything
        </button>
        {!isAuthenticated ? (
          <p className="text-[13px] text-brand-deep/80">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold underline underline-offset-2">
              Log in
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Short label, full meaning in aria-label: the abbreviation is a space
          constraint on a phone, not a different action. */}
      <button
        type="button"
        onClick={onSkip}
        aria-label="Skip the questions and show every class"
        className="text-[13px] text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        Skip
      </button>
      {!isAuthenticated ? (
        <Link
          href="/login"
          className="rounded-full border border-border bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-mint"
        >
          Log in
        </Link>
      ) : null}
    </div>
  );
}
