'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GroupWithTutor, GroupSessionWithOccurrences, GroupMember } from '@/lib/types/groups';
import { getDefaultThumbnail, deterministicDefault, isDefaultThumbnail } from '@/lib/defaultThumbnails';
import StudentStreamView from '../stream/StudentStreamView';
import StudentSessionsTab from './StudentSessionsTab';
import MemberList from '../tutor/MemberList';
import WhatsAppJoinButton from './WhatsAppJoinButton';
import StudentFeedbackTab from './StudentFeedbackTab';

type Tab = 'stream' | 'sessions' | 'feedback';

interface GroupMemberViewProps {
  group: GroupWithTutor;
  currentUserId: string;
}

export default function GroupMemberView({ group, currentUserId }: GroupMemberViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get('tab') as Tab | null) ?? 'stream';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sessions, setSessions] = useState<GroupSessionWithOccurrences[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [dmLoading, setDmLoading] = useState(false);
  const [joiningOccurrenceId, setJoiningOccurrenceId] = useState<string | null>(null);

  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const approvedMembers = members.filter((m) => m.status === 'approved');

  const coverImage = (group as any).cover_image ?? null;
  const hasCustomImage = coverImage && !isDefaultThumbnail(coverImage);
  const thumbnail = getDefaultThumbnail(coverImage) ?? deterministicDefault(group.id);

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
    { id: 'feedback', label: 'My Feedback' },
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
            tutorName={tutorName}
            tutorAvatarUrl={group.tutor?.avatar_url ?? null}
            isTutor={false}
            onRefresh={fetchMembers}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#f4f6fa]">
      {/* ── LESSON BANNER (all tabs) ── */}
      <div className="relative flex-shrink-0 h-[180px] overflow-hidden">
        {hasCustomImage ? (
          <img src={coverImage} alt={group.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: thumbnail.gradient }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40" />
        <div className="absolute bottom-0 left-0 right-0 px-8 pb-7">
          <h1 className="text-[26px] font-extrabold text-white leading-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
            {group.name}
          </h1>
        </div>
      </div>

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
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <span className="px-3 py-1 rounded-[20px] text-[11px] font-semibold bg-[#d1fae5] text-[#047857]">Active</span>
          <WhatsAppJoinButton groupId={group.id} variant="toolbar" />
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

      {/* Content area — sidebar always visible */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === 'stream' && (
              <StudentStreamView groupId={group.id} lessonId={group.id} />
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
            {tab === 'feedback' && (
              <StudentFeedbackTab groupId={group.id} />
            )}
          </div>
        </div>
        {membersSidebar}
      </div>
    </div>
  );
}
