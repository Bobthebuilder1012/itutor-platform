'use client';

import { useEffect, useState } from 'react';
import { RatingBreakdown, type RatingDistribution } from './RatingBreakdown';

type Props = { classId: string };

export function ClassRatingSection({ classId }: Props) {
  const [data, setData] = useState<{
    average: number;
    count: number;
    distribution: RatingDistribution;
  } | null>(null);
  const [activeFilter, setActiveFilter] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/class/${classId}/rating-distribution`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [classId]);

  if (!data) return null;

  return (
    <RatingBreakdown
      rating={data.average}
      count={data.count}
      distribution={data.distribution}
      activeFilter={activeFilter}
      onFilterChange={setActiveFilter}
      className="mb-6"
    />
  );
}
