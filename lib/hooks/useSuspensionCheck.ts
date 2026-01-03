'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from './useProfile';

export function useSuspensionCheck() {
  const router = useRouter();
  const { profile, loading } = useProfile();

  useEffect(() => {
    if (!loading && profile?.is_suspended) {
      router.push('/suspended');
    }
  }, [profile, loading, router]);

  return { isSuspended: profile?.is_suspended || false, loading };
}






