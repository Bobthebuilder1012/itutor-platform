'use client';

/**
 * The join button for a reserved Class Match Week taster, on the student and
 * parent dashboards.
 *
 * WHY IT IS NOT ONLY IN THE PORTAL. Join clicks are the metric the campaign is
 * judged on (docs 03 §3.4), and until now the only Join button on the site was
 * two navigations inside /class-match-week — the campaign dashboard's imminent
 * strip and the campaign my-classes list. A family who reserved a taster and
 * then came back to iTutor the normal way, through their own dashboard, had
 * nowhere to click. Reminder emails carry the link, but the platform has to
 * work for the family who opens the site instead of the email.
 *
 * TWO STATES, and both matter:
 *
 *   • Inside the join window — from two hours before the start until the
 *     session ends — the live Join button, matching the portal's window
 *     exactly so the two surfaces never disagree about whether class is open.
 *   • Before that, the reservation itself: when it is, who is teaching, and
 *     that Join appears two hours ahead. A family who forgot they reserved is
 *     the one this is for.
 *
 * Join is a plain <a>: /api/class-match/sessions/[id]/join records the click,
 * issues the coupon and 302s to Meet. Never fetch it — an XHR would follow the
 * redirect and swallow the room.
 *
 * Renders nothing when there is no live campaign, nothing reserved, or the
 * viewer is signed out; /api/class-match/my-sessions answers with an empty list
 * for all three, so there is one thing to test.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Clock, Video } from 'lucide-react';
import type { MyCampaignSession } from '@/app/api/class-match/my-sessions/route';

/** Matches JOIN_WINDOW_MS in the campaign portal's my-classes page. */
const JOIN_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Trinidad wall-clock — the only timezone the platform's times mean. */
function formatAst(iso: string): string {
  return new Date(iso).toLocaleString('en-TT', {
    timeZone: 'America/Port_of_Spain',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CampaignJoinCard() {
  const [sessions, setSessions] = useState<MyCampaignSession[]>([]);
  // null until mounted. The server's clock is not the browser's, and the
  // countdown must not be rendered from the wrong one.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/class-match/my-sessions');
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setSessions((json.sessions ?? []) as MyCampaignSession[]);
      } catch {
        // A campaign that cannot be read is treated as no campaign. The
        // dashboard behind this card is unaffected.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  if (now === null || sessions.length === 0) return null;

  // The endpoint already dropped everything finished and sorted soonest first,
  // so the next one is the first one.
  const next = sessions[0];
  const startMs = new Date(next.scheduledAt).getTime();
  const joinOpen = startMs - JOIN_WINDOW_MS <= now;
  const live = startMs <= now;

  const minutes = Math.max(1, Math.round((startMs - now) / 60_000));
  const countdown =
    minutes < 60
      ? `starts in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
      : `starts in ${Math.round(minutes / 60)} ${Math.round(minutes / 60) === 1 ? 'hour' : 'hours'}`;

  return (
    <section
      className={
        joinOpen
          ? 'rounded-2xl bg-brand-deep p-4 text-white shadow-card sm:p-5'
          : 'rounded-2xl border border-border bg-card p-4 sm:p-5'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div
            className={
              joinOpen
                ? 'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/80'
                : 'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-deep'
            }
          >
            <Sparkles className="size-3" /> Class Match Week
          </div>

          <h2
            className={
              joinOpen
                ? 'mt-1 truncate text-base font-bold sm:text-lg'
                : 'mt-1 truncate text-base font-bold text-ink sm:text-lg'
            }
          >
            {live ? `${next.teacherName} is live now` : next.title}
          </h2>

          <p
            className={
              joinOpen ? 'mt-0.5 text-xs text-white/80' : 'mt-0.5 text-xs text-muted-foreground'
            }
          >
            {live ? (
              <>Your free taster of {next.groupName} has started.</>
            ) : (
              <>
                With {next.teacherName} · {formatAst(next.scheduledAt)} ·{' '}
                {next.durationMinutes} min
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {joinOpen ? (
            <a
              href={`/api/class-match/sessions/${next.sessionId}/join`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-deep transition-colors hover:bg-mint"
            >
              <Video className="size-4" /> Join session
            </a>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Clock className="size-3.5" /> {countdown}
              </span>
              {/* Not a disabled Join: a button that cannot be pressed says
                  nothing about when it can be. The portal is where the whole
                  reservation, and its coupon, lives. */}
              <Link
                href="/class-match-week/my-classes"
                className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-muted"
              >
                My tasters
              </Link>
            </>
          )}
        </div>
      </div>

      {!joinOpen && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Join opens two hours before the session starts.
        </p>
      )}
    </section>
  );
}
