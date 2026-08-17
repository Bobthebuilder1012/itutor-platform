'use client';

/**
 * The campaign's entry point on the tutor dashboard: a live countdown and a way in.
 *
 * This is the only thing on the teacher side that tells someone the campaign
 * exists. Everything else — the My Business tab, the session form — has to be
 * navigated to, and a limited-time offer nobody is told about recruits nobody.
 * So it sits in the dashboard header, and it carries the clock rather than a
 * label, because the deadline is the reason to act today instead of next week.
 *
 * IT RENDERS NOTHING WHEN NO CAMPAIGN IS LIVE. A dormant promo permanently
 * parked in the header trains teachers to ignore that corner of the screen.
 *
 * PROFILE COMPLETION IS ASKED FOR HERE, NOT ENFORCED HERE. Tapping the button
 * with an incomplete profile explains why and points at the profile, instead of
 * navigating to My Business and letting its lock screen deliver the news — a
 * button that appears to work and then dead-ends is worse than one that says
 * what it needs. The lock screen remains the real gate; this is the courtesy.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, UserCircle, X } from 'lucide-react';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';
import type { ClassMatchCampaign } from '@/lib/classMatchWeek/types';

const CAMPAIGN_TAB = '/tutor/business?tab=class-match-week';

export default function ClassMatchWeekDashboardPrompt({
  profileComplete,
}: {
  /** `useTutorCompletion().listed` — the same gate My Business itself applies. */
  profileComplete: boolean;
}) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<ClassMatchCampaign | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/class-match/campaign');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setCampaign(json.campaign ?? null);
      } catch {
        // A dashboard must render without this. Staying silent is correct.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only asked once a campaign is known to exist, so the common case — no live
  // campaign — costs the dashboard nothing.
  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/class-match/sessions');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setOptedIn(!!json.optedIn);
      } catch {
        // Falls back to "Join", which is the safe label: it leads to the tab
        // either way, and the tab knows the truth.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign]);

  if (!campaign) return null;

  const go = () => {
    if (!profileComplete) {
      setAsking(true);
      return;
    }
    router.push(CAMPAIGN_TAB);
  };

  return (
    <>
      <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/5 py-1 pl-2.5 pr-1">
        <Sparkles className="size-3.5 shrink-0 text-brand-deep" />
        <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} size="sm" />
        <button
          onClick={go}
          className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
        >
          {optedIn ? 'Manage' : 'Join'} <ArrowRight className="size-3" />
        </button>
      </div>

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAsking(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-background p-6 shadow-xl">
            <button
              onClick={() => setAsking(false)}
              className="absolute right-4 top-4 size-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            <div className="grid size-12 place-items-center rounded-2xl bg-brand/10">
              <UserCircle className="size-6 text-brand-deep" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-ink">Complete your profile first</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Class Match Week puts you in front of families who have never met you. They see your
              photo, your bio and your rates before they book — so those need to be there before you
              can join.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                href="/tutor/get-listed"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
              >
                Complete profile <ArrowRight className="size-3.5" />
              </Link>
              <button
                onClick={() => setAsking(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-ink"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
