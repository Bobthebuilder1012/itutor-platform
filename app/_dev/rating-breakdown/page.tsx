'use client';

import { useState } from 'react';
import { RatingBreakdown } from '@/components/ratings/RatingBreakdown';

const SCENARIOS = [
  {
    label: 'Zero state',
    props: { rating: 0, count: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
  },
  {
    label: 'Low count (3 ratings)',
    props: {
      rating: 4.33,
      count: 3,
      distribution: { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 },
    },
  },
  {
    label: 'Mostly 5s',
    props: {
      rating: 4.82,
      count: 56,
      distribution: { 5: 48, 4: 6, 3: 1, 2: 0, 1: 1 },
    },
  },
  {
    label: 'Bell curve',
    props: {
      rating: 3.45,
      count: 120,
      distribution: { 5: 15, 4: 30, 3: 40, 2: 25, 1: 10 },
    },
  },
] as const;

export default function RatingBreakdownDevPage() {
  const [filter, setFilter] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-ink">RatingBreakdown — QA Playground</h1>

        {SCENARIOS.map((s) => (
          <div key={s.label} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {s.label}
            </h2>
            <RatingBreakdown
              {...s.props}
              activeFilter={filter}
              onFilterChange={setFilter}
            />
          </div>
        ))}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Active filter state (click a bar above to set)
          </h2>
          <p className="text-sm text-muted-foreground">
            Current filter: {filter !== null ? `${filter} stars` : 'none'}
          </p>
        </div>
      </div>
    </div>
  );
}
