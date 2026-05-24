'use client';

import { useState } from 'react';
import { RatingBreakdown, type RatingDistribution } from './RatingBreakdown';
import { CommentSection } from '@/components/comments/CommentSection';

type Props = {
  classId: string;
  rating: number;
  count: number;
  distribution: RatingDistribution;
};

export function ClassPageSection({ classId, rating, count, distribution }: Props) {
  const [starFilter, setStarFilter] = useState<number | null>(null);

  return (
    <>
      <div className="mb-6">
        <RatingBreakdown
          rating={rating}
          count={count}
          distribution={distribution}
          activeFilter={starFilter}
          onFilterChange={setStarFilter}
        />
      </div>
      <CommentSection
        targetType="class"
        targetId={classId}
        starFilter={starFilter}
        onClearFilter={() => setStarFilter(null)}
      />
    </>
  );
}
