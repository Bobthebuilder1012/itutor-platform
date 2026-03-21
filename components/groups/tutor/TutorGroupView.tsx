'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import GroupStreamPage from '../stream/GroupStreamPage';

type Tab = 'stream' | 'announcements' | 'sessions' | 'messages';
type ManageSection = 'profile' | 'pricing' | 'sessions';

interface TutorGroupViewProps {
  group: GroupWithTutor;
  currentUserId: string;
  onGroupUpdated: () => void;
}

export default function TutorGroupView({ group, currentUserId, onGroupUpdated }: TutorGroupViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('stream');
  const [sessions, setSessions] = useState<GroupSessionWithOccurrences[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [analytics, setAnalytics] = useState<{
    total_sessions: number;
    average_attendance_rate: number;
    student_retention_rate: number;
    student_analytics: Array<{
      student_id: string;
      student_name: string;
      attended: number;
      missed: number;
      late: number;
      joined_at: string | null;
    }>;
  } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSection, setManageSection] = useState<ManageSection>('profile');
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState('');
  const [manageForm, setManageForm] = useState({
    name: group.name ?? '',
    topic: (group as any).topic ?? '',
    subject: group.subject ?? '',
    form_level: ((group as any).form_level ?? 'FORM_4') as string,
    description: group.description ?? '',
    goals: ((group as any).goals ?? '') as string,
    cover_image: ((group as any).cover_image ?? '') as string,
    header_image: ((group as any).header_image ?? '') as string,
    pricing_mode: ((group as any).pricing_mode ?? 'FREE') as 'FREE' | 'PER_SESSION' | 'PER_COURSE',
    price_per_session: (group as any).price_per_session ?? '',
    price_per_course: (group as any).price_per_course ?? '',
    session_length_minutes: (group as any).session_length_minutes ?? '',
    session_frequency: ((group as any).session_frequency ?? 'weekly') as string,
    availability_window: ((group as any).availability_window ?? '') as string,
  });

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
    (async () => {
      const res = await fetch(`/api/groups/${group.id}/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data?.data ?? null);
      }
    })();
  }, [fetchSessions, fetchMembers]);

  useEffect(() => {
    setManageForm({
      name: group.name ?? '',
      topic: (group as any).topic ?? '',
      subject: group.subject ?? '',
      form_level: ((group as any).form_level ?? 'FORM_4') as string,
      description: group.description ?? '',
      goals: ((group as any).goals ?? '') as string,
      cover_image: ((group as any).cover_image ?? '') as string,
      header_image: ((group as any).header_image ?? '') as string,
      pricing_mode: ((group as any).pricing_mode ?? 'FREE') as 'FREE' | 'PER_SESSION' | 'PER_COURSE',
      price_per_session: (group as any).price_per_session ?? '',
      price_per_course: (group as any).price_per_course ?? '',
      session_length_minutes: (group as any).session_length_minutes ?? '',
      session_frequency: ((group as any).session_frequency ?? 'weekly') as string,
      availability_window: ((group as any).availability_window ?? '') as string,
    });
    setManageError('');
  }, [group]);

  const handleArchive = async () => {
    if (!confirm(`Archive "${group.name}"? Members will no longer see it.`)) return;
    setArchiving(true);
    await fetch(`/api/groups/${group.id}/archive`, { method: 'POST' });
    setArchiving(false);
    onGroupUpdated();
  };

  const handleManageSave = async () => {
    if (!manageForm.name.trim()) {
      setManageError('Group name is required.');
      return;
    }
    setManageSaving(true);
    setManageError('');
    try {
      const body = {
        name: manageForm.name.trim(),
        topic: manageForm.topic.trim() || null,
        subject: manageForm.subject.trim() || null,
        form_level: manageForm.form_level || null,
        description: manageForm.description.trim() || null,
        goals: manageForm.goals.trim() || null,
        cover_image: manageForm.cover_image.trim() || null,
        header_image: manageForm.header_image.trim() || null,
        pricing_mode: manageForm.pricing_mode,
        price_per_session:
          manageForm.pricing_mode === 'PER_SESSION' && manageForm.price_per_session !== ''
            ? Number(manageForm.price_per_session)
            : null,
        price_per_course:
          manageForm.pricing_mode === 'PER_COURSE' && manageForm.price_per_course !== ''
            ? Number(manageForm.price_per_course)
            : null,
        session_length_minutes:
          manageForm.session_length_minutes === '' ? null : Number(manageForm.session_length_minutes),
        session_frequency: manageForm.session_frequency || null,
        availability_window: manageForm.availability_window.trim() || null,
      };
      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to update group settings');
      }
      setManageOpen(false);
      onGroupUpdated();
    } catch (err: any) {
      setManageError(err?.message || 'Failed to update group settings');
    } finally {
      setManageSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = confirm(
      `Delete "${group.name}" permanently?\n\nThis will remove sessions, messages, members, and related records. This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to delete group');
      }
      router.push('/groups');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete group');
      setDeleting(false);
    }
  };

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'stream', label: 'Stream' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'messages', label: 'Group Chat' },
  ];

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Main: title, tabs, content — scrollable middle */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden pr-6">
      {/* Section 1: Group Header + Controls — fixed */}
      <div className="flex-shrink-0 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900 truncate">{group.name}</h2>
          </div>
          {group.subject && <p className="text-sm text-gray-500 mt-0.5">{group.subject}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleArchive}
            disabled={archiving || deleting}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40"
          >
            {archiving ? 'Archiving…' : 'Archive'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || archiving}
            className="text-xs text-red-500 hover:text-red-600 transition-colors flex-shrink-0 disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete Group'}
          </button>
        </div>
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

      <div className="flex-shrink-0 mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setManageOpen((prev) => !prev)}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          {manageOpen ? 'Close Manage Group' : 'Manage Group'}
        </button>
      </div>

      {manageOpen && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setManageSection('profile')}
                className={`pb-2 text-sm font-medium border-b-2 ${
                  manageSection === 'profile'
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Profile
              </button>
              <button
                type="button"
                onClick={() => setManageSection('pricing')}
                className={`pb-2 text-sm font-medium border-b-2 ${
                  manageSection === 'pricing'
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => setManageSection('sessions')}
                className={`pb-2 text-sm font-medium border-b-2 ${
                  manageSection === 'sessions'
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Session Defaults
              </button>
            </div>
          </div>

          {manageSection === 'profile' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Basic info</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Group title</label>
                    <input
                      type="text"
                      value={manageForm.name}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">About group</label>
                    <input
                      type="text"
                      value={manageForm.topic}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, topic: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Subjects</label>
                    <input
                      type="text"
                      value={manageForm.subject}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g. CSEC Math, CSEC Biology"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Form level</label>
                    <select
                      value={manageForm.form_level}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, form_level: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="FORM_1">Form 1</option>
                      <option value="FORM_2">Form 2</option>
                      <option value="FORM_3">Form 3</option>
                      <option value="FORM_4">Form 4</option>
                      <option value="FORM_5">Form 5</option>
                      <option value="CAPE">CAPE</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</p>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Course overview</label>
                    <textarea
                      value={manageForm.description}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Learning objectives</label>
                    <textarea
                      value={manageForm.goals}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, goals: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Branding</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Group thumbnail URL</label>
                    <input
                      type="text"
                      value={manageForm.cover_image}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, cover_image: e.target.value }))}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Header image URL</label>
                    <input
                      type="text"
                      value={manageForm.header_image}
                      onChange={(e) => setManageForm((prev) => ({ ...prev, header_image: e.target.value }))}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {manageSection === 'pricing' && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monetization</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pricing mode</label>
                  <select
                    value={manageForm.pricing_mode}
                    onChange={(e) =>
                      setManageForm((prev) => ({ ...prev, pricing_mode: e.target.value as 'FREE' | 'PER_SESSION' | 'PER_COURSE' }))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="FREE">Free</option>
                    <option value="PER_SESSION">Per session</option>
                    <option value="PER_COURSE">Per month</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price per session</label>
                  <input
                    type="number"
                    min={0}
                    value={manageForm.price_per_session}
                    onChange={(e) => setManageForm((prev) => ({ ...prev, price_per_session: e.target.value }))}
                    disabled={manageForm.pricing_mode !== 'PER_SESSION'}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price per month</label>
                  <input
                    type="number"
                    min={0}
                    value={manageForm.price_per_course}
                    onChange={(e) => setManageForm((prev) => ({ ...prev, price_per_course: e.target.value }))}
                    disabled={manageForm.pricing_mode !== 'PER_COURSE'}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>
          )}

          {manageSection === 'sessions' && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Session defaults</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Session length (mins)</label>
                  <input
                    type="number"
                    min={15}
                    value={manageForm.session_length_minutes}
                    onChange={(e) => setManageForm((prev) => ({ ...prev, session_length_minutes: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Session frequency</label>
                  <select
                    value={manageForm.session_frequency}
                    onChange={(e) => setManageForm((prev) => ({ ...prev, session_frequency: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Availability window</label>
                  <input
                    type="text"
                    value={manageForm.availability_window}
                    onChange={(e) => setManageForm((prev) => ({ ...prev, availability_window: e.target.value }))}
                    placeholder="e.g. Fridays 6:00 PM - 7:00 PM"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {manageError && <p className="mt-3 text-xs text-red-500">{manageError}</p>}

          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setManageOpen(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleManageSave()}
              disabled={manageSaving}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {manageSaving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Tab content — scrollable middle */}
      <div className="flex-1 min-h-0 pt-4">

      {/* Tab: Stream */}
      {tab === 'stream' && (
        <div className="h-full min-h-0 overflow-y-auto pr-1">
          <GroupStreamPage
            groupId={group.id}
            currentUserId={currentUserId}
            isTutor={true}
            authorName={group.tutor?.full_name ?? undefined}
            authorAvatarUrl={group.tutor?.avatar_url ?? undefined}
          />
        </div>
      )}

      {/* Tab: Announcements */}
      {tab === 'announcements' && (
        <div className="h-full min-h-0 overflow-y-auto pr-1">
          <AnnouncementBoard groupId={group.id} isTutor={true} />
        </div>
      )}

      {/* Tab: Sessions */}
      {tab === 'sessions' && (
        <div className="h-full min-h-0 overflow-y-auto pr-1">
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

      {/* Tab: Messages */}
      {tab === 'messages' && (
        <div className="h-full min-h-0 flex flex-col">
          <GroupMessageBoard groupId={group.id} isTutor={true} currentUserId={currentUserId} />
        </div>
      )}

      </div>{/* end scrollable tab content */}

      </div>{/* end main */}

      {/* Members panel — separated from middle */}
      <aside className="flex-shrink-0 w-72 border-l-2 border-gray-200 bg-gray-50/60 flex flex-col overflow-hidden">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 pt-4 pb-2">Members</h3>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pb-4">
          {analytics && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Group analytics</p>
              <div className="space-y-1 text-xs text-gray-600">
                <p>Total sessions: <span className="font-semibold text-gray-800">{analytics.total_sessions}</span></p>
                <p>Avg attendance: <span className="font-semibold text-gray-800">{analytics.average_attendance_rate}%</span></p>
                <p>Retention: <span className="font-semibold text-gray-800">{analytics.student_retention_rate}%</span></p>
              </div>
            </div>
          )}
          {membersLoading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          ) : (
            <MemberList groupId={group.id} members={members} onRefresh={fetchMembers} />
          )}
          {analytics && analytics.student_analytics.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Student attendance</p>
              <div className="space-y-2">
                {analytics.student_analytics.slice(0, 8).map((s) => (
                  <div key={s.student_id} className="text-xs text-gray-600">
                    <p className="font-medium text-gray-800 truncate">{s.student_name}</p>
                    <p>Attended: {s.attended} | Missed: {s.missed} | Late: {s.late}</p>
                    <p className="text-[11px] text-gray-400">
                      Joined: {s.joined_at ? new Date(s.joined_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

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
