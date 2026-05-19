'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';

export default function GroupsRedirect() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  useEffect(() => {
    if (loading) return;
    if (profile?.role === 'tutor') router.replace('/tutor/lessons');
    else if (profile?.role === 'student') router.replace('/student/dashboard');
    else if (profile?.role === 'parent') router.replace('/parent/dashboard');
    else router.replace('/login');
  }, [profile, loading, router]);
  return null;
}
