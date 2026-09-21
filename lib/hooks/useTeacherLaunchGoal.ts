'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LaunchGoal } from '@/lib/teacherInvites/types';

export const LAUNCH_GOAL_UPDATED_EVENT = 'teacher-launch-goal-updated';

/** Call after sending, resending or withdrawing so every instance refreshes. */
export function notifyLaunchGoalUpdated() {
  if (typeof window !== 'undefined') {
    cache = null;
    window.dispatchEvent(new CustomEvent(LAUNCH_GOAL_UPDATED_EVENT));
  }
}

export type LaunchGoalState = LaunchGoal & {
  loading: boolean;
  /** This environment has not run migration 258. Show nothing rather than 0/5. */
  unavailable: boolean;
  canInvite: boolean;
  parentAccountsEnabled: boolean;
};

const EMPTY: LaunchGoalState = {
  target: 5,
  joined: 0,
  invited: 0,
  needsAttention: 0,
  awaitingApproval: 0,
  awaitingParent: 0,
  windowStartsAt: null,
  windowEndsAt: null,
  daysLeft: null,
  inWindow: false,
  activated: false,
  complete: false,
  metAt: null,
  loading: true,
  unavailable: false,
  canInvite: false,
  parentAccountsEnabled: false,
};

/**
 * A module-scope cache, which is the whole reason this hook is not three lines
 * of useEffect.
 *
 * TutorShell is mounted by each /tutor page individually — there is no
 * app/tutor/layout.tsx — so it REMOUNTS on every navigation, and so does
 * anything it renders. Without a cache the launch banner would refetch and
 * flash empty on every single click, which is worse than not having a banner:
 * a persistent goal that blinks reads as a bug.
 *
 * 60 seconds, stale-while-revalidate. The first paint after a navigation reads
 * the cache synchronously and the strip is simply there; a background fetch
 * then corrects it. notifyLaunchGoalUpdated() busts it, so sending an
 * invitation moves the number immediately rather than up to a minute later.
 */
let cache: { at: number; data: LaunchGoalState } | null = null;
const TTL_MS = 60_000;

export function useTeacherLaunchGoal(enabled: boolean = true): LaunchGoalState {
  const [state, setState] = useState<LaunchGoalState>(() =>
    cache ? cache.data : EMPTY
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/activation', { cache: 'no-store' });
      if (!res.ok) {
        // A 401/403 is the ordinary answer for a non-tutor, and a 500 is not
        // worth breaking the page header over. Either way: no banner.
        const quiet: LaunchGoalState = { ...EMPTY, loading: false };
        cache = { at: Date.now(), data: quiet };
        setState(quiet);
        return;
      }
      const body = (await res.json()) as {
        success: boolean;
        data?: {
          goal: LaunchGoal;
          unavailable: boolean;
          canInvite: boolean;
          parentAccountsEnabled: boolean;
        };
      };
      if (!body?.success || !body.data) {
        const quiet: LaunchGoalState = { ...EMPTY, loading: false };
        cache = { at: Date.now(), data: quiet };
        setState(quiet);
        return;
      }
      const next: LaunchGoalState = {
        ...body.data.goal,
        loading: false,
        unavailable: body.data.unavailable,
        canInvite: body.data.canInvite,
        parentAccountsEnabled: body.data.parentAccountsEnabled,
      };
      cache = { at: Date.now(), data: next };
      setState(next);
    } catch {
      // A broken endpoint must never produce a broken header.
      const quiet: LaunchGoalState = { ...EMPTY, loading: false };
      cache = { at: Date.now(), data: quiet };
      setState(quiet);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ ...EMPTY, loading: false });
      return;
    }

    const fresh = cache && Date.now() - cache.at < TTL_MS;
    if (cache) setState(cache.data);
    if (!fresh) void load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      cache = null;
      void load();
    };
    window.addEventListener(LAUNCH_GOAL_UPDATED_EVENT, handler);
    return () => window.removeEventListener(LAUNCH_GOAL_UPDATED_EVENT, handler);
  }, [enabled, load]);

  return state;
}

/**
 * Whole days left, floor-free.
 *
 * Deliberately not one of the four countdown implementations already in this
 * codebase: every one of them ticks by the minute for a campaign deadline, and
 * a launch goal measured in minutes would read as a threat. Days, and the copy
 * never says "deadline".
 */
export function daysLeftFrom(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const ms = Date.parse(endsAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}
