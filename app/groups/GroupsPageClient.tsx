'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor, GroupFilters } from '@/lib/types/groups';
import GroupCard from '@/components/groups/GroupCard';
import GroupGridCard from '@/components/groups/GroupGridCard';
import GroupFiltersPanel from '@/components/groups/GroupFilters';
import GroupDetailPanel from '@/components/groups/GroupDetailPanel';
import CreateGroupModal from '@/components/groups/tutor/CreateGroupModal';
import StatusBadge from '@/components/groups/shared/StatusBadge';

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
  const [filters, setFilters] = useState<GroupFilters>({});

  // Tutor-only panel state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

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
      (filters.subjects ?? []).forEach((s) => params.append('subjects', s));
      if (filters.tutor_name) params.set('tutor_name', filters.tutor_name);
      const res = await fetch(`/api/groups?${params.toString()}`);
      if (res.ok) {
        const all: GroupWithTutor[] = (await res.json()).groups ?? [];
        if (isTutor) setDiscoverGroups(all.filter((g) => g.tutor_id !== currentUserId));
        else setDiscoverGroups(all.filter((g) => g.current_user_membership === null));
      }
    } finally {
      setDiscoverLoading(false);
    }
  }, [filters, currentUserId, isTutor, fetchAll]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  // Re-run discover when filters change (skip on initial empty filter)
  useEffect(() => {
    if ((filters.subjects?.length ?? 0) > 0 || !!filters.tutor_name) fetchDiscover();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGroupUpdated = () => { fetchAll(); };

  // ─── TUTOR LAYOUT (unchanged two-column panel) ───────────────────────────
  if (isTutor) {
    return (
      <div>
        {!selectedGroupId && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
              <p className="text-sm text-gray-500 mt-0.5">Browse, manage, or join group sessions</p>
            </div>
            <button
              onClick={() => setShowCreateGroup(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              <span className="text-lg leading-none">+</span> Create Group
            </button>
          </div>
        )}

        <div className="flex h-[calc(100vh-220px)] min-h-[500px]">
          <div className={`${showMobileDetail ? 'hidden' : 'flex'} lg:flex flex-col w-full lg:w-[380px] lg:flex-shrink-0 border border-gray-200 rounded-xl overflow-hidden`}>
            <div className="flex-1 overflow-y-auto">
              {/* My Groups */}
              <div className="border-b border-gray-200">
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Groups</h2>
                  {myGroups.length > 0 && <span className="text-xs text-gray-400">{myGroups.length}</span>}
                </div>
                {pageLoading ? (
                  <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>
                ) : myGroups.length === 0 ? (
                  <p className="px-4 pb-4 text-xs text-gray-400 text-center">You haven't created any groups yet.</p>
                ) : (
                  myGroups.map((g) => (
                    <GroupCard key={g.id} group={g} selected={g.id === selectedGroupId} onClick={() => { setSelectedGroupId(g.id); setShowMobileDetail(true); }} />
                  ))
                )}
              </div>
              {/* Find New Groups */}
              <div>
                <div className="px-4 pt-4 pb-2">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Find New Groups</h2>
                </div>
                <div className="border-b border-gray-100">
                  <GroupFiltersPanel filters={filters} onChange={setFilters} />
                </div>
                {discoverLoading ? (
                  <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>
                ) : discoverGroups.length === 0 ? (
                  <div className="flex flex-col items-center py-10 px-6 text-center">
                    <div className="text-3xl mb-2">👥</div>
                    <p className="text-sm font-medium text-gray-600">No groups found</p>
                    <p className="text-xs text-gray-400 mt-1">Try adjusting your filters.</p>
                  </div>
                ) : (
                  discoverGroups.map((g) => (
                    <GroupCard key={g.id} group={g} selected={g.id === selectedGroupId} onClick={() => { setSelectedGroupId(g.id); setShowMobileDetail(true); }} />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className={`${showMobileDetail ? 'flex' : 'hidden'} lg:flex flex-1 flex-col ml-0 lg:ml-6 min-w-0`}>
            {selectedGroupId ? (
              <div className="border border-gray-200 rounded-xl p-5 h-full overflow-y-auto">
                <GroupDetailPanel
                  groupId={selectedGroupId}
                  currentUserId={currentUserId}
                  userRole={userRole}
                  onGroupUpdated={handleGroupUpdated}
                  onClose={() => { setShowMobileDetail(false); setSelectedGroupId(null); }}
                />
              </div>
            ) : (
              <div className="hidden lg:flex flex-1 flex-col items-center justify-center border border-dashed border-gray-200 rounded-xl text-center p-12">
                <div className="text-5xl mb-4">👈</div>
                <p className="text-gray-500 font-medium">Select a group to manage it</p>
                <p className="text-sm text-gray-400 mt-1">Create a group or click one to manage it.</p>
              </div>
            )}
          </div>
        </div>

        {showCreateGroup && (
          <CreateGroupModal
            onCreated={(id) => { setShowCreateGroup(false); fetchMyGroups(); fetchDiscover(); setSelectedGroupId(id); }}
            onClose={() => setShowCreateGroup(false)}
          />
        )}
      </div>
    );
  }

  // ─── STUDENT LAYOUT (sidebar + grid) ─────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Browse and join group sessions</p>
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
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Find New Groups</h2>
            <GroupFiltersPanel filters={filters} onChange={setFilters} />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {discoverGroups.map((g) => (
                <GroupGridCard
                  key={g.id}
                  group={g}
                  onClick={() => router.push(`/groups/${g.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
