'use client';

/**
 * A placeholder for the parts of the hub that are not built yet.
 *
 * The hub ships with four task cards because the fourth is not optional
 * furniture — a tutor scanning the page needs to see that marking lives here
 * now. But Mark Papers depends on the CXC subject reports that seed the
 * marking profiles, and those have not been downloaded, so the flow behind the
 * card does not exist.
 *
 * The choice was a dead link, a card that lies about being ready, or this. A
 * screen that says plainly what is missing costs a tutor five seconds; a 404
 * costs them their confidence in the rest of the page.
 *
 * Delete this component when the last flow lands.
 */

import Link from 'next/link';
import { ArrowLeft, Hammer } from 'lucide-react';

interface AiNotBuiltYetProps {
  title: string;
  /** What this will do, in the tutor's terms — not the build status. */
  description: string;
  /** What it is waiting on, when that is something a reader would want to know. */
  blockedOn?: string;
}

export default function AiNotBuiltYet({ title, description, blockedOn }: AiNotBuiltYetProps) {
  return (
    <div className="w-full max-w-[680px] mx-auto">
      <Link
        href="/tutor/ai"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="size-4" /> iTutor AI
      </Link>

      <div className="mt-6 rounded-2xl border-2 border-surface-border bg-background p-8 text-center">
        <div className="mx-auto size-12 rounded-2xl bg-muted grid place-items-center text-ink-muted">
          <Hammer className="size-5" />
        </div>

        <h1 className="mt-4 font-display text-[22px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] text-ink-muted leading-relaxed max-w-md mx-auto">
          {description}
        </p>

        {blockedOn && (
          <p className="mt-4 inline-block px-3 py-1.5 rounded-full bg-warning-bg text-warning-fg text-[12px] font-semibold">
            Waiting on {blockedOn}
          </p>
        )}
      </div>
    </div>
  );
}
