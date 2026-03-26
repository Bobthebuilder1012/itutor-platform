'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { CommunityV2WithInstitution } from '@/lib/types/communities';
import { joinCommunityAction } from '@/lib/communities/actions';

interface CommunityJoinGateProps {
  community: CommunityV2WithInstitution;
  communityId: string;
  userName: string;
  role: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';
}

export default function CommunityJoinGate({
  community,
  communityId,
  userName,
  role,
}: CommunityJoinGateProps) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    if (community.type === 'SCHOOL') {
      const res = await fetch('/api/communities/ensure-membership', { method: 'POST' });
      const result = await res.json().catch(() => ({}));
      if (result.success) {
        router.refresh();
        return;
      }
      setError(result.error ?? 'Could not join');
    } else {
      const result = await joinCommunityAction(communityId);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.error ?? 'Could not join');
    }
    setJoining(false);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm max-w-md mx-auto text-center">
      <div className="flex justify-center mb-4">
        {community.avatar_url ? (
          <Image
            src={community.avatar_url}
            alt=""
            width={64}
            height={64}
            className="rounded-full h-16 w-16 object-cover"
          />
        ) : (
          <span className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-semibold text-gray-600">
            {community.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{community.name}</h1>
      {community.description && (
        <p className="text-gray-600 text-sm mb-4">{community.description}</p>
      )}
      <p className="text-gray-500 text-sm mb-4">Join this community to view and post messages.</p>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <button
        type="button"
        onClick={handleJoin}
        disabled={joining}
        className="px-4 py-2 rounded-xl bg-itutor-green text-white font-medium hover:opacity-90 disabled:opacity-50"
      >
        {joining ? 'Joining…' : 'Join'}
      </button>
    </div>
  );
}
