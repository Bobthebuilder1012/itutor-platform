'use client';

import type { GroupWithTutor, GroupFilters } from '@/lib/types/groups';
import GroupCard from './GroupCard';
import GroupFiltersPanel from './GroupFilters';

interface GroupListProps {
  groups: GroupWithTutor[];
  loading: boolean;
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
  filters: GroupFilters;
  onFiltersChange: (f: GroupFilters) => void;
}

export default function GroupList({
  groups,
  loading,
  selectedGroupId,
  onSelectGroup,
  filters,
  onFiltersChange,
}: GroupListProps) {
  return (
    <div className="flex flex-col h-full">
      <GroupFiltersPanel filters={filters} onChange={onFiltersChange} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-sm font-medium text-gray-600">No groups found</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or check back later.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              selected={g.id === selectedGroupId}
              onClick={() => onSelectGroup(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
