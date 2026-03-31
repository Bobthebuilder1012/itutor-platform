'use client';

import type { GroupWithTutor } from '@/lib/types/groups';
import UserAvatar from '@/components/UserAvatar';
import ProfilePictureRow from './shared/ProfilePictureRow';
import StatusBadge from './shared/StatusBadge';

interface GroupGridCardProps {
  group: GroupWithTutor;
  onClick: () => void;
  onAskToJoin?: () => void;
  joining?: boolean;
}

export default function GroupGridCard({ group, onClick, onAskToJoin, joining = false }: GroupGridCardProps) {
  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const tutorRating = group.tutor?.rating_average;
  const tutorReviewCount = group.tutor?.rating_count ?? 0;
  const coverImage =
    (group as any).cover_image ??
    (group as any).coverImage ??
    (group as any).header_image ??
    (group as any).headerImage ??
    null;
  const subjects: string[] =
    (group as any).subject_list?.length > 0
      ? (group as any).subject_list
      : group.subject
      ? [group.subject]
      : [];
  const membershipStatus = group.current_user_membership?.status;
  const isManageCard = !onAskToJoin && membershipStatus !== 'approved' && membershipStatus !== 'pending';
  const formLevel = (group as any).formLevel ?? (group as any).form_level ?? null;
  const sessionLengthMinutes =
    (group as any).sessionLengthMinutes ?? (group as any).session_length_minutes ?? null;
  const sessionFrequency =
    (group as any).sessionFrequency ?? (group as any).session_frequency ?? (group as any).recurrenceType ?? null;
  const effectivePrice =
    (group as any).pricePerSession ??
    (group as any).price_per_session ??
    (group as any).pricePerCourse ??
    (group as any).price_per_course ??
    null;
  const nextSession = group.next_occurrence
    ? new Date(group.next_occurrence.scheduled_start_at).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const estimatedEarnings = Number((group as any).estimated_earnings ?? 0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group w-full overflow-hidden text-left bg-white border border-gray-200 rounded-2xl hover:border-emerald-300 hover:shadow-lg transition-all duration-200 cursor-pointer"
    >
      <div className="relative aspect-[16/9] bg-gradient-to-br from-emerald-100 via-teal-100 to-cyan-100">
        {coverImage ? (
          <img
            src={coverImage}
            alt={group.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl">📚</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          <StatusBadge variant="free" label="Free" />
          {membershipStatus === 'approved' && <StatusBadge variant="active" label="Member" />}
          {membershipStatus === 'pending' && <StatusBadge variant="pending" label="Requested" />}
        </div>
        {subjects.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                {subjects[0]}
              </span>
              {formLevel && (
                <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                  {String(formLevel).replaceAll('_', ' ')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <h3 className="text-base font-bold text-gray-900 leading-snug group-hover:text-emerald-700 transition-colors line-clamp-2 min-h-[2.75rem]">
          {group.name}
        </h3>

        <div className="flex items-center gap-2">
          <UserAvatar avatarUrl={group.tutor?.avatar_url} name={tutorName} size={32} className="flex-shrink-0" />
          <span className="text-sm text-gray-700 truncate">{tutorName}</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm">
          <svg
            className="w-4 h-4 text-yellow-400 fill-current"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          {tutorRating !== null && tutorRating !== undefined && tutorReviewCount > 0 ? (
            <>
              <span className="font-semibold text-gray-900">{tutorRating.toFixed(1)}</span>
              <span className="text-gray-500">({tutorReviewCount})</span>
            </>
          ) : (
            <span className="text-gray-500">No reviews yet</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Members</p>
            <p className="text-sm font-semibold text-gray-800">{group.member_count}</p>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-blue-400 font-semibold">Next</p>
            <p className="text-sm font-semibold text-blue-700 truncate">{nextSession ?? 'Not scheduled'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-gray-50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Length</p>
            <p className="text-xs font-semibold text-gray-800">{sessionLengthMinutes ? `${sessionLengthMinutes} min` : 'N/A'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Frequency</p>
            <p className="text-xs font-semibold text-gray-800 truncate">{sessionFrequency ? String(sessionFrequency) : 'N/A'}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-emerald-500 font-semibold">Price</p>
            <p className="text-xs font-semibold text-emerald-700">{effectivePrice ? `$${Number(effectivePrice)}` : 'Free'}</p>
          </div>
        </div>

        {isManageCard && (
          <div className="rounded-lg bg-violet-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-violet-500 font-semibold">Earnings</p>
            <p className="text-sm font-semibold text-violet-700">${estimatedEarnings.toFixed(2)}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
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
            <span className="text-xs text-gray-400">No members yet</span>
          )}
          <span className="text-xs font-semibold text-emerald-600">Free</span>
        </div>

      </div>
    </div>
  );
}
