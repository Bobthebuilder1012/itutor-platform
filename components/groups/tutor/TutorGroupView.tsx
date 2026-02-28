'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  GroupWithTutor,
  GroupMember,
  GroupSessionWithOccurrences,
} from '@/lib/types/groups';
import SessionRow from './SessionRow';
import MemberList from './MemberList';
import CreateSessionModal from './CreateSessionModal';
import GroupMessageBoard from '../messages/GroupMessageBoard';
import AnnouncementBoard from '../announcements/AnnouncementBoard';

type Tab = 'announcements' | 'sessions' | 'members' | 'messages';

interface TutorGroupViewProps {
  group: GroupWithTutor;
  currentUserId: string;
  onGroupUpdated: () => void;
}

export default function TutorGroupView({ group, currentUserId, onGroupUpdated }: TutorGroupViewProps) {
  const [tab, setTab] = useState<Tab>('announcements');
  const [sessions, setSessions] = useState<GroupSessionWithOccurrences[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);

  const pendingCount = members.filter((m) => m.status === 'pending').length;

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [group.id]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
      }
    } finally {
      setMembersLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    fetchSessions();
    fetchMembers();
  }, [fetchSessions, fetchMembers]);

  const handleArchive = async () => {
    if (!confirm(`Archive "${group.name}"? Members will no longer see it.`)) return;
    setArchiving(true);
    await fetch(`/api/groups/${group.id}/archive`, { method: 'POST' });
    setArchiving(false);
    onGroupUpdated();
  };

  const handleSaveName = async () => {
    if (!editName.trim() || editName === group.name) { setEditing(false); return; }
    await fetch(`/api/groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditing(false);
    onGroupUpdated();
  };

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'announcements', label: 'Announcements' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'members', label: 'Members', badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'messages', label: 'Group Chat' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Section 1: Group Header + Controls — fixed */}
      <div className="flex-shrink-0 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditing(false); }}
              />
              <button onClick={handleSaveName} className="text-sm text-emerald-600 font-medium">Save</button>
              <button onClick={() => { setEditing(false); setEditName(group.name); }} className="text-sm text-gray-400">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 truncate">{group.name}</h2>
              <button
                onClick={() => setEditing(true)}
                className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
                title="Edit name"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.5-6.5M3 17.25V21h3.75l9.06-9.06-3.75-3.75L3 17.25z" />
                </svg>
              </button>
            </div>
          )}
          {group.subject && <p className="text-sm text-gray-500 mt-0.5">{group.subject}</p>}
        </div>

        <button
          onClick={handleArchive}
          disabled={archiving}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40"
        >
          {archiving ? 'Archiving…' : 'Archive'}
        </button>
      </div>

      {/* Tabs — fixed */}
      <div className="flex-shrink-0 flex border-b border-gray-200 mt-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors relative ${
              tab === t.id
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto pt-4">

      {/* Tab: Announcements */}
      {tab === 'announcements' && (
        <AnnouncementBoard groupId={group.id} isTutor={true} />
      )}

      {/* Tab: Sessions */}
      {tab === 'sessions' && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setShowCreateSession(true)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <span>+</span> Add Session
            </button>
          </div>

          {sessionsLoading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <div className="text-3xl mb-2">📅</div>
              No sessions yet. Add your first one.
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} groupId={group.id} onRefresh={fetchSessions} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Members */}
      {tab === 'members' && (
        <div>
          {membersLoading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          ) : (
            <MemberList groupId={group.id} members={members} onRefresh={fetchMembers} />
          )}
        </div>
      )}

      {/* Tab: Messages */}
      {tab === 'messages' && (
        <div className="h-full flex flex-col">
          <GroupMessageBoard groupId={group.id} isTutor={true} currentUserId={currentUserId} />
        </div>
      )}

      </div>{/* end scrollable tab content */}

      {showCreateSession && (
        <CreateSessionModal
          groupId={group.id}
          onCreated={() => {
            setShowCreateSession(false);
            fetchSessions();
          }}
          onClose={() => setShowCreateSession(false)}
        />
      )}
    </div>
  );
}
