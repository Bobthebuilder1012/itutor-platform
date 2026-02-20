'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { CommunityV2WithInstitution } from '@/lib/types/communities';
import CommunityListMenu from './CommunityListMenu';

interface CommunityCardProps {
  community: CommunityV2WithInstitution;
  membership?: { muted: boolean; muted_until: string | null };
  onLeave?: () => void;
  onMuteChange?: () => void;
}

export default function CommunityCard({
  community,
  membership,
  onLeave,
  onMuteChange,
}: CommunityCardProps) {
  const muted = membership?.muted ?? false;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 transition-colors">
      <Link href={`/communities/${community.id}`} className="flex flex-1 min-w-0 items-center gap-3">
        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
          {community.avatar_url ? (
            <Image
              src={community.avatar_url}
              alt=""
              fill
              className="object-cover"
              sizes="48px"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-gray-500">
              {community.name.charAt(0).toUpperCase()}
            </span>
          )}
          {muted && (
            <span
              className="absolute bottom-0 right-0 rounded-full bg-gray-600 p-0.5"
              title="Muted"
              aria-label="Muted"
            >
              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.076L4.235 12H1a1 1 0 01-1-1V9a1 1 0 011-1h3.235l4.148-3.924zM14.657 5.343a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">{community.name}</p>
          {community.description && (
            <p className="text-sm text-gray-500 truncate">{community.description}</p>
          )}
        </div>
      </Link>
      <CommunityListMenu
        communityId={community.id}
        communityName={community.name}
        muted={muted}
        onLeave={onLeave}
        onMuteChange={onMuteChange}
      />
    </div>
  );
}
