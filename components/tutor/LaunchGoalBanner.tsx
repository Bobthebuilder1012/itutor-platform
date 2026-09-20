'use client';

/**
 * §5. "Launch your class — 3 / 5 students joined."
 *
 * Persistent for the first 14 days after verification, on every tutor page.
 *
 * NOT DISMISSIBLE WHILE IN PROGRESS. Persistent is the requirement, and a
 * teacher who dismisses this on day 2 has quietly opted out of the only
 * mechanism the product has for getting them started. It collapses instead, to
 * a single line that still carries the count — the teacher can make it small,
 * but not make it disappear. Only the finished state can actually be dismissed,
 * because by then it is a congratulation rather than a goal.
 *
 * NO RED, NO "DEADLINE". The clients page records the same rule for feedback
 * nudges: this is encouragement, and a teacher who misses five students in
 * fourteen days has not failed at anything. When the window closes the strip
 * simply stops appearing and the tools stay where they are.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Rocket, CheckCircle2 } from 'lucide-react';
import HeaderStrip from './HeaderStrip';
import ProgressMeter from '@/components/ui/ProgressMeter';
import { trackClient } from '@/lib/analytics/client';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import type { LaunchGoalState } from '@/lib/hooks/useTeacherLaunchGoal';

const COLLAPSE_KEY = 'itutor.launchGoal.collapsed';
const DONE_KEY = 'itutor.launchGoal.done.v1';

export default function LaunchGoalBanner({ goal }: { goal: LaunchGoalState }) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  // Read once, after mount. localStorage is unavailable in a private window and
  // throws rather than returning null, so every access is guarded and the
  // banner renders correctly without it.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
      setDismissed(localStorage.getItem(DONE_KEY) === '1');
    } catch {
      /* no persistence available; defaults are fine */
    }
    setReady(true);
  }, []);

  const complete = goal.complete;

  useEffect(() => {
    if (!ready || goal.loading || goal.unavailable) return;
    if (complete && dismissed) return;
    // The only client-emittable event in this feature. Everything else is
    // server-authoritative because teacher_invite_joined is the TDR numerator.
    void trackClient(PRODUCT_EVENTS.LAUNCH_GOAL_VIEWED, {
      joined: goal.joined,
      target: goal.target,
      days_left: goal.daysLeft ?? 0,
    });
    // Once per mount, not once per re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready || goal.loading || goal.unavailable) return null;
  if (complete && dismissed) return null;

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (complete) {
    return (
      <HeaderStrip
        icon={CheckCircle2}
        tone="success"
        title={`Launch goal complete — ${goal.joined} students joined.`}
        href="/tutor/launch"
        onDismiss={dismiss}
        cta={
          <Link
            href="/tutor/launch"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-ink text-white text-sm font-semibold hover:bg-ink/90"
          >
            See who joined
          </Link>
        }
      />
    );
  }

  const secondary: string[] = [];
  if (goal.invited > 0) secondary.push(`${goal.invited} invited`);
  if (goal.awaitingApproval > 0) secondary.push(`${goal.awaitingApproval} waiting for you`);
  if (goal.needsAttention > 0) secondary.push(`${goal.needsAttention} needs attention`);

  return (
    <HeaderStrip
      icon={Rocket}
      tone="brand"
      title="Launch your class"
      collapsed={collapsed}
      onToggleCollapse={toggle}
      collapsedSummary={
        <span className="tabular-nums">
          Launch your class · {goal.joined}/{goal.target}
        </span>
      }
      href="/tutor/launch"
      trailing={
        goal.daysLeft != null ? (
          <span
            className={
              goal.daysLeft <= 3
                ? 'inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-semibold tabular-nums'
                : 'inline-flex items-center rounded-full bg-brand/15 text-brand-deep px-2.5 py-1 text-xs font-semibold tabular-nums'
            }
          >
            {goal.daysLeft} day{goal.daysLeft === 1 ? '' : 's'} left
          </span>
        ) : null
      }
      cta={
        <Link
          href="/tutor/launch"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-ink text-white text-sm font-semibold hover:bg-ink/90"
        >
          {goal.joined === 0 ? 'Invite students' : 'Open launch dashboard'}
        </Link>
      }
    >
      <div className="space-y-1">
        <ProgressMeter
          value={goal.joined}
          total={goal.target}
          tone="brand"
          size="sm"
          className="max-w-md"
          trackClassName="bg-white border border-border"
          label={`${goal.joined} / ${goal.target} students joined`}
          srLabel={`${goal.joined} of ${goal.target} students joined`}
        />
        <div className="text-xs text-muted-foreground">
          {secondary.length > 0
            ? secondary.join(' · ')
            : 'Get your first 5 students onto iTutor.'}
        </div>
      </div>
    </HeaderStrip>
  );
}
