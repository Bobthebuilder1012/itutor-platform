'use client';

import type { Profile } from '@/lib/types/database';

type TutorCompletion = {
  loading: boolean;
  /** True when the tutor's profile is complete enough to be listed and create classes */
  listed: boolean;
};

/**
 * Derives tutor listing eligibility from the already-loaded profile.
 * A tutor is considered "listed" once they have submitted their profile
 * for verification (status is 'pending' or 'verified').
 */
export function useTutorCompletion(profile: Profile | null | undefined): TutorCompletion {
  if (profile === undefined) return { loading: true, listed: false };
  if (profile === null) return { loading: false, listed: false };

  const status = profile.tutor_verification_status;
  const listed = status === 'verified' || status === 'pending';

  return { loading: false, listed };
}
