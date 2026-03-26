'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CompleteGoogleRolePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?auth=complete-role');
  }, [router]);

  return null;
}
