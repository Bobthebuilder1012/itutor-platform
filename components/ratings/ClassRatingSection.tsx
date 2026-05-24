'use client';

import { useEffect, useState } from 'react';
import { ClassPageSection } from './ClassPageSection';
import type { RatingDistribution } from './RatingBreakdown';

type Props = {
  classId: string;
  /** If true, also renders the comment section below the rating breakdown */
  withComments?: boolean;
};

export function ClassRatingSection({ classId, withComments = true }: Props) {
  const [data, setData] = useState<{
    average: number;
    count: number;
    distribution: RatingDistribution;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/class/${classId}/rating-distribution`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [classId]);

  if (!data) return null;

  if (withComments) {
    return (
      <ClassPageSection
        classId={classId}
        rating={data.average}
        count={data.count}
        distribution={data.distribution}
      />
    );
  }

  return null;
}
