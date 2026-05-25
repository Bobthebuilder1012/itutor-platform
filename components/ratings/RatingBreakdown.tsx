import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarRow } from './StarInput';

export type RatingSummary = {
  average: number;
  total: number;
  dist: Record<1 | 2 | 3 | 4 | 5, number>;
};

type Props = {
  summary: RatingSummary;
  activeFilter: number | null;
  onFilter: (n: number | null) => void;
};

export function RatingBreakdown({ summary, activeFilter, onFilter }: Props) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-4xl font-bold text-ink tabular-nums">
            {summary.total > 0 ? summary.average.toFixed(1) : '—'}
          </div>
          <StarRow value={summary.average} size={16} />
          <div className="text-xs text-muted-foreground mt-1">{summary.total} reviews</div>
        </div>
        <div className="flex-1 space-y-1.5">
          {([5, 4, 3, 2, 1] as const).map((n) => {
            const count = summary.dist[n] ?? 0;
            const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
            const active = activeFilter === n;
            return (
              <button key={n} onClick={() => onFilter(active ? null : n)}
                className={cn('w-full flex items-center gap-2 rounded-md px-1.5 py-0.5 transition hover:bg-muted',
                  active && 'bg-brand/10')}>
                <div className="flex items-center gap-0.5 w-16 justify-end text-[11px] font-semibold text-muted-foreground">
                  {n} <Star className="size-3 fill-amber-400 text-amber-400" />
                </div>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] text-muted-foreground w-6 text-right tabular-nums">{count}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
