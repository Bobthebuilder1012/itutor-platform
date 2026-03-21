'use client';

import { formatDistanceToNowStrict } from 'date-fns';

type GroupCardData = {
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

export default function TutorGroupCard({
  group,
  onOpen,
}: {
  group: GroupCardData;
  onOpen: (groupId: string) => void;
}) {
  const next = group.nextSession?.scheduledAt ? new Date(group.nextSession.scheduledAt) : null;
  const countdown = next ? formatDistanceToNowStrict(next, { addSuffix: true }) : null;
  const capacity = group.maxStudents ? `${group.enrollmentCount ?? 0}/${group.maxStudents}` : `${group.enrollmentCount ?? 0}`;
  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const initials = tutorName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onOpen(group.id)}
      className="group w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg"
    >
      <div className="relative h-40 w-full bg-gradient-to-r from-emerald-100 to-cyan-100">
        {group.coverImage ? (
          <img
            src={group.coverImage}
            alt={group.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-4xl">🎓</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
            {group.subject || 'General'}
          </span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Free
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold leading-snug text-gray-900 line-clamp-2 min-h-[2.75rem]">{group.title}</h3>

        <div className="mt-2 flex items-center gap-2">
          {group.tutor?.avatar_url ? (
            <img src={group.tutor.avatar_url} alt={tutorName} className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center">
              {initials}
            </div>
          )}
          <p className="text-sm text-gray-700 truncate">{tutorName}</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <span className="rounded-lg bg-gray-100 px-2.5 py-2 text-gray-700">Capacity {capacity}</span>
          <span className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-700">
            {group.totalReviews ? `${group.averageRating?.toFixed(1)} (${group.totalReviews})` : 'No reviews'}
          </span>
        </div>

        <p className="mt-3 text-xs font-medium text-blue-700">
          {countdown ? `Next session ${countdown}` : 'No upcoming session'}
        </p>
      </div>
    </button>
  );
}

