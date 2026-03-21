'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor, GroupFilters } from '@/lib/types/groups';
import GroupGridCard from '@/components/groups/GroupGridCard';
import GroupFiltersPanel from '@/components/groups/GroupFilters';
import CreateGroupModal from '@/components/groups/tutor/CreateGroupModal';
import GroupDetailsModal from '@/components/groups/student/GroupDetailsModal';

interface GroupsPageClientProps {
  currentUserId: string;
  userRole: 'student' | 'tutor' | 'parent';
  isTutor: boolean;
}

export default function GroupsPageClient({
  currentUserId,
  userRole,
  isTutor,
}: GroupsPageClientProps) {
  const router = useRouter();
  const [myGroups, setMyGroups] = useState<GroupWithTutor[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<GroupWithTutor[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [filters, setFilters] = useState<GroupFilters>({});
  const [sortBy, setSortBy] = useState<'latest' | 'rating' | 'members' | 'price' | 'nextSession'>('latest');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectedGroupForModal, setSelectedGroupForModal] = useState<string | null>(null);

  // Split a flat groups array into my-groups and discover
  const splitGroups = useCallback((all: GroupWithTutor[]) => {
    if (isTutor) {
      setMyGroups(all.filter((g) => g.tutor_id === currentUserId));
      setDiscoverGroups(all.filter((g) => g.tutor_id !== currentUserId));
    } else {
      setMyGroups(all.filter((g) => g.current_user_membership !== null));
      setDiscoverGroups(all.filter((g) => g.current_user_membership === null));
    }
  }, [currentUserId, isTutor]);

  // Initial load — one call, no filters
  const fetchAll = useCallback(async () => {
    setPageLoading(true);
    try {
      const res = await fetch('/api/groups');
      if (res.ok) splitGroups((await res.json()).groups ?? []);
    } finally {
      setPageLoading(false);
    }
  }, [splitGroups]);

  // Called when filters change — re-fetches discover section only
  const fetchDiscover = useCallback(async () => {
    const hasFilters = (filters.subjects?.length ?? 0) > 0 || !!filters.tutor_name;
    if (!hasFilters) { fetchAll(); return; }

    setDiscoverLoading(true);
    try {
      const params = new URLSearchParams();
      if ((filters.subjects?.length ?? 0) > 0) {
        // API currently accepts a single `subject` filter string.
        params.set('subject', filters.subjects![0]!);
      }
      if (filters.tutor_name) params.set('tutor_name', filters.tutor_name);
      if (filters.form_level) params.set('formLevel', String(filters.form_level));
      if (filters.min_rating !== undefined) params.set('minRating', String(filters.min_rating));
      if (filters.min_price !== undefined) params.set('minPrice', String(filters.min_price));
      if (filters.max_price !== undefined) params.set('maxPrice', String(filters.max_price));
      if (filters.session_frequency) params.set('sessionFrequency', filters.session_frequency);
      if (filters.availability) params.set('availability', filters.availability);
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      const res = await fetch(`/api/groups?${params.toString()}`);
      if (res.ok) {
        const all: GroupWithTutor[] = (await res.json()).groups ?? [];
        if (isTutor) setDiscoverGroups(all.filter((g) => g.tutor_id !== currentUserId));
        else setDiscoverGroups(all.filter((g) => g.current_user_membership === null));
      }
    } finally {
      setDiscoverLoading(false);
    }
  }, [filters, currentUserId, isTutor, fetchAll, sortBy, sortDir]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  // Re-run discover when filters change (skip on initial empty filter)
  useEffect(() => {
    if ((filters.subjects?.length ?? 0) > 0 || !!filters.tutor_name) fetchDiscover();
  }, [filters, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAskToJoin = async (groupId: string) => {
    if (joiningGroupId) return;
    setJoiningGroupId(groupId);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, { method: 'POST' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to send join request.');
      }
      // Refresh lists so pending membership appears in "My Groups".
      await fetchAll();
    } catch (err: any) {
      alert(err?.message || 'Unable to send join request.');
    } finally {
      setJoiningGroupId(null);
    }
  };

  // ─── TUTOR LAYOUT: marketplace-style cards ───────────────────────────────
  if (isTutor) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4 lg:p-6 bg-gray-50/60">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Group Marketplace</h1>
            <p className="text-sm text-gray-500 mt-0.5">Create, manage, and discover group sessions</p>
          </div>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <span className="text-lg leading-none">+</span> Create Group
          </button>
        </div>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">My Groups</h2>
            {myGroups.length > 0 && <span className="text-xs text-gray-400">{myGroups.length} total</span>}
          </div>
          {pageLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : myGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
              You haven't created any groups yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {myGroups.map((g) => (
                <GroupGridCard
                  key={g.id}
                  group={g}
                  onClick={() => router.push(`/groups/${g.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Discover More Groups</h2>
          <div className="mb-4">
            <div className="flex flex-col gap-3">
              <GroupFiltersPanel filters={filters} onChange={setFilters} />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Sort by</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                >
                  <option value="latest">Latest</option>
                  <option value="rating">Rating</option>
                  <option value="members">Members</option>
                  <option value="price">Price</option>
                  <option value="nextSession">Next session</option>
                </select>
                <select
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as any)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>
          </div>
          {discoverLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : discoverGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
              No groups found. Try adjusting your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {discoverGroups.map((g) => (
                <GroupGridCard
                  key={g.id}
                  group={g}
                  onClick={() => router.push(`/groups/${g.id}`)}
                  onAskToJoin={() => handleAskToJoin(g.id)}
                  joining={joiningGroupId === g.id}
                />
              ))}
            </div>
          )}
        </section>

        {showCreateGroup && (
          <CreateGroupModal
            onCreated={(id) => { setShowCreateGroup(false); void fetchAll(); router.push(`/groups/${id}`); }}
            onClose={() => setShowCreateGroup(false)}
          />
        )}
      </div>
    );
  }

  // ─── STUDENT LAYOUT (sidebar + grid) ─────────────────────────────────────
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4 lg:p-6 bg-gray-50/60">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discover Group Sessions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Find curated learning circles and join instantly</p>
        </div>
      </div>

      <div className="flex gap-6 items-start w-full">
        {/* ── My Groups sidebar (compact) ── */}
        <aside className="flex flex-col w-52 flex-shrink-0 border border-gray-200 rounded-2xl overflow-hidden bg-white self-start">
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Groups</h2>
          </div>
          {pageLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" />
            </div>
          ) : myGroups.length === 0 ? (
            <div className="px-3 py-5 text-center">
              <p className="text-xs text-gray-400">You haven't joined any groups yet.</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {myGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => router.push(`/groups/${g.id}`)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-xs font-semibold text-gray-800 truncate leading-snug">{g.name}</p>
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{g.tutor?.full_name}</p>
                  {g.current_user_membership?.status === 'pending' && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-semibold">Pending</span>
                  )}
                  {g.current_user_membership?.status === 'approved' && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">Member</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ── Find New Groups (grid) ── */}
        <div className="flex-1 min-w-0 border-l border-gray-200 pl-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Marketplace</h2>
            <div className="flex flex-col gap-3">
              <GroupFiltersPanel filters={filters} onChange={setFilters} />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Sort by</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                >
                  <option value="latest">Latest</option>
                  <option value="rating">Rating</option>
                  <option value="members">Members</option>
                  <option value="price">Price</option>
                  <option value="nextSession">Next session</option>
                </select>
                <select
                  value={sortDir}
                  onChange={(e) => setSortDir(e.target.value as any)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>
          </div>

          {discoverLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : discoverGroups.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <div className="text-4xl mb-3">👥</div>
              <p className="text-sm font-medium text-gray-600">No groups found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
              {discoverGroups.map((g) => (
                <GroupGridCard
                  key={g.id}
                  group={g}
                  onClick={() => setSelectedGroupForModal(g.id)}
                  onAskToJoin={() => handleAskToJoin(g.id)}
                  joining={joiningGroupId === g.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {selectedGroupForModal && (
        <GroupDetailsModal
          groupId={selectedGroupForModal}
          onClose={() => setSelectedGroupForModal(null)}
          onMessageTutor={async () => {
            const res = await fetch(`/api/groups/${selectedGroupForModal}/private-message`, { method: 'POST' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
              alert(payload?.error || 'Unable to open tutor chat.');
              return;
            }
            if (payload?.conversationId) {
              router.push(`/student/messages/${payload.conversationId}`);
              return;
            }
            router.push('/student/messages');
          }}
          onJoinRequested={async (groupId) => {
            await handleAskToJoin(groupId);
          }}
        />
      )}
    </div>
  );
}
