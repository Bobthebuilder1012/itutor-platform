'use client';

import { useState } from 'react';
import { ClassRatingBanner } from './ClassRatingBanner';
import { ClassRatingModal } from './ClassRatingModal';
import { useRatingPrompts } from '@/lib/hooks/useRatingPrompts';

/**
 * Drop-in component for the student dashboard.
 * Manages the full prompt queue + modal lifecycle.
 */
export function RatingPromptContainer() {
  const { prompts, loading, refetch, snooze } = useRatingPrompts();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading || prompts.length === 0) return null;

  const current = prompts[0];

  return (
    <>
      <ClassRatingBanner
        prompt={current}
        onRateNow={() => setModalOpen(true)}
        onSnooze={async () => {
          await snooze(current.id);
        }}
      />
      {modalOpen && (
        <ClassRatingModal
          prompt={current}
          onClose={() => setModalOpen(false)}
          onSuccess={async () => {
            setModalOpen(false);
            await refetch();
          }}
        />
      )}
    </>
  );
}
