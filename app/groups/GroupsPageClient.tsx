'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor, GroupFilters } from '@/lib/types/groups';
import GroupGridCard from '@/components/groups/GroupGridCard';
import GroupDetailPanel from '@/components/groups/GroupDetailPanel';
import GroupFiltersPanel from '@/components/groups/GroupFilters';
import CreateGroupModal from '@/components/groups/tutor/CreateGroupModal';
import GroupDetailsModal from '@/components/groups/student/GroupDetailsModal';

interface GroupsPageClientProps {
  currentUserId: string;
  userRole: 'student' | 'tutor' | 'parent';
  isTutor: boolean;
}

type TutorQuickFilter = 'all' | 'free' | 'paid' | 'upcoming' | 'highlyRated';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [quickFilter, setQuickFilter] = useState<TutorQuickFilter>('all');

  const [archivedGroups, setArchivedGroups] = useState<GroupWithTutor[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restoringGroupId, setRestoringGroupId] = useState<string | null>(null);
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

  const fetchArchived = useCallback(async () => {
    if (!isTutor) return;
    setArchivedLoading(true);
    try {
      const res = await fetch('/api/groups?archived=true');
      if (res.ok) setArchivedGroups((await res.json()).groups ?? []);
    } finally {
      setArchivedLoading(false);
    }
  }, [isTutor]);

  const handleRestore = async (groupId: string) => {
    if (restoringGroupId) return;
    setRestoringGroupId(groupId);
    try {
      const res = await fetch(`/api/groups/${groupId}/restore`, { method: 'POST' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to restore class');
      }
      await Promise.all([fetchAll(), fetchArchived()]);
    } catch (err: any) {
      alert(err?.message || 'Failed to restore class');
    } finally {
      setRestoringGroupId(null);
    }
  };

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

  useEffect(() => { fetchAll(); fetchArchived(); }, [fetchAll, fetchArchived]);
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
      // Refresh lists so pending membership appears in "My Lessons".
      await fetchAll();
    } catch (err: any) {
      alert(err?.message || 'Unable to send join request.');
    } finally {
      setJoiningGroupId(null);
    }
  };

  const tutorSubjectOptions = useMemo(() => {
    const subjectSet = new Set<string>();
    for (const group of discoverGroups) {
      const subjects = (group as any).subject_list?.length ? (group as any).subject_list : group.subject ? [group.subject] : [];
      for (const subject of subjects) {
        if (subject) subjectSet.add(subject);
      }
    }
    return Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
  }, [discoverGroups]);

  const tutorFilteredGroups = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    const getPriceValue = (group: GroupWithTutor) =>
      Number(
        (group as any).pricePerSession ??
        (group as any).price_per_session ??
        (group as any).pricePerCourse ??
        (group as any).price_per_course ??
        0
      );

    const filtered = discoverGroups.filter((group) => {
      const subjects = (group as any).subject_list?.length ? (group as any).subject_list : group.subject ? [group.subject] : [];
      const matchesSearch =
        !normalizedSearch ||
        group.name.toLowerCase().includes(normalizedSearch) ||
        (group.subject ?? '').toLowerCase().includes(normalizedSearch) ||
        (group.tutor?.full_name ?? '').toLowerCase().includes(normalizedSearch) ||
        subjects.some((subject: string) => subject.toLowerCase().includes(normalizedSearch));

      const matchesSubject = !subjectFilter || subjects.includes(subjectFilter) || group.subject === subjectFilter;
      const effectivePrice = getPriceValue(group);
      const isPaid = effectivePrice > 0;
      const matchesPriceFilter =
        priceFilter === 'all' ||
        (priceFilter === 'free' && !isPaid) ||
        (priceFilter === 'paid' && isPaid);

      const ratingAverage = Number(group.tutor?.rating_average ?? 0);
      const ratingCount = Number(group.tutor?.rating_count ?? 0);
      const matchesQuickFilter =
        quickFilter === 'all' ||
        (quickFilter === 'free' && !isPaid) ||
        (quickFilter === 'paid' && isPaid) ||
        (quickFilter === 'upcoming' && !!group.next_occurrence) ||
        (quickFilter === 'highlyRated' && ratingCount > 0 && ratingAverage >= 4.5);

      return matchesSearch && matchesSubject && matchesPriceFilter && matchesQuickFilter;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'rating') {
        return Number(b.tutor?.rating_average ?? 0) - Number(a.tutor?.rating_average ?? 0);
      }
      if (sortBy === 'members') {
        return Number(b.member_count ?? 0) - Number(a.member_count ?? 0);
      }
      if (sortBy === 'price') {
        return getPriceValue(a) - getPriceValue(b);
      }
      if (sortBy === 'nextSession') {
        const aTime = a.next_occurrence ? new Date(a.next_occurrence.scheduled_start_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.next_occurrence ? new Date(b.next_occurrence.scheduled_start_at).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }, [discoverGroups, priceFilter, quickFilter, searchQuery, sortBy, subjectFilter]);

  // ─── TUTOR LAYOUT: marketplace-style cards ───────────────────────────────
  if (isTutor) {
    return (
      <div className="h-full min-h-0 overflow-y-auto px-6 py-8 lg:px-8 bg-[#f6f8fb]" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-extrabold text-gray-900 tracking-tight">Lesson Marketplace</h1>
            <p className="text-[15px] text-slate-500 mt-1">Create, manage, and discover lesson sessions</p>
          </div>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-lg text-sm font-semibold transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_16px_rgba(16,185,129,0.4)] hover:-translate-y-px"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Create a Class
          </button>
        </div>

        <section className="mb-10">
          <div className="mb-[18px] flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">My Lessons</h2>
            {myGroups.length > 0 && (
              <span className="text-[13px] text-slate-500 bg-gray-100 px-3 py-1 rounded-full font-medium">
                {myGroups.length} total
              </span>
            )}
          </div>
          {pageLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : myGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
              You haven't created any lessons yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
          <div className="mb-[18px] flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Discover More Lessons</h2>
          </div>
          <div className="mb-5">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px_160px_140px] gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search lessons by name, subject, or tutor..."
                  className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-900 placeholder:text-slate-400 outline-none transition-all focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-100"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-900 outline-none transition-all focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-100"
                >
                  <option value="latest">Sort by: Latest</option>
                  <option value="rating">Sort by: Rating</option>
                  <option value="members">Sort by: Members</option>
                  <option value="price">Sort by: Price</option>
                  <option value="nextSession">Sort by: Next session</option>
                </select>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-900 outline-none transition-all focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-100"
                >
                  <option value="">All Subjects</option>
                  {tutorSubjectOptions.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
                <select
                  value={priceFilter}
                  onChange={(e) => setPriceFilter(e.target.value as 'all' | 'free' | 'paid')}
                  className="rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-900 outline-none transition-all focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-100"
                >
                  <option value="all">All Prices</option>
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'free', label: 'Free' },
                  { id: 'paid', label: 'Paid' },
                  { id: 'upcoming', label: 'Upcoming Sessions' },
                  { id: 'highlyRated', label: 'Highly Rated' },
                ].map((option) => {
                  const active = quickFilter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setQuickFilter(option.id as TutorQuickFilter)}
                      className={`rounded-[20px] px-3.5 py-1.5 text-[12px] font-semibold transition-all border ${
                        active
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {discoverLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : tutorFilteredGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
              No lessons found. Try adjusting your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {tutorFilteredGroups.map((g) => (
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
        </section>

        {archivedGroups.length > 0 && (
          <section className="mt-10">
            <div className="mb-[18px] flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Archived Lessons</h2>
              <span className="text-[13px] text-slate-500 bg-gray-100 px-3 py-1 rounded-full font-medium">
                {archivedGroups.length} archived
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {archivedGroups.map((g) => (
                <div key={g.id} className="relative opacity-70 hover:opacity-100 transition-opacity">
                  <GroupGridCard group={g} onClick={() => {}} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/95 to-transparent pt-10 pb-3 px-4 rounded-b-xl flex items-end justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Archived</span>
                      {g.archived_at && (
                        <p className="text-[11px] text-slate-400">
                          {new Date(g.archived_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRestore(g.id)}
                      disabled={restoringGroupId === g.id}
                      className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-[12px] font-semibold transition-all disabled:opacity-50"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                      {restoringGroupId === g.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {showCreateGroup && (
          <CreateGroupModal
            onCreated={(id) => { setShowCreateGroup(false); void fetchAll(); router.push(`/groups/${id}`); }}
            onClose={() => setShowCreateGroup(false)}
          />
        )}
        {selectedGroupForModal && (
          <div className="fixed inset-0 z-[70] bg-black/40 p-4 md:p-8 overflow-y-auto" onClick={() => setSelectedGroupForModal(null)}>
            <div
              className="mx-auto flex h-[min(90vh,900px)] w-full max-w-7xl rounded-2xl bg-white shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex w-full min-h-0 flex-col">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Lesson details</h2>
                  <button onClick={() => setSelectedGroupForModal(null)} className="text-gray-400 hover:text-gray-600">Close</button>
                </div>
                <div className="flex-1 min-h-0">
                  <GroupDetailPanel
                    groupId={selectedGroupForModal}
                    currentUserId={currentUserId}
                    userRole={userRole}
                    onGroupUpdated={() => {
                      void fetchAll();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── STUDENT LAYOUT (sidebar + grid) ─────────────────────────────────────
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4 lg:p-6 bg-gray-50/60">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discover Lesson Sessions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Find curated learning circles and join instantly</p>
        </div>
      </div>

      <div className="flex gap-6 items-start w-full">
        {/* ── My Groups sidebar (compact) ── */}
        <aside className="flex flex-col w-52 flex-shrink-0 border border-gray-200 rounded-2xl overflow-hidden bg-white self-start">
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Lessons</h2>
          </div>
          {pageLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" />
            </div>
          ) : myGroups.length === 0 ? (
            <div className="px-3 py-5 text-center">
              <p className="text-xs text-gray-400">You haven't joined any lessons yet.</p>
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
              <p className="text-sm font-medium text-gray-600">No lessons found</p>
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

