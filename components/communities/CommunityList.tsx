'use client';

import { useState } from 'react';
import type { CommunityV2WithInstitution } from '@/lib/types/communities';
import CommunityCard from './CommunityCard';
import CreateCommunityModal from './CreateCommunityModal';
import { joinCommunityAction } from '@/lib/communities/actions';

type CommunityWithMembership = CommunityV2WithInstitution & {
  membership: { muted: boolean; muted_until: string | null };
};

interface CommunityListProps {
  myCommunities: CommunityWithMembership[];
  joinableCommunities: CommunityV2WithInstitution[];
  onRefresh: () => void;
  ensureError?: string | null;
  hasInstitution?: boolean;
}

export default function CommunityList({
  myCommunities,
  joinableCommunities,
  onRefresh,
  ensureError,
  hasInstitution = false,
}: CommunityListProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  const handleEnsureSchool = async () => {
    setEnsuring(true);
    try {
      const res = await fetch('/api/communities/ensure-membership', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data.success) onRefresh();
    } finally {
      setEnsuring(false);
    }
  };

  const handleJoin = async (communityId: string) => {
    setJoiningId(communityId);
    await joinCommunityAction(communityId);
    setJoiningId(null);
    onRefresh();
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">My communities</h2>
        {myCommunities.length === 0 ? (
          <div className="space-y-2">
            <p className="text-gray-500 text-sm">You haven’t joined any communities yet.</p>
            {hasInstitution && (
              <button
                type="button"
                onClick={handleEnsureSchool}
                disabled={ensuring}
                className="rounded-xl bg-itutor-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {ensuring ? 'Adding you…' : 'Join your school community'}
              </button>
            )}
            {ensureError && (
              <p className="text-amber-700 text-sm">
                We couldn’t add you to your school community. Make sure your school is set in your profile or contact support.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {myCommunities.map((c) => (
              <li key={c.id}>
                <CommunityCard
                  community={c}
                  membership={c.membership}
                  onLeave={onRefresh}
                  onMuteChange={onRefresh}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Discover</h2>
        {joinableCommunities.length > 0 && (
          <ul className="space-y-2 mb-4">
            {joinableCommunities.map((c) => (
              <li key={c.id}>
                <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-100 flex items-center justify-center text-lg font-semibold text-gray-500">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      c.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{c.name}</p>
                    {c.description && (
                      <p className="text-sm text-gray-500 truncate">{c.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleJoin(c.id)}
                    disabled={joiningId === c.id}
                    className="flex-shrink-0 rounded-xl bg-itutor-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {joiningId === c.id ? 'Joining…' : 'Join'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-itutor-green hover:text-itutor-green hover:bg-gray-50"
        >
          Create community
        </button>
      </section>

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
