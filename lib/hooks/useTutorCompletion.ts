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
  payoutAccount: boolean;
  completed: number;
  total: number;
  listed: boolean;
  loading: boolean;
};

const EMPTY: TutorCompletion = {
  avatar: false, bio: false, subjects: false, availability: false, rate: false, videoProvider: false, payoutAccount: false,
  completed: 0, total: 6, listed: false, loading: true,
};

export function useTutorCompletion(profile: Profile | null, refreshKey = 0): TutorCompletion {
  const [extras, setExtras] = useState({ bio: false, subjects: false, availability: false, rate: false, videoProvider: false, payoutAccount: false });
  const [loading, setLoading] = useState(true);
  const [internalKey, setInternalKey] = useState(0);

  const query = useCallback(async (id: string) => {
    const [profileRow, subjects, avail, video, payout] = await Promise.all([
      supabase.from('profiles').select('bio').eq('id', id).single(),
      supabase.from('tutor_subjects').select('price_per_hour_ttd').eq('tutor_id', id),
      supabase.from('tutor_availability_rules').select('id', { count: 'exact', head: true }).eq('tutor_id', id),
      supabase.from('tutor_video_provider_connections').select('id', { count: 'exact', head: true }).eq('tutor_id', id),
      supabase.from('tutor_payout_accounts').select('tutor_id', { count: 'exact', head: true }).eq('tutor_id', id),
    ]);
    const subjectRows = subjects.data ?? [];
    setExtras({
      bio: (profileRow.data?.bio?.trim().length ?? 0) > 0,
      subjects: subjectRows.length > 0,
      availability: (avail.count ?? 0) > 0,
      rate: subjectRows.some((s) => (s.price_per_hour_ttd ?? 0) > 0),
      videoProvider: (video.count ?? 0) > 0,
      payoutAccount: (payout.count ?? 0) > 0,
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
  const requiredSteps = [avatar, extras.bio, extras.availability, extras.rate, extras.payoutAccount];
  const allSteps = [...requiredSteps, extras.videoProvider];
  const completed = allSteps.filter(Boolean).length;

  return {
    avatar,
    bio: extras.bio,
    subjects: extras.subjects,
    availability: extras.availability,
    rate: extras.rate,
    videoProvider: extras.videoProvider,
    payoutAccount: extras.payoutAccount,
    completed,
    total: 6,
    listed: requiredSteps.every(Boolean),
    loading,
  };
}
