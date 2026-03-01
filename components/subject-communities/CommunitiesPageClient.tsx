'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import JoinCommunitySection from './JoinCommunitySection';
import type { SubjectCommunityWithSchool } from '@/lib/types/subject-communities';

interface CommunitiesPageClientProps {
  initialJoinable: SubjectCommunityWithSchool[];
  hasSchool?: boolean;
  hasFormLevel?: boolean;
  role?: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';
}

function getSettingsPath(role: string): string {
  switch (role) {
    case 'student': return '/student/settings';
    case 'tutor': return '/tutor/settings';
    case 'parent': return '/parent/settings';
    default: return '/student/settings';
  }
}

export default function CommunitiesPageClient({
  initialJoinable,
  hasSchool = false,
  hasFormLevel = false,
  role = 'student',
}: CommunitiesPageClientProps) {
  const router = useRouter();
  const settingsPath = getSettingsPath(role);

  if (!hasSchool) {
    return (
      <section className="space-y-3" aria-label="Join a community">
        <h2 className="text-lg font-semibold text-gray-900">Join a Community</h2>
        <p className="text-sm text-gray-500 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          Set your school in your profile to discover and join subject communities.{' '}
          <Link href={settingsPath} className="font-medium text-itutor-green hover:underline">
            Go to settings
          </Link>
        </p>
      </section>
    );
  }

  if (!hasFormLevel) {
    return (
      <section className="space-y-3" aria-label="Join a community">
        <h2 className="text-lg font-semibold text-gray-900">Join a Community</h2>
        <p className="text-sm text-gray-500 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          Set your form level in Settings so we can show you communities for your year.{' '}
          <Link href={settingsPath} className="font-medium text-itutor-green hover:underline">
            Go to settings
          </Link>
        </p>
      </section>
    );
  }

  // Ensure subject communities exist for school in background so join list can populate
  useEffect(() => {
    if (!hasSchool) return;
    fetch('/api/subject-communities/ensure', { method: 'POST' })
      .then(() => router.refresh())
      .catch(() => {});
  }, [hasSchool, router]);

  return (
    <JoinCommunitySection
      initialCommunities={initialJoinable}
      onRefresh={() => router.refresh()}
    />
  );
}
