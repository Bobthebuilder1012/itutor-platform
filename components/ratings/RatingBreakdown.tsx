'use client';

import { cn } from '@/lib/utils';
import { StarRow } from './StarInput';

export type RatingDistribution = {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
};

export type RatingBreakdownProps = {
  rating: number;
  count: number;
  distribution: RatingDistribution;
  onFilterChange?: (stars: number | null) => void;
  activeFilter?: number | null;
  className?: string;
};

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function distPct(distribution: RatingDistribution, count: number, stars: keyof RatingDistribution): number {
  if (count === 0) return 0;
  return (distribution[stars] / count) * 100;
}

export function RatingBreakdown({
  rating,
  count,
  distribution,
  onFilterChange,
  activeFilter,
  className,
}: RatingBreakdownProps) {
  const empty = count === 0;
  const lowCount = count > 0 && count < 5;

  const displayRating = empty
    ? '—'
    : rating.toFixed(1);

  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-white p-5 sm:p-6',
        className,
      )}
      aria-label="Rating breakdown"
    >
      <div className="grid sm:grid-cols-[auto_1fr] gap-6 sm:gap-8 items-center">
        {/* Left — overall score */}
        <div className="text-center sm:text-left">
          <div className="text-5xl sm:text-6xl font-extrabold text-ink leading-none tabular-nums">
            {displayRating}
          </div>
          <div className="mt-2 flex justify-center sm:justify-start">
            <StarRow value={empty ? 0 : rating} size={20} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {empty
              ? 'No ratings yet'
              : `${fmtCount(count)} ${count === 1 ? 'rating' : 'ratings'}`}
          </div>
        </div>

        {/* Right — distribution bars */}
        <div className="space-y-1.5 min-w-0">
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const pct = distPct(distribution, count, stars);
            const fillWidth = empty
              ? 0
              : Math.max(pct, distribution[stars] > 0 ? 3 : 0);
            const isActive = activeFilter === stars;
            const clickable = !empty && !!onFilterChange;

            return (
              <button
                key={stars}
                type="button"
                disabled={!clickable}
                onClick={() => onFilterChange?.(isActive ? null : stars)}
                className={cn(
                  'w-full flex items-center gap-2 sm:gap-3 px-1.5 py-1 rounded-md text-left transition',
                  clickable && 'hover:bg-muted',
                  isActive && 'bg-brand-soft',
                  !clickable && 'cursor-default',
                )}
                aria-pressed={isActive}
              >
                <span
                  className={cn(
                    'w-4 text-xs tabular-nums text-right',
                    isActive ? 'font-bold text-brand-deep' : 'text-muted-foreground',
                  )}
                >
                  {stars}
                </span>
                <div
                  className={cn(
                    'flex-1 h-2.5 rounded-full bg-muted overflow-hidden',
                    isActive && 'ring-2 ring-brand',
                  )}
                >
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-300"
                    style={{ width: `${fillWidth}%` }}
                  />
                </div>
                <span className="w-10 text-[11px] tabular-nums text-right text-muted-foreground">
                  {empty ? '0%' : `${Math.round(pct)}%`}
                </span>
              </button>
            );
          })}

          {lowCount && (
            <p className="text-[11px] text-muted-foreground italic pt-1">
              Based on a small number of ratings.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
