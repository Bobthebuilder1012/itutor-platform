'use client';

/**
 * Countdown — three yellow numerals counting down to the next class.
 *
 * ONLY USE ON INK GROUNDS. The cells are `ink-raised` and the numerals
 * `accent-yellow`, which is a pairing that only works inside an ink feature
 * card. On a light ground the yellow would fail contrast badly.
 *
 * Numerals use the display face with tabular figures so they do not jitter as
 * they change, and pad to two digits.
 */

import { cn } from '@/lib/utils';

export interface CountdownProps {
  days: number;
  hours: number;
  minutes: number;
  className?: string;
}

function pad(n: number): string {
  const safe = Math.max(0, Math.floor(n || 0));
  return safe < 10 ? `0${safe}` : String(safe);
}

export function Countdown({ days, hours, minutes, className }: CountdownProps) {
  const cells: Array<[string, number]> = [
    ['Days', days],
    ['Hrs', hours],
    ['Min', minutes],
  ];

  return (
    <div role="timer" className={cn('grid grid-cols-3 gap-ds-2', className)}>
      {cells.map(([unit, value]) => (
        <div key={unit} className="rounded-ds-sm bg-ink-raised px-3 py-[10px]">
          <span className="block font-display font-extrabold text-[30px] leading-[30px] tabular-nums text-accent-yellow">
            {pad(value)}
          </span>
          <span className="mt-[6px] block font-extrabold text-[11px] uppercase tracking-[0.88px] text-on-ink-muted">
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Countdown;
