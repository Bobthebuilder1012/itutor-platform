'use client';

/**
 * "Complete your profile to get listed."
 *
 * Lifted out of TutorShell unchanged in behaviour — same copy, same trigger,
 * same destination — and rebuilt on HeaderStrip and ProgressMeter so that it
 * and the launch goal cannot drift apart while sharing one slot.
 *
 * The one real change: it is a single row on a phone now. The original used
 * `flex-col sm:flex-row`, which stacked into three lines inside a sticky
 * header and cost that space on every page.
 */

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import HeaderStrip from './HeaderStrip';
import ProgressMeter from '@/components/ui/ProgressMeter';

export default function ListingBanner({
  completion,
  /**
   * Appended when the 14-day launch window is already running. The clock is
   * burning while the teacher is blocked here, and saying so is better than
   * showing two strips — but it is a sentence, not a second banner.
   */
  launchPending = false,
}: {
  completion: ReturnType<typeof useTutorCompletion>;
  launchPending?: boolean;
}) {
  if (completion.loading || completion.listed) return null;

  return (
    <HeaderStrip
      icon={Sparkles}
      tone="brand"
      title={
        launchPending
          ? 'Complete your profile to get listed — then invite your first 5 students.'
          : 'Complete your profile to get listed and start teaching.'
      }
      href="/tutor/get-listed"
      cta={
        <Link
          href="/tutor/get-listed"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-ink text-white text-sm font-semibold hover:bg-ink/90"
        >
          Complete profile
        </Link>
      }
    >
      <ProgressMeter
        value={completion.completed}
        total={completion.total}
        tone="brand"
        size="sm"
        className="max-w-md"
        trackClassName="bg-white border border-border"
        label={`${completion.completed} of ${completion.total} steps complete`}
      />
    </HeaderStrip>
  );
}
