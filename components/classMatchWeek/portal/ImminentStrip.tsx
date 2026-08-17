'use client';

/**
 * Class Match Week — pinned "starts soon" strip (docs 04 §4.1).
 *
 * When a reserved session starts within two hours this takes the top of the
 * dashboard, above the savings hero. It is a STATE, not a reordering: savings
 * lead on the majority of visits where nothing is imminent, and when something
 * is, the Join button — join clicks are the metric the campaign is judged
 * on — must never be buried.
 *
 * Pure client time math on props with a minute tick; this component never
 * fetches. Join is a plain <a>: /api/class-match/sessions/[id]/join is a route
 * handler that records the join click, issues the coupon and 302s to Meet.
 */

import { useEffect, useState } from 'react';

export type ImminentSession = {
  sessionId: string;
  title: string;
  teacherName: string;
  /** ISO timestamp of the session start. */
  scheduledAt: string;
  durationMinutes: number;
};

const WINDOW_MS = 2 * 60 * 60 * 1000;

export default function ImminentStrip({ sessions }: { sessions: ImminentSession[] }) {
  // null until mounted: the server's clock is not the client's, and rendering
  // nothing on the first paint avoids a hydration mismatch on the minute count.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  if (now === null) return null;

  // Imminent = inside [start − 2h, start + duration): counting down, or live
  // right now. The soonest one wins when several qualify.
  const live = sessions
    .map((s) => ({ ...s, startMs: new Date(s.scheduledAt).getTime() }))
    .filter((s) => Number.isFinite(s.startMs))
    .filter((s) => s.startMs - WINDOW_MS <= now && now < s.startMs + s.durationMinutes * 60_000)
    .sort((a, b) => a.startMs - b.startMs)[0];

  if (!live) return null;

  const minutes = Math.max(1, Math.round((live.startMs - now) / 60_000));
  const message =
    live.startMs > now
      ? `${live.teacherName} starts in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
      : `${live.teacherName} is live now`;

  return (
    <div className="sticky top-2 z-40">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-brand-deep px-4 py-3 text-white shadow-card">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{message}</p>
        <a
          href={`/api/class-match/sessions/${live.sessionId}/join`}
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-bold text-brand-deep transition-colors hover:bg-mint"
        >
          Join
        </a>
      </div>
    </div>
  );
}
