'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GroupsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/lessons'); }, [router]);
  return null;
}
