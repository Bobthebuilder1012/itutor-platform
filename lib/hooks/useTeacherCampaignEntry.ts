'use client';

/**
 * Just enough campaign state to draw the Class Match Week entry points in My
 * Classes: whether to show them at all, and whether the create button can go
 * straight to the builder.
 *
 * Deliberately thin. TeacherCampaignPanel loads the same two endpoints and much
 * more besides, and this does not try to share that: the panel only mounts when
 * its tab is open, while the header button and the tab strip have to be drawn
 * before anyone has chosen a tab. Both endpoints are small, uncached JSON, and
 * the alternative — hoisting the panel's whole state into the page — would make
 * the classes list depend on campaign data it never uses.
 *
 * `campaign` is null both outside a campaign week and when the feature flag is
 * off, because /api/class-match/campaign reports the flag that way (see
 * lib/featureFlags/classMatchWeek.ts). Callers get one thing to test.
 */

import { useEffect, useState } from 'react';
import type { ClassMatchCampaign } from '@/lib/classMatchWeek/types';
import type { Profile } from '@/lib/types/database';

export type TeacherCampaignEntry = {
  loading: boolean;
  /** The live campaign, or null when none is running or the flag is off. */
  campaign: ClassMatchCampaign | null;
  /** Has this teacher joined the campaign? */
  optedIn: boolean;
  /**
   * Whether "Create a Class Match Week session" can link straight to the
   * builder. Opt-in is the whole test: the builder loads its own classes and
   * already renders a named empty state for a teacher who has joined but has no
   * class that can host a taster, so gating on that here would mean a third
   * copy of the eligibility query for no gain.
   */
  canCreateSession: boolean;
};

export function useTeacherCampaignEntry(profile: Profile | null): TeacherCampaignEntry {
  const [state, setState] = useState<TeacherCampaignEntry>({
    loading: true,
    campaign: null,
    optedIn: false,
    canCreateSession: false,
  });

  useEffect(() => {
    // Only teachers have a campaign to enter, and /api/class-match/sessions
    // answers 401 for everyone else — no point asking.
    if (!profile?.id || profile.role !== 'tutor') {
      setState({ loading: false, campaign: null, optedIn: false, canCreateSession: false });
      return;
    }

    let alive = true;
    (async () => {
      try {
        const [campRes, sessRes] = await Promise.all([
          fetch('/api/class-match/campaign'),
          fetch('/api/class-match/sessions'),
        ]);

        const campaign: ClassMatchCampaign | null = campRes.ok
          ? ((await campRes.json()).campaign ?? null)
          : null;
        const optedIn = sessRes.ok ? !!(await sessRes.json()).optedIn : false;

        if (alive) {
          setState({ loading: false, campaign, optedIn, canCreateSession: !!campaign && optedIn });
        }
      } catch (err) {
        // A campaign that cannot be read is treated as no campaign: My Classes
        // is a working page without it, and a half-drawn campaign entry point
        // is worse than none.
        console.error('[useTeacherCampaignEntry] load failed:', err);
        if (alive) {
          setState({ loading: false, campaign: null, optedIn: false, canCreateSession: false });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [profile?.id, profile?.role]);

  return state;
}
