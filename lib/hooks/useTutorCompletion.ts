'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';

export const COMPLETION_UPDATED_EVENT = 'tutor-completion-updated';

/** Call after any save on the get-listed page to refresh all hook instances. */
export function notifyCompletionUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COMPLETION_UPDATED_EVENT));
  }
}

export type TutorCompletion = {
  avatar: boolean;
  bio: boolean;
  subjects: boolean;
  availability: boolean;
  rate: boolean;
  videoProvider: boolean;
  completed: number;
  total: number;
  listed: boolean;
  loading: boolean;
};

const EMPTY: TutorCompletion = {
  avatar: false, bio: false, subjects: false, availability: false, rate: false, videoProvider: false,
  completed: 0, total: 5, listed: false, loading: true,
};

export function useTutorCompletion(profile: Profile | null, refreshKey = 0): TutorCompletion {
  const [extras, setExtras] = useState({ subjects: false, availability: false, rate: false, videoProvider: false });
  const [loading, setLoading] = useState(true);
  const [internalKey, setInternalKey] = useState(0);

  const query = useCallback(async (id: string) => {
    const [subjects, avail, video] = await Promise.all([
      supabase.from('tutor_subjects').select('price_per_hour_ttd').eq('tutor_id', id),
      supabase.from('tutor_availability_rules').select('id', { count: 'exact', head: true }).eq('tutor_id', id),
      supabase.from('tutor_video_provider_connections').select('id', { count: 'exact', head: true }).eq('tutor_id', id),
    ]);
    const subjectRows = subjects.data ?? [];
    setExtras({
      subjects: subjectRows.length > 0,
      availability: (avail.count ?? 0) > 0,
      rate: subjectRows.some((s) => (s.price_per_hour_ttd ?? 0) > 0),
      videoProvider: (video.count ?? 0) > 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setLoading(true);
    query(profile.id).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, refreshKey, internalKey]);

  // Re-query whenever any instance dispatches the update event
  useEffect(() => {
    const handler = () => setInternalKey((k) => k + 1);
    window.addEventListener(COMPLETION_UPDATED_EVENT, handler);
    return () => window.removeEventListener(COMPLETION_UPDATED_EVENT, handler);
  }, []);

  if (!profile) return EMPTY;

  const avatar = Boolean(profile.avatar_url);
  const bio = (profile.bio?.trim().length ?? 0) > 0;
  // subjects is tracked for reference but not counted — captured during signup
  // video provider is the 5th required step
  const completed = [avatar, bio, extras.availability, extras.rate, extras.videoProvider].filter(Boolean).length;

  return {
    avatar, bio,
    subjects: extras.subjects,
    availability: extras.availability,
    rate: extras.rate,
    videoProvider: extras.videoProvider,
    completed,
    total: 5,
    listed: completed === 5,
    loading,
  };
}
