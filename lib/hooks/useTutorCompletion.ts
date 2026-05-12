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
  completed: number;
  total: number;
  listed: boolean;
};

const EMPTY: TutorCompletion = {
  avatar: false, bio: false, subjects: false, availability: false, rate: false,
  completed: 0, total: 5, listed: false,
};

/**
 * Computes tutor profile completion based on real Supabase data.
 * Tutor is "listed" once: avatar, bio (>=150 chars), at least one subject,
 * at least one availability rule, and at least one priced subject are set.
 */
export function useTutorCompletion(profile: Profile | null): TutorCompletion {
  const [extras, setExtras] = useState({ subjects: false, availability: false, rate: false });

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const [subjects, avail] = await Promise.all([
        supabase.from('tutor_subjects').select('price_per_hour_ttd').eq('tutor_id', profile.id),
        supabase.from('tutor_availability_rules').select('id', { count: 'exact', head: true }).eq('tutor_id', profile.id),
      ]);
      if (cancelled) return;
      const subjectRows = subjects.data ?? [];
      setExtras({
        subjects: subjectRows.length > 0,
        availability: (avail.count ?? 0) > 0,
        rate: subjectRows.some((s) => (s.price_per_hour_ttd ?? 0) > 0),
      });
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  if (!profile) return EMPTY;

  const avatar = Boolean(profile.avatar_url);
  const bio = (profile.bio?.trim().length ?? 0) >= 150;
  const completed = [avatar, bio, extras.subjects, extras.availability, extras.rate].filter(Boolean).length;

  return {
    avatar, bio,
    subjects: extras.subjects,
    availability: extras.availability,
    rate: extras.rate,
    completed,
    total: 5,
    listed: completed === 5,
  };
}
