'use client';

// /student/rewards — the student's iTutor credits: balance, referral link,
// friends, history. Shared with /parent/rewards (components/credits/RewardsPage).

import RewardsPage from '@/components/credits/RewardsPage';

export default function StudentRewardsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <RewardsPage role="student" />
    </div>
  );
}
