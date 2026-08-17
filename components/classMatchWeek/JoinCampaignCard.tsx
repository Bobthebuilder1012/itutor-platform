'use client';

/**
 * "Join Class Match Week" — the dashboard invitation, with a live countdown.
 *
 * Shown to a signed-in student who has NOT joined yet, and only while a
 * campaign exists. It disappears the moment they finish the questionnaire,
 * because the questionnaire is one-time: inviting someone to join a thing they
 * have already joined is the kind of prompt that teaches people to ignore the
 * dashboard.
 *
 * The joined/started check is ACCOUNT-aware, not cookie-aware. A student who
 * answered on their phone and opened the dashboard on a laptop has no
 * `cmw_token` there, and must still not be re-invited.
 *
 * Renders null until both fetches resolve, so it never flashes into the
 * greeting row and shove the layout sideways on a slow connection.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { ClassMatchCampaign } from '@/lib/classMatchWeek/types';

type BannerState = { joined: boolean; started: boolean };

/** Redemption windows run up to 30 days past a session; nothing to join after. */
const AFTER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
  if (state?.joined) return null;

  const startsAt = Date.parse(campaign.starts_at);
  const endsAt = Date.parse(campaign.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
  if (now - endsAt > AFTER_WINDOW_MS) return null;

  const started = Boolean(state?.started);

  let timing: string;
  if (now < startsAt) timing = `Starts in ${countdown(startsAt - now)}`;
  else if (now < endsAt) timing = `Ends in ${countdown(endsAt - now)}`;
  else timing = 'Discounts still live';

  return (
    <Link
      href="/class-match-week"
      className="group w-full max-w-sm rounded-2xl border border-brand/30 bg-brand-soft/60 p-4 transition-all hover:border-brand hover:shadow-card sm:w-auto"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand text-white">
          <Sparkles className="size-4" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-brand-deep">
          Class Match Week
        </span>
      </div>

      <p className="mt-2 text-sm font-bold text-ink">
        {started ? 'Finish joining — 2 questions left' : 'Meet a teacher free for 30 minutes'}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {started
          ? 'Your answers are saved. Pick up where you left off.'
          : 'Answer five quick questions and we’ll match you to teachers.'}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand-deep">
          {timing}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-deep">
          {started ? 'Continue' : 'Join now'}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
