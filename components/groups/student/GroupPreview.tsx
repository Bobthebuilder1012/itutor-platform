'use client';

import { useState } from 'react';
import type { GroupWithTutor, GroupSessionWithOccurrences } from '@/lib/types/groups';
import ProfilePictureRow from '../shared/ProfilePictureRow';
import StatusBadge from '../shared/StatusBadge';

interface GroupPreviewProps {
  group: GroupWithTutor & { sessions?: GroupSessionWithOccurrences[] };
  onJoinRequested: () => void;
}

const DAY_LABELS: Record<number, string> = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday',
};

function formatTime(time: string) {
  const [h, m] = time.split(':');
  const d = new Date();
  d.setHours(parseInt(h), parseInt(m));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function getSessionScheduleLine(session: GroupSessionWithOccurrences): string {
  if (session.recurrence_type === 'weekly') {
    const days = (session.recurrence_days ?? []).map((d) => DAY_LABELS[d]).join(' & ');
    return `Weekly · ${days} · ${formatTime(session.start_time)} · ${session.duration_minutes} min`;
  }
  if (session.recurrence_type === 'daily') {
    return `Daily · ${formatTime(session.start_time)} · ${session.duration_minutes} min`;
  }
  const d = new Date(session.starts_on);
  return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${formatTime(session.start_time)} · ${session.duration_minutes} min`;
}

function getNextDate(session: GroupSessionWithOccurrences): string | null {
  const next = (session.occurrences ?? [])
    .filter((o) => o.status === 'upcoming' && new Date(o.scheduled_start_at) > new Date())
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())[0];
  if (!next) return null;
  return new Date(next.scheduled_start_at).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export default function GroupPreview({ group, onJoinRequested }: GroupPreviewProps) {
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'sent' | 'error'>(
    group.current_user_membership?.status === 'pending' ? 'sent' : 'idle'
  );

  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const sessions = (group as any).sessions ?? [];

  const handleRequestJoin = async () => {
    setRequestState('loading');
    try {
      const res = await fetch(`/api/groups/${group.id}/members`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to send request');
      setRequestState('sent');
      onJoinRequested();
    } catch {
      setRequestState('error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Group Overview */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">{group.name}</h2>
        <div className="mt-2 flex items-center gap-3">
          {group.tutor?.avatar_url ? (
            <img src={group.tutor.avatar_url} alt={tutorName} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
              {tutorName.charAt(0)}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-800">{tutorName}</p>
            {group.subject && <p className="text-xs text-gray-500">{group.subject}</p>}
          </div>
        </div>

        {group.description && (
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">{group.description}</p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <StatusBadge variant="free" />
          <span className="text-xs text-gray-400">Paid options coming soon</span>
        </div>

        {group.member_count > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <ProfilePictureRow profiles={group.member_previews} totalCount={group.member_count} size="md" />
            <span className="text-xs text-gray-500">
              {group.member_count} member{group.member_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <hr className="border-gray-100" />

      {/* Section 2: Session Schedule */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Sessions</h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions scheduled yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s: GroupSessionWithOccurrences) => {
              const nextDate = getNextDate(s);
              return (
                <div key={s.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-800">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{getSessionScheduleLine(s)}</p>
                  {nextDate && (
                    <p className="text-xs text-emerald-600 mt-1">Next: {nextDate}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Schedules may change at the tutor&apos;s discretion.
        </p>
      </div>

      <hr className="border-gray-100" />

      {/* Section 3: Join Action */}
      <div>
        {requestState === 'sent' ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">Request Sent</p>
            <p className="text-xs text-emerald-600 mt-1">
              The tutor will review your request. You&apos;ll be notified when approved.
            </p>
          </div>
        ) : (
          <button
            onClick={handleRequestJoin}
            disabled={requestState === 'loading'}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {requestState === 'loading' ? 'Sending request…' : 'Request to Join'}
          </button>
        )}
        {requestState === 'error' && (
          <p className="mt-2 text-xs text-red-500 text-center">
            Something went wrong. Please try again.
          </p>
        )}
        <p className="mt-3 text-xs text-gray-400 text-center">
          Access to session links and messages is granted after approval.
        </p>
      </div>
    </div>
  );
}
