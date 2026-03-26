'use client';

import { useRouter } from 'next/navigation';
import type { CommunityV2WithInstitution } from '@/lib/types/communities';
import CommunityList from './CommunityList';

type CommunityWithMembership = CommunityV2WithInstitution & {
  membership: { muted: boolean; muted_until: string | null };
};

interface CommunitiesListClientProps {
  myCommunities: CommunityWithMembership[];
  joinableCommunities: CommunityV2WithInstitution[];
  ensureError?: string | null;
  hasInstitution?: boolean;
}

export default function CommunitiesListClient({
  myCommunities,
  joinableCommunities,
  ensureError,
  hasInstitution,
}: CommunitiesListClientProps) {
  const router = useRouter();
  return (
    <CommunityList
      myCommunities={myCommunities}
      joinableCommunities={joinableCommunities}
      onRefresh={() => router.refresh()}
      ensureError={ensureError}
      hasInstitution={hasInstitution}
    />
  );
}
