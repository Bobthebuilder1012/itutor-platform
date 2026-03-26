'use client';

import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { SubjectCommunityWithSchool } from '@/lib/types/subject-communities';

interface MyCommunitiesSectionProps {
  communities: SubjectCommunityWithSchool[];
}

function communityDisplayName(c: SubjectCommunityWithSchool): string {
  return `${c.form_level} ${c.subject_name}`;
}

export default function MyCommunitiesSection({ communities }: MyCommunitiesSectionProps) {
  if (communities.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="My communities">
      <h2 className="text-lg font-semibold text-gray-900">My Communities</h2>
      <ul className="space-y-2">
        {communities.map((c) => (
          <li key={c.id}>
            <Link
              href={`/communities/subject/${c.id}`}
              className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 hover:border-itutor-green/30"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">
                  {communityDisplayName(c)}
                </p>
                <p className="text-sm text-gray-500">
                  {c.member_count.toLocaleString()} members
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-gray-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
