'use client';

import type { GroupWithTutor } from '@/lib/types/groups';
import ProfilePictureRow from './shared/ProfilePictureRow';
import StatusBadge from './shared/StatusBadge';

interface GroupCardProps {
  group: GroupWithTutor;
  selected: boolean;
  onClick: () => void;
}

function formatNextSession(occ: GroupWithTutor['next_occurrence']) {
  if (!occ) return null;
  const d = new Date(occ.scheduled_start_at);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function GroupCard({ group, selected, onClick }: GroupCardProps) {
  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const nextDate = formatNextSession(group.next_occurrence);
  const membershipStatus = group.current_user_membership?.status;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-gray-100 transition-colors ${
        selected
          ? 'bg-emerald-50 border-l-2 border-l-emerald-500'
          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
      }`}
    >
      {/* Group name + membership badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-sm font-semibold leading-snug ${selected ? 'text-emerald-700' : 'text-gray-800'}`}>
          {group.name}
        </h3>
        {membershipStatus === 'approved' && (
          <StatusBadge variant="active" label="Member" className="flex-shrink-0" />
        )}
        {membershipStatus === 'pending' && (
          <StatusBadge variant="pending" label="Requested" className="flex-shrink-0" />
        )}
      </div>

      {/* Tutor name */}
      <p className="text-xs text-gray-500 mt-0.5">{tutorName}</p>

      {/* Subjects */}
      {(group as any).subject_list?.length > 0 ? (
        <p className="text-xs text-gray-400 mt-0.5">
          {(group as any).subject_list.join(' · ')}
        </p>
      ) : group.subject ? (
        <p className="text-xs text-gray-400 mt-0.5">{group.subject}</p>
      ) : null}

      {/* Member preview row */}
      {group.member_count > 0 && (
        <div className="mt-2">
          <ProfilePictureRow
            profiles={group.member_previews.map((p) => ({
              id: p.id,
              full_name: p.full_name ?? null,
              avatar_url: p.avatar_url ?? null,
            }))}
            totalCount={group.member_count}
            size="sm"
          />
        </div>
      )}

      {/* Footer: price + next session */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <StatusBadge variant="free" label="Free" />
        {nextDate && (
          <span className="text-[10px] text-gray-400">Next: {nextDate}</span>
        )}
      </div>
    </button>
  );
}
