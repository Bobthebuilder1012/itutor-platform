'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GroupWithTutor } from '@/lib/types/groups';
import GroupPreview from './student/GroupPreview';
import GroupMemberView from './student/GroupMemberView';
import TutorGroupView from './tutor/TutorGroupView';

interface GroupDetailPanelProps {
  groupId: string;
  currentUserId: string;
  userRole: 'student' | 'tutor' | 'parent';
  onGroupUpdated: () => void;
  onClose?: () => void;
}

export default function GroupDetailPanel({
  groupId,
  currentUserId,
  userRole,
  onGroupUpdated,
  onClose,
}: GroupDetailPanelProps) {
  const [group, setGroup] = useState<GroupWithTutor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) throw new Error('Group not found');
      const data = await res.json();
      setGroup(data.group);
    } catch {
      setError('Could not load group details.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="h-full flex items-center justify-center py-24 text-center">
        <div>
          <p className="text-gray-400 text-sm">{error || 'Group not found.'}</p>
          <button onClick={fetchGroup} className="mt-3 text-xs text-emerald-600 hover:underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const isTutorOwner = group.tutor_id === currentUserId;
  const membership = group.current_user_membership;
  const isApprovedMember = membership?.status === 'approved';

  const handleGroupUpdated = () => {
    fetchGroup();
    onGroupUpdated();
  };

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Mobile back button */}
      {onClose && (
        <button
          onClick={onClose}
          className="lg:hidden flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to groups
        </button>
      )}

      {/* Route to correct view */}
      {isTutorOwner ? (
        <TutorGroupView
          group={group}
          currentUserId={currentUserId}
          onGroupUpdated={handleGroupUpdated}
        />
      ) : isApprovedMember ? (
        <GroupMemberView group={group} currentUserId={currentUserId} />
      ) : (
        <GroupPreview group={group} onJoinRequested={fetchGroup} />
      )}
    </div>
  );
}
