'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function GrowthRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/tutor/business'); }, [router]);
  return null;
}
