'use client';

/**
 * QuestProgress — a segmented bar showing how many steps of a short checklist
 * are done (Quests 1/3, weekly goal days).
 *
 * Done segments are `accent-yellow`, the rest `surface-sunken`. Pair with a
 * "1/3" count on the right of the card title — the bar alone does not say how
 * many steps there are.
 */

import { cn } from '@/lib/utils';

export interface QuestProgressProps {
  total: number;
  done: number;
  className?: string;
}

export function QuestProgress({ total, done, className }: QuestProgressProps) {
  const steps = Math.max(1, Math.floor(total || 0));
  const complete = Math.min(Math.max(0, Math.floor(done || 0)), steps);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={steps}
      aria-valuenow={complete}
      className={cn('flex gap-1', className)}
    >
      {Array.from({ length: steps }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2 flex-1 rounded-ds-full',
            i < complete ? 'bg-accent-yellow' : 'bg-surface-sunken'
          )}
        />
      ))}
    </div>
  );
}

export default QuestProgress;
