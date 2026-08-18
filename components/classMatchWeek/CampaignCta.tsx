'use client';

/**
 * The Class Match Week entry point, in the student topbar.
 *
 * Lives in the shell rather than on the dashboard so it is reachable from every
 * student page — a campaign someone has to navigate home to find is a campaign
 * most people never join. Note this shell has no site-wide banner (that sits in
 * DashboardLayout and the landing page), so for a signed-in student this is the
 * only global way in.
 *
 * Two states, both with a live countdown beside the button:
 *   not joined  → "Join Class Match Week now" plus an info affordance, since
 *                 the name alone does not say why a free session is worth a tap.
 *   joined      → "Go to Class Match Week", pointing at the campaign home.
 *
 * The joined check is ACCOUNT-aware, not cookie-aware: a student who answered
 * on their phone has no `cmw_token` on their laptop and must not be told to
 * join something they have already done.
 *
 * Renders null until both fetches resolve, so it never appears late and shoves
 * the topbar's search field sideways.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Clock, Info, Users as CampaignMark } from 'lucide-react';
import type { ClassMatchCampaign } from '@/lib/classMatchWeek/types';

type BannerState = { joined: boolean; started: boolean };

/** Redemption windows run up to 30 days past a session; nothing to join after. */
const AFTER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const INFO_TEXT =
  'Earn coupons and discounted classes by attending free introductory classes.';

/** "3d 4h" over a day out, "4h 12m" under, "12m" under an hour. */
function countdown(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins % (60 * 24)) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Info affordance that answers to BOTH hover and press.
 *
 * Hover alone would leave the explanation unreachable on a phone, which is the
 * campaign's main device; press alone would hide it from anyone who expects a
 * pointer hint. A real button, so keyboard focus reveals it too.
 */
function InfoBubble() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label="What is Class Match Week?"
        aria-expanded={open}
        aria-describedby="cmw-info-text"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned((p) => !p);
          setOpen((o) => !o || !pinned);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className="grid size-7 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-brand hover:text-brand-deep"
      >
        <Info className="size-3.5" />
      </button>

      {open && (
        /* Right-anchored: this sits at the right end of the topbar, so a
           left-anchored bubble would run off the viewport. */
        <span
          id="cmw-info-text"
          role="tooltip"
          className="absolute right-0 top-9 z-50 w-60 rounded-xl border border-border bg-background p-3 text-left text-[11px] font-medium leading-relaxed text-ink shadow-lg"
        >
          {INFO_TEXT}
        </span>
      )}
    </span>
  );
}

export default function CampaignCta() {
  const pathname = usePathname();
  const [campaign, setCampaign] = useState<ClassMatchCampaign | null | undefined>(undefined);
  const [state, setState] = useState<BannerState | null | undefined>(undefined);
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
        if (alive) {
          setCampaign(null);
          setState(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Copy shows nothing finer than minutes, so a minute tick is exact.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Inside the campaign already: a button pointing at where you are is noise.
  if (pathname?.startsWith('/class-match-week')) return null;

  if (!campaign || state === undefined) return null;

  const startsAt = Date.parse(campaign.starts_at);
  const endsAt = Date.parse(campaign.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
  if (now - endsAt > AFTER_WINDOW_MS) return null;

  const joined = Boolean(state?.joined);
  const href = joined ? '/class-match-week/dashboard' : '/class-match-week';
  const label = joined ? 'Go to Class Match Week' : 'Join Class Match Week now';

  let timing: string;
  if (now < startsAt) timing = `Starts in ${countdown(startsAt - now)}`;
  else if (now < endsAt) timing = `Ends in ${countdown(endsAt - now)}`;
  else timing = 'Discounts live';

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href={href}
        title={label}
        className="group inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
      >
        <CampaignMark className="size-3.5 shrink-0" />
        {/* The label is the first thing to go when the bar gets tight — the
            icon and countdown still say what this is and that it is timed. */}
        <span className="hidden whitespace-nowrap xl:inline">{label}</span>
        <span className="hidden whitespace-nowrap sm:inline xl:hidden">
          {joined ? 'Class Match Week' : 'Join Class Match'}
        </span>
        <ArrowRight className="hidden size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 sm:inline" />
      </Link>

      {!joined && (
        <span className="hidden lg:inline-flex">
          <InfoBubble />
        </span>
      )}

      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-deep">
        <Clock className="size-3" />
        {timing}
      </span>
    </div>
  );
}
