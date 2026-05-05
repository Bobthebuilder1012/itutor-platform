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
}

function SkeletonBlock({ w, h, radius = 8 }: { w?: string; h: number; radius?: number }) {
  return (
    <div style={{
      width: w ?? '100%', height: h, borderRadius: radius,
      background: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'skshimmer 1.4s infinite',
      flexShrink: 0,
    }} />
  );
}

function LessonDetailSkeleton() {
  return (
    <div className="h-full overflow-y-auto bg-[#f4f6fa]">
      <style>{`@keyframes skshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Hero banner */}
      <div style={{ height: 200, background: 'linear-gradient(90deg,#e0e0e0 25%,#d0d0d0 50%,#e0e0e0 75%)', backgroundSize: '200% 100%', animation: 'skshimmer 1.4s infinite', position: 'relative' }}>
        <style>{`@keyframes skshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        {/* Icon placeholder */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 72, height: 72, borderRadius: 18, background: 'rgba(255,255,255,0.25)' }} />
      </div>

      {/* Floating info card */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 28px' }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', marginTop: -60, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title */}
              <SkeletonBlock w="55%" h={26} radius={6} />
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <SkeletonBlock w="80px" h={22} radius={20} />
                <SkeletonBlock w="100px" h={22} radius={20} />
              </div>
              {/* Stats row */}
              <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                {[80, 70, 90, 75].map((w, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <SkeletonBlock w={`${w}px`} h={20} radius={4} />
                    <SkeletonBlock w="48px" h={12} radius={4} />
                  </div>
                ))}
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <SkeletonBlock w="120px" h={38} radius={10} />
              <SkeletonBlock w="38px" h={38} radius={10} />
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginTop: 20, marginBottom: 20 }}>
          {[90, 80, 75, 95, 80].map((w, i) => (
            <SkeletonBlock key={i} w={`${w}px`} h={34} radius={8} />
          ))}
        </div>

        {/* Content rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 40 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #f0f2f5', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SkeletonBlock w="36px" h={36} radius={18} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonBlock w="40%" h={14} radius={4} />
                  <SkeletonBlock w="60%" h={12} radius={4} />
                </div>
              </div>
              <SkeletonBlock h={14} radius={4} />
              <SkeletonBlock w="75%" h={14} radius={4} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GroupDetailPanel({
  groupId,
  currentUserId,
  userRole,
  onGroupUpdated,
}: GroupDetailPanelProps) {
  const [group, setGroup] = useState<GroupWithTutor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (!res.ok) throw new Error('Class not found');
      const data = await res.json();
      setGroup(data.group);
    } catch {
      setError('Could not load class details.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  if (loading) {
    return <LessonDetailSkeleton />;
  }

  if (error || !group) {
    return (
      <div className="h-full flex items-center justify-center py-24 text-center">
        <div>
          <p className="text-gray-400 text-sm">{error || 'Class not found.'}</p>
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
    <div className="h-full min-h-0 flex flex-col flex-1">
      <div className="flex-1 min-h-0 overflow-hidden">
        {isTutorOwner ? (
          <TutorGroupView
            group={group}
            currentUserId={currentUserId}
            onGroupUpdated={handleGroupUpdated}
          />
        ) : isApprovedMember ? (
          <GroupMemberView group={group} currentUserId={currentUserId} />
        ) : (
          <div className="h-full overflow-y-auto">
            <GroupPreview group={group} onJoinRequested={fetchGroup} />
          </div>
        )}
      </div>
    </div>
  );
}
