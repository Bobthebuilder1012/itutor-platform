'use client';

/**
 * The campaign clock. One line, pill-shaped — full-size on the landing page,
 * shrunk (`size="sm"`) at the top of the questionnaire.
 *
 * Three phases: before the campaign it counts down to the start, during it
 * counts down to the end, and afterwards it reads "Discounts still live" —
 * coupons outlive the week (redemption windows run 7–30 days), so "ended"
 * would tell someone holding a live discount that they missed it.
 */

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

function remaining(ms: number): string {
  const totalMinutes = Math.max(1, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function phrase(startsAt: string, endsAt: string, now: number): string {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Class Match Week';
  if (now < start) return `Starts in ${remaining(start - now)}`;
  if (now < end) return `Ends in ${remaining(end - now)}`;
  return 'Discounts still live';
}

export default function CountdownPill({
  startsAt,
  endsAt,
  size = 'md',
}: {
  startsAt: string;
  endsAt: string;
  size?: 'sm' | 'md';
}) {
  const [label, setLabel] = useState(() => phrase(startsAt, endsAt, Date.now()));

  useEffect(() => {
    const tick = () => setLabel(phrase(startsAt, endsAt, Date.now()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [startsAt, endsAt]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-brand-soft font-semibold text-brand-deep ${
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
      }`}
    >
      <Clock3 className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      {/* Server render and client hydration can land in different minutes. */}
      <span suppressHydrationWarning>{label}</span>
    </span>
  );
}
