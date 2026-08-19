'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ClassMatchCampaign } from '@/lib/classMatchWeek/types';

/**
 * Site-wide Class Match Week bar (docs/class-match-week/04 §4.3).
 *
 * One thin line pinned above the page content — on mobile it competes with the
 * site header, so it must never grow past a single row. Renders nothing until
 * the campaign fetch resolves, so the server/ISR render of app/page.tsx is
 * untouched and the LCP never layout-shifts on a null campaign.
 *
 * Four states by time against the campaign window:
 *   before → countdown to starts_at
 *   during → countdown to ends_at
 *   after  → static "discounts are still live" for up to 30 days past ends_at
 *            (the longest redemption window), then nothing at all
 */

// Redemption windows run 7–30 days past a session; past the longest possible
// window there is nothing left to chase, so the bar disappears entirely.
const AFTER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Dismissal is per browser session — the bar returns next session. Whether it
// should be dismissible permanently is still an OPEN item (docs 06 appendix,
// item 14); sessionStorage is the conservative answer until that is decided.
const DISMISS_KEY = 'cmw_banner_dismissed';

// Module-level cache: DashboardLayout remounts on every route change, and the
// campaign row changes on a scale of days — one fetch per page load is enough.
// `undefined` = not fetched yet; `null` = fetched, no campaign (or the fetch
// failed, which renders the same way).
let cachedCampaign: ClassMatchCampaign | null | undefined;
let inflight: Promise<ClassMatchCampaign | null> | null = null;

/**
 * Personal state for the role/state-aware copy (docs 04 §4.3, recommended
 * variant): a visitor with a reservation sees their next session; one with a
 * completed questionnaire sees "view your matches". Cached the same way as the
 * campaign; a failed fetch silently falls back to the generic copy tiers.
 */
type BannerState = {
  hasSubmission: boolean;
  authed: boolean;
  nextSession: null | { sessionId: string; title: string; scheduledAt: string };
};
let cachedState: BannerState | null | undefined;
let stateInflight: Promise<BannerState | null> | null = null;

function loadBannerState(): Promise<BannerState | null> {
  if (cachedState !== undefined) return Promise.resolve(cachedState);
  if (!stateInflight) {
    stateInflight = fetch('/api/class-match/banner-state')
      .then(async (res) => (res.ok ? ((await res.json()) as BannerState) : null))
      .catch(() => null)
      .then((state) => {
        cachedState = state;
        stateInflight = null;
        return state;
      });
  }
  return stateInflight;
}

function astShortTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/Port_of_Spain',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function loadCampaign(): Promise<ClassMatchCampaign | null> {
  if (cachedCampaign !== undefined) return Promise.resolve(cachedCampaign);
  if (!inflight) {
    inflight = fetch('/api/class-match/campaign')
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { campaign?: ClassMatchCampaign | null };
        return body?.campaign ?? null;
      })
      .catch(() => null)
      .then((campaign) => {
        cachedCampaign = campaign;
        inflight = null;
        return campaign;
      });
  }
  return inflight;
}

/** "3d 4h" above a day out, "4h 12m" under a day, "12m" under an hour. */
function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function ClassMatchBanner({
  role,
  className = '',
}: {
  role?: string | null;
  /**
   * Positioning escape hatch for hosts whose own header is out of normal flow
   * (the landing page Nav is `fixed top-0`, so an unoffset banner would render
   * hidden behind it). DashboardLayout needs nothing here.
   */
  className?: string;
}) {
  // Lazy inits are safe against hydration mismatches: on the server (and on the
  // very first client render of a page load) the cache is empty, so both sides
  // render null regardless of what sessionStorage says.
  const [campaign, setCampaign] = useState<ClassMatchCampaign | null | undefined>(
    () => cachedCampaign,
  );
  const [state, setState] = useState<BannerState | null | undefined>(() => cachedState);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1',
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void loadCampaign().then((c) => {
      if (alive) setCampaign(c);
      // Personal state only matters when a campaign renders at all.
      if (c) {
        void loadBannerState().then((s) => {
          if (alive) setState(s);
        });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // The copy shows nothing finer than minutes, so a once-a-minute tick is exact.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!campaign || dismissed) return null;

  const startsAt = Date.parse(campaign.starts_at);
  const endsAt = Date.parse(campaign.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;

  const isTutor = role === 'tutor';

  // Copy precedence (docs 04 §4.3): a reserved session beats everything, a
  // completed questionnaire beats the generic pitch, teachers get their own
  // call-to-action, and only then the default per time state.
  let href: string;
  let copy: string;
  if (state?.nextSession) {
    href = '/class-match-week/my-classes';
    copy = `Your next session: ${state.nextSession.title} · ${astShortTime(state.nextSession.scheduledAt)}`;
  } else if (state?.hasSubmission && !isTutor) {
    href = '/class-match-week/results';
    copy = 'Class Match Week — view your matches';
  } else {
    href = isTutor ? '/tutor/class-match-week' : '/class-match-week';
    if (now < startsAt) {
      copy = isTutor
        ? `Class Match Week — create a free taster session · Starts in ${formatCountdown(startsAt - now)}`
        : `Class Match Week — free classes in the subjects you choose · Starts in ${formatCountdown(startsAt - now)}`;
    } else if (now < endsAt) {
      copy = isTutor
        ? `Class Match Week — create a free taster session · Ends in ${formatCountdown(endsAt - now)}`
        : `Class Match Week is on — free classes all week · Ends in ${formatCountdown(endsAt - now)}`;
    } else if (now - endsAt <= AFTER_WINDOW_MS) {
      // A dead countdown makes the site look abandoned; attendees hold coupons
      // that are quietly expiring for up to a month, so the message flips.
      copy = 'Class Match Week discounts are still live';
    } else {
      return null;
    }
  }

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage can be unavailable (private mode quotas); dismiss for this render anyway.
    }
    setDismissed(true);
  };

  return (
    <div className={`relative w-full bg-itutor-green text-white ${className}`}>
      <Link
        href={href}
        className="block w-full truncate whitespace-nowrap py-1.5 pl-3 pr-10 text-center text-xs font-medium sm:text-sm hover:underline"
      >
        {copy}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss Class Match Week banner"
        className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
