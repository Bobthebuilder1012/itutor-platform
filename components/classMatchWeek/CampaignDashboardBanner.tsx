'use client';

/**
 * Class Match Week, announced on a dashboard.
 *
 * The topbar CTA (CampaignCta) is always there but deliberately small — it is a
 * way BACK to something you already know about. This is the thing that tells
 * someone the campaign exists in the first place, so it gets room to say what
 * they get, and it only appears where a person lands rather than on every page.
 *
 * IT DISAPPEARS ONCE THEY ARE IN. A banner inviting you to join something you
 * joined reads as a page that has not noticed you, and the topbar CTA already
 * covers the return trip. Joined learners see nothing here; joined teachers see
 * nothing here.
 *
 * DISMISSAL IS PER CAMPAIGN, not forever: the key carries the campaign id, so a
 * second Class Match Week announces itself again to someone who closed the first.
 * Storage failures fail OPEN — a banner shown twice is a smaller problem than a
 * campaign nobody hears about.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Users as CampaignMark, X } from 'lucide-react';
import type { ClassMatchCampaign } from '@/lib/classMatchWeek/types';

type BannerState = { joined: boolean; started: boolean };

/** Redemption windows run up to 30 days past a session; nothing to join after. */
const AFTER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const AST = 'America/Port_of_Spain';

function astDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-TT', {
    timeZone: AST,
    day: 'numeric',
    month: 'short',
  });
}

function countdown(ms: number): string {
  const mins = Math.max(1, Math.floor(ms / 60_000));
  const days = Math.floor(mins / (24 * 60));
  const hours = Math.floor((mins % (24 * 60)) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function CampaignDashboardBanner({
  audience = 'learner',
}: {
  /** Teachers are invited to run a taster; everyone else to attend one. */
  audience?: 'learner' | 'teacher';
} = {}) {
  const [campaign, setCampaign] = useState<ClassMatchCampaign | null | undefined>(undefined);
  const [state, setState] = useState<BannerState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch('/api/class-match/campaign'),
          fetch('/api/class-match/banner-state'),
        ]);
        const c = cRes.ok ? ((await cRes.json())?.campaign ?? null) : null;
        const s = sRes.ok ? ((await sRes.json()) as BannerState) : null;
        if (!alive) return;
        setCampaign(c);
        setState(s);
      } catch {
        if (alive) setCampaign(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!campaign) return;
    try {
      setDismissed(window.localStorage.getItem(`cmw-banner-hidden-${campaign.id}`) === '1');
    } catch {
      setDismissed(false);
    }
  }, [campaign]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hide = () => {
    setDismissed(true);
    if (!campaign) return;
    try {
      window.localStorage.setItem(`cmw-banner-hidden-${campaign.id}`, '1');
    } catch {
      /* nothing to persist to; it will show again next visit */
    }
  };

  if (!campaign || dismissed) return null;
  if (state?.joined) return null;

  const startsAt = Date.parse(campaign.starts_at);
  const endsAt = Date.parse(campaign.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
  if (now - endsAt > AFTER_WINDOW_MS) return null;

  const teacher = audience === 'teacher';
  const href = teacher ? '/tutor/business?tab=class-match-week' : '/class-match-week';

  const timing =
    now < startsAt
      ? `Starts in ${countdown(startsAt - now)}`
      : now < endsAt
        ? `Ends in ${countdown(endsAt - now)}`
        : 'Discounts still live';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand/25 bg-gradient-to-br from-mint to-brand-light p-5 sm:p-6">
      <button
        onClick={hide}
        aria-label="Hide this"
        className="absolute right-3 top-3 grid size-7 place-items-center rounded-full text-forest/50 transition-colors hover:bg-white/60 hover:text-forest"
      >
        <X className="size-3.5" />
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-white">
          <CampaignMark className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-deep">
              Class Match Week
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-brand-deep">
              <Clock className="size-2.5" />
              {timing}
            </span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-forest">
            {teacher
              ? 'Fill your class with a free half hour'
              : 'Be a part of Class Match Week for discounted lessons'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-forest/80">
            {teacher ? (
              <>
                Offer a free 30-minute taster {astDay(campaign.starts_at)}–
                {astDay(campaign.ends_at)}. Families who turn up unlock a discount on your class if
                they enrol.
              </>
            ) : (
              <>
                Meet a teacher free for 30 minutes, {astDay(campaign.starts_at)}–
                {astDay(campaign.ends_at)}. Turn up and you unlock a discount on their ongoing
                class.
              </>
            )}
          </p>
        </div>

        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
        >
          {teacher ? 'Offer a taster' : 'Find my free session'} <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
