'use client';

import { formatDistanceToNowStrict } from 'date-fns';

type TutorGroupCardProps = {
  group: {
    id: string;
    title: string;
    subject: string | null;
    tutor?: { full_name?: string | null; avatar_url?: string | null } | null;
    coverImage?: string | null;
    enrollmentCount?: number;
    maxStudents?: number;
    nextSession?: { scheduledAt: string } | null;
    status?: string;
  };
  onOpen: (groupId: string) => void;
};

export default function TutorGroupCard({ group, onOpen }: TutorGroupCardProps) {
  const nextSessionDate = group.nextSession?.scheduledAt ? new Date(group.nextSession.scheduledAt) : null;
  const countdown = nextSessionDate ? formatDistanceToNowStrict(nextSessionDate, { addSuffix: true }) : null;
  const capacity =
    group.maxStudents && group.maxStudents > 0
      ? `${group.enrollmentCount ?? 0}/${group.maxStudents}`
      : `${group.enrollmentCount ?? 0}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(group.id)}
      className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{group.title}</h3>
          <p className="mt-1 text-sm text-gray-600">{group.subject || 'General'}</p>
          <p className="mt-2 text-xs text-gray-500">Tutor: {group.tutor?.full_name ?? 'Tutor'}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{group.status ?? 'PUBLISHED'}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-gray-700">Capacity: {capacity}</div>
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">{countdown ? `Next: ${countdown}` : 'No upcoming session'}</div>
      </div>
    </button>
  );
}

