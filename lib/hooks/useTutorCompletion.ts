'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';

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
};

const EMPTY: TutorCompletion = {
  avatar: false, bio: false, subjects: false, availability: false, rate: false, videoProvider: false,
  completed: 0, total: 6, listed: false,
};

export function useTutorCompletion(profile: Profile | null, refreshKey = 0): TutorCompletion {
  const [extras, setExtras] = useState({ subjects: false, availability: false, rate: false, videoProvider: false });

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const [subjects, avail, video] = await Promise.all([
        supabase.from('tutor_subjects').select('price_per_hour_ttd').eq('tutor_id', profile.id),
        supabase.from('tutor_availability_rules').select('id', { count: 'exact', head: true }).eq('tutor_id', profile.id),
        supabase.from('tutor_video_provider_connections').select('id', { count: 'exact', head: true }).eq('tutor_id', profile.id),
      ]);
      if (cancelled) return;
      const subjectRows = subjects.data ?? [];
      setExtras({
        subjects: subjectRows.length > 0,
        availability: (avail.count ?? 0) > 0,
        rate: subjectRows.some((s) => (s.price_per_hour_ttd ?? 0) > 0),
        videoProvider: (video.count ?? 0) > 0,
      });
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, refreshKey]);

  if (!profile) return EMPTY;

  const avatar = Boolean(profile.avatar_url);
  const bio = (profile.bio?.trim().length ?? 0) > 0;
  const completed = [avatar, bio, extras.subjects, extras.availability, extras.rate, extras.videoProvider].filter(Boolean).length;

  return {
    avatar, bio,
    subjects: extras.subjects,
    availability: extras.availability,
    rate: extras.rate,
    videoProvider: extras.videoProvider,
    completed,
    total: 6,
    listed: completed === 6,
  };
}
