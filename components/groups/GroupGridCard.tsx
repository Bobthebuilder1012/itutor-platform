'use client';

import type { GroupWithTutor } from '@/lib/types/groups';
import ProfilePictureRow from './shared/ProfilePictureRow';
import StatusBadge from './shared/StatusBadge';

interface GroupGridCardProps {
  group: GroupWithTutor;
  onClick: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function GroupGridCard({ group, onClick }: GroupGridCardProps) {
  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const subjects: string[] =
    (group as any).subject_list?.length > 0
      ? (group as any).subject_list
      : group.subject
      ? [group.subject]
      : [];
  const membershipStatus = group.current_user_membership?.status;

  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white border border-gray-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all duration-200 flex flex-col gap-3"
    >
      {/* Top row: group name + membership badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 leading-snug group-hover:text-emerald-700 transition-colors line-clamp-2">
          {group.name}
        </h3>
        {membershipStatus === 'approved' && (
          <StatusBadge variant="active" label="Member" className="flex-shrink-0 mt-0.5" />
        )}
        {membershipStatus === 'pending' && (
          <StatusBadge variant="pending" label="Requested" className="flex-shrink-0 mt-0.5" />
        )}
      </div>

      {/* Tutor avatar + name */}
      <div className="flex items-center gap-2">
        {group.tutor?.avatar_url ? (
          <img
            src={group.tutor.avatar_url}
            alt={tutorName}
            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            {getInitials(tutorName)}
          </div>
        )}
        <span className="text-xs text-gray-500 truncate">{tutorName}</span>
      </div>

      {/* Subjects */}
      {subjects.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {subjects.slice(0, 3).map((s) => (
            <span
              key={s}
              className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium"
            >
              {s}
            </span>
          ))}
          {subjects.length > 3 && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-[10px]">
              +{subjects.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer: members + price */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        {group.member_count > 0 ? (
          <ProfilePictureRow
            profiles={group.member_previews.map((p) => ({
              id: p.id,
              full_name: p.full_name ?? null,
              avatar_url: p.avatar_url ?? null,
            }))}
            totalCount={group.member_count}
            size="sm"
          />
        ) : (
          <span className="text-[10px] text-gray-400">No members yet</span>
        )}
        <StatusBadge variant="free" label="Free" />
      </div>
    </button>
  );
}
