'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GroupWithTutor, GroupFilters } from '@/lib/types/groups';
import GroupList from '@/components/groups/GroupList';
import GroupDetailPanel from '@/components/groups/GroupDetailPanel';
import CreateGroupModal from '@/components/groups/tutor/CreateGroupModal';

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
  const [groups, setGroups] = useState<GroupWithTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<GroupFilters>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      (filters.subjects ?? []).forEach((s) => params.append('subjects', s));
      if (filters.tutor_name) params.set('tutor_name', filters.tutor_name);

      const res = await fetch(`/api/groups?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleSelectGroup = (id: string) => {
    setSelectedGroupId(id);
    setShowMobileDetail(true);
  };

  const handleGroupUpdated = () => {
    fetchGroups();
    // If the group was archived, deselect it
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Browse, manage, or join group sessions</p>
        </div>
        {isTutor && (
          <button
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <span className="text-lg leading-none">+</span> Create Group
          </button>
        )}
      </div>

      {/* Two-column layout (desktop) / Single column (mobile) */}
      <div className="flex h-[calc(100vh-220px)] min-h-[500px]">
        {/* Left column: group list */}
        <div
          className={`
            ${showMobileDetail ? 'hidden' : 'flex'} lg:flex
            flex-col w-full lg:w-[380px] lg:flex-shrink-0
            border border-gray-200 rounded-xl overflow-hidden
          `}
        >
          <GroupList
            groups={groups}
            loading={loading}
            selectedGroupId={selectedGroupId}
            onSelectGroup={handleSelectGroup}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Right column: detail panel */}
        <div
          className={`
            ${showMobileDetail ? 'flex' : 'hidden'} lg:flex
            flex-1 flex-col ml-0 lg:ml-6 min-w-0
          `}
        >
          {selectedGroupId ? (
            <div className="border border-gray-200 rounded-xl p-5 h-full overflow-y-auto">
              <GroupDetailPanel
                groupId={selectedGroupId}
                currentUserId={currentUserId}
                userRole={userRole}
                onGroupUpdated={handleGroupUpdated}
                onClose={() => {
                  setShowMobileDetail(false);
                }}
              />
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 flex-col items-center justify-center border border-dashed border-gray-200 rounded-xl text-center p-12">
              <div className="text-5xl mb-4">👈</div>
              <p className="text-gray-500 font-medium">Select a group to view details</p>
              <p className="text-sm text-gray-400 mt-1">
                {isTutor
                  ? 'Create a group or click one to manage it.'
                  : 'Browse groups on the left and click one to preview.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          onCreated={(id) => {
            setShowCreateGroup(false);
            fetchGroups();
            setSelectedGroupId(id);
          }}
          onClose={() => setShowCreateGroup(false)}
        />
      )}
    </div>
  );
}
