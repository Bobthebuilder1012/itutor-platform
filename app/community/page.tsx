'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirect /community (singular) to the new list at /communities. */
export default function CommunityRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/communities');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
    </div>
  );
}
