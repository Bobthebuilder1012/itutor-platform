'use client';

/**
 * The Class Match Week call-to-action on a student's dashboard.
 *
 * Two states, both with a live countdown beside the button:
 *   not joined  → "JOIN CLASS MATCH WEEK NOW" plus an info affordance
 *                  explaining what they get, since the name alone does not
 *                  say why a free session is worth a tap.
 *   joined      → "Go to Class Match Week", pointing at the campaign home.
 *
 * The joined check is ACCOUNT-aware, not cookie-aware. A student who answered
 * on their phone has no `cmw_token` on their laptop, and must not be told to
 * join something they have already done.
 *
 * Renders null until both fetches resolve, so it never appears late and shoves
 * the greeting beside it sideways.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Info, Sparkles } from 'lucide-react';
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
 * Info affordance that answers to BOTH hover and click.
 *
 * Hover alone would leave the explanation unreachable on a phone, which is the
 * campaign's main device; click alone would hide it from anyone who expects a
 * pointer hint. It is a real button so keyboard focus reveals it too.
 */
function InfoBubble() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // A tap-opened bubble stays until dismissed; pointer-opened follows the
  // pointer. Escape and an outside tap both close it.
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
        className="grid size-7 place-items-center rounded-full border border-border bg-white text-ink-muted transition-colors hover:border-brand hover:text-brand-deep"
      >
        <Info className="size-3.5" />
      </button>

      {open && (
        /* Right-anchored: this card lives in the top-right of the dashboard, so
           a left-anchored bubble would run off the viewport. */
        <span
          id="cmw-info-text"
          role="tooltip"
          className="absolute right-0 top-9 z-20 w-60 rounded-xl border border-border bg-white p-3 text-left text-[11px] font-medium leading-relaxed text-ink shadow-card"
        >
          {INFO_TEXT}
        </span>
      )}
    </span>
  );
}

export default function JoinCampaignCard() {
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

  if (!campaign || state === undefined) return null;

  const startsAt = Date.parse(campaign.starts_at);
  const endsAt = Date.parse(campaign.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
  if (now - endsAt > AFTER_WINDOW_MS) return null;

  const joined = Boolean(state?.joined);

  let timing: string;
  if (now < startsAt) timing = `Starts in ${countdown(startsAt - now)}`;
  else if (now < endsAt) timing = `Ends in ${countdown(endsAt - now)}`;
  else timing = 'Discounts still live';

  return (
    <div className="w-full max-w-sm rounded-2xl border border-brand/30 bg-brand-soft/60 p-4 sm:w-auto">
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-brand text-white">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand-deep">
          Class Match Week
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {joined ? (
          <Link
            href="/class-match-week/dashboard"
            className="group inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
          >
            Go to Class Match Week
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <>
            <Link
              href="/class-match-week"
              className="group inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep"
            >
              Join Class Match Week now
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <InfoBubble />
          </>
        )}

        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-deep">
          <Clock className="size-3" />
          {timing}
        </span>
      </div>
    </div>
  );
}
