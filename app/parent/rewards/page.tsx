'use client';

// /parent/rewards — the parent's iTutor credits. Credits a parent earns or
// redeems are theirs, and they can spend them on their children's classes.
// Shared with /student/rewards (components/credits/RewardsPage).

import ParentShell from '@/components/parent/ParentShell';
import RewardsPage from '@/components/credits/RewardsPage';

export default function ParentRewardsPage() {
  return (
    <ParentShell>
      <div className="mx-auto w-full max-w-3xl">
        <RewardsPage role="parent" />
      </div>
    </ParentShell>
  );
}
