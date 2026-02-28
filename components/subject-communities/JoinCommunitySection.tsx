'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SubjectCommunityWithSchool } from '@/lib/types/subject-communities';

interface JoinCommunitySectionProps {
  initialCommunities: SubjectCommunityWithSchool[];
  onRefresh: () => void;
}

function communityDisplayName(c: SubjectCommunityWithSchool): string {
  return `${c.form_level} ${c.subject_name}`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

export default function JoinCommunitySection({
  initialCommunities,
  onRefresh,
}: JoinCommunitySectionProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [communities, setCommunities] = useState(initialCommunities);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 200);

  const fetchJoinable = useCallback(async () => {
    const res = await fetch(
      `/api/subject-communities/search?q=${encodeURIComponent(debouncedSearch)}`
    );
    const data = await res.json().catch(() => ({}));
    if (data.ok && Array.isArray(data.communities)) {
      setCommunities(data.communities);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchJoinable();
  }, [fetchJoinable]);

  const handleJoin = async (communityId: string) => {
    setJoinError(null);
    setJoiningId(communityId);
    try {
      const res = await fetch('/api/subject-communities/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        onRefresh();
        router.push(`/communities/subject/${communityId}`);
      } else {
        setJoinError(data.error || 'Could not join. Try again.');
      }
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <section className="space-y-3" aria-label="Join a community">
      <h2 className="text-lg font-semibold text-gray-900">Join a Community</h2>
      <input
        type="search"
        placeholder="Search by subject (e.g. Physics, Add Maths)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm placeholder-gray-400 focus:border-itutor-green focus:outline-none focus:ring-1 focus:ring-itutor-green"
      />
      <ul className="space-y-2">
        {communities.map((c) => (
          <li key={c.id}>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">
                  {communityDisplayName(c)}
                </p>
                <p className="text-sm text-gray-500">
                  {c.member_count.toLocaleString()} members
                </p>
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
      {joinError && (
        <p className="text-sm text-red-600" role="alert">{joinError}</p>
      )}
      {communities.length === 0 && !joinError && (
        <p className="text-sm text-gray-500">
          {debouncedSearch ? 'No communities match your search.' : 'No communities available. Ensure your school is set and we have created subject communities.'}
        </p>
      )}
    </section>
  );
}
