'use client';

import { useState } from 'react';
import type { GroupSessionWithOccurrences } from '@/lib/types/groups';
import StatusBadge from '../shared/StatusBadge';

interface SessionRowProps {
  session: GroupSessionWithOccurrences;
  groupId: string;
  onRefresh: () => void;
}

const DAY_LABELS: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

function isOutdated(session: GroupSessionWithOccurrences): boolean {
  const occs = session.occurrences ?? [];
  const upcoming = occs.filter(
    (o) => o.status === 'upcoming' && new Date(o.scheduled_start_at) > new Date()
  );
  if (upcoming.length === 0) return occs.some((o) => o.status === 'upcoming');
  return false;
}

function getNextOccurrence(session: GroupSessionWithOccurrences) {
  return (session.occurrences ?? [])
    .filter((o) => o.status === 'upcoming' && new Date(o.scheduled_start_at) > new Date())
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())[0];
}

function formatTime(time: string) {
  const [h, m] = time.split(':');
  const d = new Date();
  d.setHours(parseInt(h), parseInt(m));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function SessionRow({ session, groupId, onRefresh }: SessionRowProps) {
  const [deleting, setDeleting] = useState(false);
  const next = getNextOccurrence(session);
  const outdated = isOutdated(session);

  const recurrenceSummary =
    session.recurrence_type === 'weekly'
      ? `Weekly · ${(session.recurrence_days ?? []).map((d) => DAY_LABELS[d]).join(', ')} · ${formatTime(session.start_time)}`
      : session.recurrence_type === 'daily'
      ? `Daily · ${formatTime(session.start_time)}`
      : formatTime(session.start_time);

  const handleDeleteSession = async () => {
    if (!confirm(`Delete "${session.title}" and all its occurrences?`)) return;
    setDeleting(true);
    await fetch(`/api/groups/${groupId}/sessions/${session.id}`, { method: 'DELETE' });
    setDeleting(false);
    onRefresh();
  };

  const handleCancelOccurrence = async (occurrenceId: string) => {
    if (!confirm('Cancel this single occurrence?')) return;
    await fetch(
      `/api/groups/${groupId}/sessions/${session.id}/occurrences/${occurrenceId}`,
      { method: 'DELETE' }
    );
    onRefresh();
  };

  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-800 truncate">{session.title}</h4>
            {outdated && <StatusBadge variant="outdated" />}
            {next && <StatusBadge variant="upcoming" />}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{recurrenceSummary}</p>
          <p className="text-xs text-gray-400">{session.duration_minutes} min</p>
        </div>

        <button
          onClick={handleDeleteSession}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-600 transition-colors flex-shrink-0 disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {/* Upcoming occurrences */}
      {(session.occurrences ?? []).filter((o) => o.status === 'upcoming').slice(0, 3).map((occ) => {
        const isPast = new Date(occ.scheduled_start_at) < new Date();
        return (
          <div key={occ.id} className="mt-2 flex items-center justify-between text-xs">
            <span className={`flex items-center gap-1.5 ${isPast ? 'text-gray-400' : 'text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isPast ? 'bg-gray-300' : 'bg-emerald-400'}`} />
              {new Date(occ.scheduled_start_at).toLocaleString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
            <button
              onClick={() => handleCancelOccurrence(occ.id)}
              className="text-gray-300 hover:text-red-400 transition-colors ml-2"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
