'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GroupWithTutor, GroupSessionWithOccurrences, GroupMember } from '@/lib/types/groups';
import GroupMessageBoard from '../messages/GroupMessageBoard';
import GroupStreamPage from '../stream/GroupStreamPage';
import StudentSessionsTab from './StudentSessionsTab';
import MemberList from '../tutor/MemberList';
import WhatsAppJoinButton from './WhatsAppJoinButton';

type Tab = 'stream' | 'sessions' | 'messages';

interface GroupMemberViewProps {
  group: GroupWithTutor;
  currentUserId: string;
}

export default function GroupMemberView({ group, currentUserId }: GroupMemberViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('stream');
  const [sessions, setSessions] = useState<GroupSessionWithOccurrences[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
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
            <StudentSessionsTab
              sessions={sessions}
              loading={sessionsLoading}
              groupId={group.id}
              onJoin={handleJoinOccurrence}
              joiningOccurrenceId={joiningOccurrenceId}
            />
          )}
        </div>
      )}
    </div>
  );
}
