'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import JoinCommunitySection from './JoinCommunitySection';
import type { SubjectCommunityWithSchool } from '@/lib/types/subject-communities';

interface CommunitiesPageClientProps {
  initialJoinable: SubjectCommunityWithSchool[];
  hasSchool?: boolean;
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

  return (
    <JoinCommunitySection
      initialCommunities={initialJoinable}
      onRefresh={() => router.refresh()}
    />
  );
}
