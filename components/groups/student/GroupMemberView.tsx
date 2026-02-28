'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor, GroupSessionWithOccurrences, GroupOccurrence, GroupMember } from '@/lib/types/groups';
import GroupMessageBoard from '../messages/GroupMessageBoard';
import StatusBadge from '../shared/StatusBadge';
import AnnouncementBoard from '../announcements/AnnouncementBoard';

type Tab = 'announcements' | 'sessions' | 'messages';

interface GroupMemberViewProps {
  group: GroupWithTutor;
  currentUserId: string;
}

type OccurrenceWindowStatus = 'too_early' | 'live' | 'ended';

function getOccurrenceStatus(occ: GroupOccurrence): OccurrenceWindowStatus {
  const start = new Date(occ.scheduled_start_at).getTime();
  const end = new Date(occ.scheduled_end_at).getTime();
  const now = Date.now();
  if (now < start - 15 * 60 * 1000) return 'too_early';
  if (now > end + 30 * 60 * 1000) return 'ended';
  return 'live';
}

function isOutdated(session: GroupSessionWithOccurrences): boolean {
  const upcoming = (session.occurrences ?? []).filter((o) => o.status === 'upcoming');
  if (upcoming.length === 0) return false;
  const latest = upcoming[upcoming.length - 1];
  return new Date(latest.scheduled_start_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function formatOccurrence(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function GroupMemberView({ group, currentUserId }: GroupMemberViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('announcements');
  const [sessions, setSessions] = useState<GroupSessionWithOccurrences[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [dmLoading, setDmLoading] = useState(false);
  const [joiningOccurrenceId, setJoiningOccurrenceId] = useState<string | null>(null);

  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const approvedMembers = members.filter((m) => m.status === 'approved');

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/sessions`);
      if (res.ok) setSessions((await res.json()).sessions ?? []);
    } finally {
      setSessionsLoading(false);
    }
  }, [group.id]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/members`);
      if (res.ok) setMembers((await res.json()).members ?? []);
    } finally {
      setMembersLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    fetchSessions();
    fetchMembers();
  }, [fetchSessions, fetchMembers]);

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

  const handleJoinOccurrence = async (sessionId: string, occurrenceId: string) => {
    setJoiningOccurrenceId(occurrenceId);
    try {
      const res = await fetch(
        `/api/groups/${group.id}/sessions/${sessionId}/occurrences/${occurrenceId}/join-link`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.join_url) {
        throw new Error(data?.error || 'Could not generate meeting link');
      }
      window.open(data.join_url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err?.message || 'Could not join session. Please try again.');
    } finally {
      setJoiningOccurrenceId(null);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'announcements', label: 'Announcements' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'messages', label: 'Messages' },
  ];

  return (
    <div className="flex gap-5 h-full overflow-hidden">

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">

        {/* Group Header — fixed */}
        <div className="flex-shrink-0 flex items-start justify-between gap-3">
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

        {/* Tabs — fixed */}
        <div className="flex-shrink-0 flex border-b border-gray-200 mt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto pt-4">

        {/* Tab: Announcements */}
        {tab === 'announcements' && (
          <AnnouncementBoard groupId={group.id} isTutor={false} />
        )}

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
              <div className="space-y-5">
                {sessions.map((s) => {
                  const now = new Date();
                  // API already returns pre-trimmed occurrences (next 20 + last 2)
                  const allOccs = s.occurrences ?? [];
                  const futureOccs = allOccs.filter((o) => new Date(o.scheduled_end_at) > now);
                  const pastOccs = allOccs.filter((o) => new Date(o.scheduled_end_at) <= now);
                  const outdated = isOutdated(s);
                  const initialVisible = 1;
                  const pageSize = 5;
                  const visibleCount = visibleCounts[s.id] ?? initialVisible;
                  const visibleOccs = futureOccs.slice(0, visibleCount);
                  const hasMore = futureOccs.length > visibleCount;

                  return (
                    <div key={s.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                      {/* Session header */}
                      <div className="bg-gray-50 px-4 py-3 flex items-start justify-between gap-2 border-b border-gray-100">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-gray-900">{s.title}</h4>
                            {outdated && <StatusBadge variant="outdated" />}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {s.recurrence_type === 'none'
                              ? 'One-time session'
                              : s.recurrence_type === 'weekly'
                              ? `Weekly · ${(s.recurrence_days ?? []).map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`
                              : 'Daily'}
                            {' · '}{s.duration_minutes} min per session
                          </p>
                        </div>
                      </div>

                      {/* Upcoming occurrences */}
                      {futureOccs.length > 0 ? (
                        <div className="divide-y divide-gray-100">
                          {visibleOccs.map((occ) => {
                            const windowStatus = getOccurrenceStatus(occ);
                            const start = new Date(occ.scheduled_start_at);
                            const end = new Date(occ.scheduled_end_at);

                            return (
                              <div key={occ.id} className={`px-4 py-3 flex items-center justify-between gap-4 ${windowStatus === 'live' ? 'bg-green-50' : ''}`}>
                                <div className="flex items-start gap-3 min-w-0">
                                  {/* Status dot */}
                                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${windowStatus === 'live' ? 'bg-green-500 animate-pulse' : 'bg-emerald-400'}`} />
                                  <div className="min-w-0">
                                    {/* Date */}
                                    <p className="text-xs font-semibold text-gray-800">
                                      {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    {/* Time */}
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                      {' – '}
                                      {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                      {' · '}{s.duration_minutes} min
                                    </p>
                                    {/* Meeting link info */}
                                    {windowStatus === 'live' ? (
                                      <p className="text-[10px] font-bold text-green-600 mt-0.5 uppercase tracking-wide">● Session is live now</p>
                                    ) : (
                                      <p className="text-[10px] text-gray-400 mt-0.5">Meeting link opens 15 min before start</p>
                                    )}
                                  </div>
                                </div>

                                {/* Join button */}
                                {windowStatus === 'live' ? (
                                  <button
                                    onClick={() => handleJoinOccurrence(s.id, occ.id)}
                                    disabled={joiningOccurrenceId === occ.id}
                                    className="flex-shrink-0 inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.876v6.248a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                                    </svg>
                                    {joiningOccurrenceId === occ.id ? 'Opening…' : 'Join Now'}
                                  </button>
                                ) : (
                                  <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-gray-100 text-gray-400 text-xs font-medium px-4 py-2 rounded-xl cursor-not-allowed">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Not yet open
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {hasMore && (
                            <div className="px-4 py-3 text-center border-t border-gray-100">
                              <button
                                onClick={() => setVisibleCounts((prev) => ({ ...prev, [s.id]: visibleCount + pageSize }))}
                                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                              >
                                Show {Math.min(pageSize, futureOccs.length - visibleCount)} more sessions ↓
                              </button>
                            </div>
                          )}
                        </div>
                      ) : pastOccs.length > 0 ? (
                        <div>
                          <div className="divide-y divide-gray-100">
                            {pastOccs.map((occ) => {
                              const start = new Date(occ.scheduled_start_at);
                              const end = new Date(occ.scheduled_end_at);
                              return (
                                <div key={occ.id} className="px-4 py-3 flex items-center justify-between gap-4 opacity-60">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <span className="mt-1 w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                                    <div>
                                      <p className="text-xs font-semibold text-gray-700 line-through">
                                        {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                      </p>
                                      <p className="text-xs text-gray-400 mt-0.5">
                                        {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                        {' – '}
                                        {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="flex-shrink-0 text-[11px] text-gray-400 italic">Ended</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
                            <p className="text-xs text-amber-700 font-medium">No upcoming sessions — the tutor may add new dates soon.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-4 text-center">
                          <p className="text-xs text-gray-400">No sessions have been scheduled yet.</p>
                        </div>
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
          <div className="h-full flex flex-col">
            <GroupMessageBoard groupId={group.id} isTutor={false} currentUserId={currentUserId} />
          </div>
        )}

        </div>{/* end scrollable tab content */}
      </div>

      {/* ── Members side panel ── */}
      <aside className="flex flex-col w-52 flex-shrink-0 border border-gray-200 rounded-2xl overflow-hidden bg-white self-start">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Members</h3>
          {!membersLoading && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              {approvedMembers.length + 1}
            </span>
          )}
        </div>

        {membersLoading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" />
          </div>
        ) : (
          <div className="flex flex-col max-h-[480px] overflow-y-auto">

            {/* ── Head Tutor ── */}
            <div className="px-3 pt-2.5 pb-1">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Head Tutor</p>
            </div>
            <div className="flex items-center gap-2 px-3 pb-2.5">
              {group.tutor?.avatar_url ? (
                <img src={group.tutor.avatar_url} alt={tutorName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {tutorName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">
                  {tutorName}
                  {group.tutor_id === currentUserId && <span className="ml-1 text-gray-400">(you)</span>}
                </p>
              </div>
            </div>

            {/* ── Tutors (members who joined with tutor role) ── */}
            {(() => {
              const tutorMembers = approvedMembers.filter((m) => (m as any).profile?.role === 'tutor');
              if (tutorMembers.length === 0) return null;
              return (
                <>
                  <div className="px-3 pt-2 pb-1 border-t border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Tutors</p>
                  </div>
                  {tutorMembers.map((m) => {
                    const profile = (m as any).profile;
                    const name: string = profile?.full_name ?? 'Tutor';
                    const avatar: string | null = profile?.avatar_url ?? null;
                    const isMe = m.user_id === currentUserId;
                    return (
                      <div key={m.id} className="flex items-center gap-2 px-3 py-2">
                        {avatar ? (
                          <img src={avatar} alt={name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {getInitials(name)}
                          </div>
                        )}
                        <p className="text-xs font-medium text-gray-800 truncate min-w-0">
                          {name}{isMe && <span className="ml-1 text-gray-400">(you)</span>}
                        </p>
                      </div>
                    );
                  })}
                </>
              );
            })()}

            {/* ── Students ── */}
            {(() => {
              const studentMembers = approvedMembers.filter((m) => (m as any).profile?.role !== 'tutor');
              if (studentMembers.length === 0) return (
                <div className="px-3 pt-2 pb-3 border-t border-gray-100">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Students</p>
                  <p className="text-[10px] text-gray-400">No students yet.</p>
                </div>
              );
              return (
                <>
                  <div className="px-3 pt-2 pb-1 border-t border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Students</p>
                  </div>
                  {studentMembers.map((m) => {
                    const profile = (m as any).profile;
                    const name: string = profile?.full_name ?? 'Student';
                    const avatar: string | null = profile?.avatar_url ?? null;
                    const isMe = m.user_id === currentUserId;
                    return (
                      <div key={m.id} className="flex items-center gap-2 px-3 py-2">
                        {avatar ? (
                          <img src={avatar} alt={name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {getInitials(name)}
                          </div>
                        )}
                        <p className="text-xs font-medium text-gray-800 truncate min-w-0">
                          {name}{isMe && <span className="ml-1 text-gray-400">(you)</span>}
                        </p>
                      </div>
                    );
                  })}
                </>
              );
            })()}

          </div>
        )}
      </aside>

    </div>
  );
}
