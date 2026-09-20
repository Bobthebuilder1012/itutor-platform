'use client';

/**
 * Who gets the strip.
 *
 * THE HEADER GETS EXACTLY ONE, EVER. Two stacked gradient strips under a 56px
 * top bar cost about 140px of a phone viewport, permanently, on every page —
 * and this header is sticky, so it is not space the teacher can scroll past.
 * Anything that wants this slot resolves here rather than rendering itself.
 *
 * GET LISTED WINS over the launch goal, even though the 14-day clock is
 * running. My Business is gated on being listed and an unlisted teacher cannot
 * publish a class for anyone to join, so "invite 5 students" is un-actionable
 * advice until the profile is done — showing it is noise at the exact moment
 * the teacher most needs one clear instruction. The cost is that the clock
 * burns while they are blocked, so that is handled in copy: ListingBanner
 * takes a `launchPending` flag and adds a clause. One strip, two sentences.
 */

import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { useTeacherLaunchGoal } from '@/lib/hooks/useTeacherLaunchGoal';
import ListingBanner from './ListingBanner';
import LaunchGoalBanner from './LaunchGoalBanner';

export default function TutorHeaderStrip({
  completion,
}: {
  completion: ReturnType<typeof useTutorCompletion>;
}) {
  const { profile } = useProfile();
  const isTutor = profile?.role === 'tutor';
  const goal = useTeacherLaunchGoal(isTutor);

  // Nothing while either is still resolving. Rendering and then swapping would
  // shift the whole page down a moment after it painted.
  if (completion.loading || goal.loading) return null;

  // 1. Get listed — the blocking step.
  if (!completion.listed) {
    const launchPending = goal.activated && goal.inWindow && !goal.complete;
    return <ListingBanner completion={completion} launchPending={launchPending} />;
  }

  // 2. The launch goal, while the window is open or until the win is dismissed.
  if (goal.activated && !goal.unavailable && (goal.inWindow || goal.complete)) {
    return <LaunchGoalBanner goal={goal} />;
  }

  // 3. Window closed under target: the strip goes quiet. /tutor/launch keeps
  //    the tools and says so, without any failure framing.
  return null;
}
