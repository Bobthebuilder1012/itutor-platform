'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RatingPrompt } from '@/components/ratings/ClassRatingModal';

type UseRatingPromptsReturn = {
  prompts: RatingPrompt[];
  loading: boolean;
  refetch: () => Promise<void>;
  snooze: (id: string) => Promise<void>;
};

export function useRatingPrompts(): UseRatingPromptsReturn {
  const [prompts, setPrompts] = useState<RatingPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/ratings/prompts');
      if (!res.ok) return;
      const data: RatingPrompt[] = await res.json();
      setPrompts(data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const snooze = useCallback(
    async (id: string) => {
      await fetch(`/api/ratings/prompts/${id}/snooze`, { method: 'POST' });
      await fetchPrompts();
    },
    [fetchPrompts],
  );

  return { prompts, loading, refetch: fetchPrompts, snooze };
}
