'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor, GroupSessionWithOccurrences, GroupOccurrence, GroupMember } from '@/lib/types/groups';
import GroupMessageBoard from '../messages/GroupMessageBoard';
import StatusBadge from '../shared/StatusBadge';
import GroupStreamPage from '../stream/GroupStreamPage';
import MemberList from '../tutor/MemberList';
import WhatsAppJoinButton from './WhatsAppJoinButton';

type Tab = 'stream' | 'sessions' | 'messages';

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

export default function GroupMemberView({ group, currentUserId }: GroupMemberViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('stream');
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
    { id: 'stream', label: 'Stream' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'messages', label: 'Messages' },
  ];

  const membersSidebar = (
    <div className="w-[300px] bg-white border-l border-[#e4e8ee] flex-shrink-0 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[.07em] text-[#6b7280]">Members</p>
          <span className="bg-[#d1fae5] text-[#047857] px-2 py-0.5 rounded-[10px] text-[11px] font-bold">{approvedMembers.length + 1}</span>
        </div>
        {membersLoading ? (
          <div className="py-6 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" /></div>
        ) : (
          <MemberList
            groupId={group.id}
            members={members}
            currentUserId={currentUserId}
            tutorId={group.tutor_id}
            isTutor={false}
            onRefresh={fetchMembers}
          />
        )}
      </div>
      <div className="border-t border-[#e4e8ee] p-4 flex-shrink-0">
        <WhatsAppJoinButton groupId={group.id} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Lesson header */}
      <div className="flex-shrink-0 px-6 py-3.5 bg-white border-b border-[#e4e8ee] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-[10px] border border-[#e4e8ee] bg-white flex items-center justify-center hover:border-[#0d9668] hover:text-[#0d9668] transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold truncate">{group.name}</h2>
            <p className="text-[12px] text-[#6b7280] mt-px">{tutorName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-3 py-1 rounded-[20px] text-[11px] font-semibold bg-[#d1fae5] text-[#047857]">Active</span>
          <button
            onClick={handleMessageTutor}
            disabled={dmLoading}
            className="px-3.5 py-[7px] rounded-[10px] text-[12px] font-semibold border border-[#e4e8ee] bg-white hover:border-[#0d9668] hover:text-[#0d9668] transition-colors flex items-center gap-[5px] disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
            {dmLoading ? 'Opening…' : 'Message Tutor'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-0 bg-white border-b border-[#e4e8ee] px-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-[18px] py-3 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'text-[#0d9668] border-[#0d9668]'
                : 'text-[#6b7280] border-transparent hover:text-[#111827]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      {tab === 'messages' ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col">
            <GroupMessageBoard
              groupId={group.id}
              isTutor={false}
              currentUserId={currentUserId}
              memberCount={approvedMembers.length}
            />
          </div>
          {membersSidebar}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'stream' && (
            <GroupStreamPage groupId={group.id} currentUserId={currentUserId} isTutor={false} />
          )}

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
                    const now = new Date();
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
                      <div key={s.id} className="bg-white border border-[#e4e8ee] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                        <div className="px-5 py-3.5 flex items-start justify-between gap-2 border-b border-[#e4e8ee]">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-[14px] font-bold">{s.title}</h4>
                              {outdated && <StatusBadge variant="outdated" />}
                            </div>
                            <p className="text-[12px] text-[#6b7280] mt-0.5">
                              {s.recurrence_type === 'none'
                                ? 'One-time session'
                                : s.recurrence_type === 'weekly'
                                ? `Weekly · ${(s.recurrence_days ?? []).map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`
                                : 'Daily'}
                              {' · '}{s.duration_minutes} min
                            </p>
                          </div>
                        </div>

                        {futureOccs.length > 0 ? (
                          <div className="divide-y divide-[#e4e8ee]">
                            {visibleOccs.map((occ) => {
                              const windowStatus = getOccurrenceStatus(occ);
                              const start = new Date(occ.scheduled_start_at);
                              const end = new Date(occ.scheduled_end_at);
                              return (
                                <div key={occ.id} className={`px-5 py-3 flex items-center justify-between gap-4 ${windowStatus === 'live' ? 'bg-green-50' : ''}`}>
                                  <div className="flex items-start gap-3 min-w-0">
                                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${windowStatus === 'live' ? 'bg-green-500 animate-pulse' : 'bg-emerald-400'}`} />
                                    <div>
                                      <p className="text-[13px] font-semibold">
                                        {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                      </p>
                                      <p className="text-[12px] text-[#6b7280] mt-0.5">
                                        {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                        {' – '}
                                        {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                      </p>
                                      {windowStatus === 'live' ? (
                                        <p className="text-[10px] font-bold text-green-600 mt-1 uppercase tracking-wide">● Session is live now</p>
                                      ) : (
                                        <p className="text-[10px] text-[#9ca3af] mt-1">Meeting link opens 15 min before start</p>
                                      )}
                                    </div>
                                  </div>
                                  {windowStatus === 'live' ? (
                                    <button
                                      onClick={() => handleJoinOccurrence(s.id, occ.id)}
                                      disabled={joiningOccurrenceId === occ.id}
                                      className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#0d9668] hover:bg-[#047857] text-white text-[12px] font-bold px-4 py-2 rounded-[10px] transition-colors shadow-sm"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.069A1 1 0 0121 8.876v6.248a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                                      {joiningOccurrenceId === occ.id ? 'Opening…' : 'Join Now'}
                                    </button>
                                  ) : (
                                    <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#f5f7fa] text-[#9ca3af] text-[12px] font-medium px-4 py-2 rounded-[10px]">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                      Not yet open
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {hasMore && (
                              <div className="px-5 py-3 text-center">
                                <button
                                  onClick={() => setVisibleCounts((prev) => ({ ...prev, [s.id]: visibleCount + pageSize }))}
                                  className="text-[12px] font-medium text-[#0d9668] hover:text-[#047857] transition-colors"
                                >
                                  Show {Math.min(pageSize, futureOccs.length - visibleCount)} more ↓
                                </button>
                              </div>
                            )}
                          </div>
                        ) : pastOccs.length > 0 ? (
                          <div>
                            <div className="divide-y divide-[#e4e8ee]">
                              {pastOccs.map((occ) => {
                                const start = new Date(occ.scheduled_start_at);
                                const end = new Date(occ.scheduled_end_at);
                                return (
                                  <div key={occ.id} className="px-5 py-3 flex items-center justify-between gap-4 opacity-60">
                                    <div className="flex items-start gap-3 min-w-0">
                                      <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-[#d1d5db] flex-shrink-0" />
                                      <div>
                                        <p className="text-[13px] font-semibold text-[#6b7280] line-through">
                                          {start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                                        </p>
                                        <p className="text-[12px] text-[#9ca3af] mt-0.5">
                                          {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                          {' – '}
                                          {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="flex-shrink-0 text-[11px] text-[#9ca3af] italic">Ended</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
                              <p className="text-[12px] text-amber-700 font-medium">No upcoming sessions — the tutor may add new dates soon.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="px-5 py-5 text-center">
                            <p className="text-[12px] text-[#9ca3af]">No sessions have been scheduled yet.</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
