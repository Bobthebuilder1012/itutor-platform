'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor, GroupSessionWithOccurrences } from '@/lib/types/groups';
import GroupMessageBoard from '../messages/GroupMessageBoard';
import ProfilePictureRow from '../shared/ProfilePictureRow';
import StatusBadge from '../shared/StatusBadge';

type Tab = 'sessions' | 'messages';

interface GroupMemberViewProps {
  group: GroupWithTutor;
  currentUserId: string;
}

function isOutdated(session: GroupSessionWithOccurrences): boolean {
  const upcoming = session.occurrences.filter((o) => o.status === 'upcoming');
  if (upcoming.length === 0) return false;
  const latest = upcoming[upcoming.length - 1];
  const lastStart = new Date(latest.scheduled_start_at);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return lastStart < sevenDaysAgo;
}

function formatOccurrence(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function GroupMemberView({ group, currentUserId }: GroupMemberViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('sessions');
  const [sessions, setSessions] = useState<GroupSessionWithOccurrences[]>([]);
  const [sessionsLoading, setSessioinsLoading] = useState(true);
  const [dmLoading, setDmLoading] = useState(false);

  const tutorName = group.tutor?.full_name ?? 'Tutor';

  const fetchSessions = useCallback(async () => {
    setSessioinsLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } finally {
      setSessioinsLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleMessageTutor = async () => {
    setDmLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/private-message`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      router.push(`/student/messages/${data.conversationId}`);
    } catch {
      alert('Could not open conversation. Please try again.');
    } finally {
      setDmLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Section 1: Group Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{group.name}</h2>
          <div className="mt-1 flex items-center gap-2">
            {group.tutor?.avatar_url ? (
              <img src={group.tutor.avatar_url} alt={tutorName} className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-semibold">
                {tutorName.charAt(0)}
              </div>
            )}
            <span className="text-sm text-gray-600">{tutorName}</span>
          </div>
          {group.member_count > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <ProfilePictureRow profiles={group.member_previews} totalCount={group.member_count} size="sm" />
              <span className="text-xs text-gray-500">{group.member_count} members</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge variant="active" />
          <button
            onClick={handleMessageTutor}
            disabled={dmLoading}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {dmLoading ? 'Opening…' : '✉ Message Tutor'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['sessions', 'messages'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab: Sessions */}
      {tab === 'sessions' && (
        <div>
          {sessionsLoading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <div className="text-3xl mb-2">📅</div>
              No sessions scheduled yet.
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((s) => {
                const upcoming = s.occurrences
                  .filter((o) => o.status === 'upcoming' && new Date(o.scheduled_start_at) > new Date())
                  .slice(0, 3);
                const outdated = isOutdated(s);

                return (
                  <div key={s.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800">{s.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.recurrence_type === 'none' ? 'One-time session' : `Recurring ${s.recurrence_type}`}
                          {' · '}{s.duration_minutes} min
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        {outdated && <StatusBadge variant="outdated" />}
                      </div>
                    </div>

                    {upcoming.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {upcoming.map((occ) => (
                          <li key={occ.id} className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            {formatOccurrence(occ.scheduled_start_at)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-gray-400">No upcoming occurrences.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Messages */}
      {tab === 'messages' && (
        <div className="h-[480px] flex flex-col">
          <GroupMessageBoard
            groupId={group.id}
            isTutor={false}
            currentUserId={currentUserId}
          />
        </div>
      )}
    </div>
  );
}
