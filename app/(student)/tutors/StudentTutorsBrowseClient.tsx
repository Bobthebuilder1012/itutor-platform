'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import SearchInput from '@/components/student/SearchInput';
import FilterPanel, { type GroupFiltersState } from '@/components/student/FilterPanel';
import TutorGroupCard from '@/components/student/TutorGroupCard';

type GroupItem = {
  id: string;
  title: string;
  subject: string | null;
  tutor?: { full_name?: string | null; avatar_url?: string | null } | null;
  enrollmentCount?: number;
  maxStudents?: number;
  nextSession?: { scheduledAt: string } | null;
  coverImage?: string | null;
  averageRating?: number;
  totalReviews?: number;
};

const defaultFilters: GroupFiltersState = {
  subject: '',
  difficulty: '',
  recurrenceType: '',
  minPrice: '',
  maxPrice: '',
};

async function fetchGroups(search: string, filters: GroupFiltersState, page: number) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (filters.subject) params.set('subject', filters.subject);
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.recurrenceType) params.set('recurrenceType', filters.recurrenceType);
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  params.set('page', String(page));
  params.set('limit', '9');

  const res = await fetch(`/api/groups?${params.toString()}`, { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok || payload?.success === false) throw new Error(payload?.error ?? 'Failed to load lessons');
  return payload?.data ?? { groups: [], total: 0, page, limit: 9 };
}

function InnerClient() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<GroupFiltersState>(defaultFilters);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['student-group-browse', search, filters, page],
    queryFn: () => fetchGroups(search, filters, page),
  });

  const groups: GroupItem[] = useMemo(() => data?.groups ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 9)));

  return (
    <div className="space-y-4">
      <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
      <FilterPanel
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        onReset={() => {
          setFilters(defaultFilters);
          setPage(1);
        }}
      />

      {isLoading ? (
        <p className="text-sm text-gray-600">Loading lessons...</p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">No lessons found for your filters.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <TutorGroupCard key={group.id} group={group} onOpen={(groupId) => router.push(`/student/groups/${groupId}`)} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50"
        >
          Previous
        </button>
        <p className="text-sm text-gray-600">
          Page {page} of {totalPages}
        </p>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function StudentTutorsBrowseClient() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <InnerClient />
    </QueryClientProvider>
  );
}

