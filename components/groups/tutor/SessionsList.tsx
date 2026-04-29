'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GroupSessionWithOccurrences, GroupOccurrence } from '@/lib/types/groups';

interface SessionsListProps {
  sessions: GroupSessionWithOccurrences[];
  groupId: string;
  onRefresh: () => void;
}

type FilterKey = 'all' | 'upcoming' | 'ended' | 'deleted';

interface FlatRow {
  occurrence: GroupOccurrence;
  sessionId: string;
  parentTitle: string;
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'ended', label: 'Ended' },
  { key: 'deleted', label: 'Deleted' },
];

const INITIAL_UPCOMING = 4;
const INITIAL_PAST = 3;
const LOAD_MORE_STEP = 5;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

function formatDuration(startIso: string, endIso: string): string {
  const minutes = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000
  );
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function formatCountdown(startIso: string): string {
  const diffMs = new Date(startIso).getTime() - Date.now();
  if (diffMs <= 0) return 'starting';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  const days = Math.floor(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

const JOIN_WINDOW_MS = 15 * 60 * 1000;

export default function SessionsList({ sessions, groupId, onRefresh }: SessionsListProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [busyOccurrenceId, setBusyOccurrenceId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [joiningOccurrenceId, setJoiningOccurrenceId] = useState<string | null>(null);
  const [upcomingLimit, setUpcomingLimit] = useState(INITIAL_UPCOMING);
  const [pastLimit, setPastLimit] = useState(INITIAL_PAST);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const primarySeries = sessions[0];

  useEffect(() => {
    setTitleDrafts((prev) => {
      const next: Record<string, string> = { ...prev };
      sessions.forEach((s) => {
        (s.occurrences ?? []).forEach((o) => {
          if (!(o.id in next)) next[o.id] = o.title ?? '';
        });
      });
      return next;
    });
  }, [sessions]);

  const nowMs = Date.now();

  const { upcomingRows, pastRows, deletedRows } = useMemo(() => {
    const flat: FlatRow[] = [];
    sessions.forEach((s) => {
      (s.occurrences ?? []).forEach((o) => {
        flat.push({ occurrence: o, sessionId: s.id, parentTitle: s.title });
      });
    });

    const upcoming: FlatRow[] = [];
    const past: FlatRow[] = [];
    const deleted: FlatRow[] = [];
    flat.forEach((row) => {
      if (row.occurrence.status === 'cancelled') {
        deleted.push(row);
        return;
      }
      const endMs = new Date(row.occurrence.scheduled_end_at).getTime();
      if (endMs >= nowMs) upcoming.push(row);
      else past.push(row);
    });

    upcoming.sort(
      (a, b) =>
        new Date(a.occurrence.scheduled_start_at).getTime() -
        new Date(b.occurrence.scheduled_start_at).getTime()
    );
    past.sort(
      (a, b) =>
        new Date(b.occurrence.scheduled_start_at).getTime() -
        new Date(a.occurrence.scheduled_start_at).getTime()
    );
    deleted.sort(
      (a, b) =>
        new Date(b.occurrence.scheduled_start_at).getTime() -
        new Date(a.occurrence.scheduled_start_at).getTime()
    );

    return { upcomingRows: upcoming, pastRows: past, deletedRows: deleted };
  }, [sessions, nowMs]);

  const showUpcoming = filter === 'all' || filter === 'upcoming';
  const showEnded = filter === 'all' || filter === 'ended';
  const showDeleted = filter === 'all' || filter === 'deleted';

  const visibleUpcomingFull = showUpcoming ? upcomingRows : [];
  const visiblePastFull = showEnded ? pastRows : [];
  const visibleDeleted = showDeleted ? deletedRows : [];

  const visibleUpcoming = visibleUpcomingFull.slice(0, upcomingLimit);
  const visiblePast = visiblePastFull.slice(0, pastLimit);
  const hasMoreUpcoming = visibleUpcomingFull.length > visibleUpcoming.length;
  const hasMorePast = visiblePastFull.length > visiblePast.length;

  const totalVisible =
    visibleUpcoming.length + visiblePast.length + visibleDeleted.length;

  const showDisclaimer = visibleUpcoming.length > 0;

  const handleDelete = async (row: FlatRow) => {
    setBusyOccurrenceId(row.occurrence.id);
    try {
      await fetch(
        `/api/groups/${groupId}/sessions/${row.sessionId}/occurrences/${row.occurrence.id}`,
        { method: 'DELETE' }
      );
      onRefresh();
    } finally {
      setBusyOccurrenceId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleRestore = async (row: FlatRow) => {
    setBusyOccurrenceId(row.occurrence.id);
    try {
      await fetch(
        `/api/groups/${groupId}/sessions/${row.sessionId}/occurrences/${row.occurrence.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore' }),
        }
      );
      onRefresh();
    } finally {
      setBusyOccurrenceId(null);
    }
  };

  const handleJoin = async (row: FlatRow) => {
    setJoiningOccurrenceId(row.occurrence.id);
    try {
      const res = await fetch(
        `/api/groups/${groupId}/sessions/${row.sessionId}/occurrences/${row.occurrence.id}/join-link`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.join_url) {
        throw new Error(data?.error || 'Could not generate meeting link');
      }
      window.open(data.join_url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      alert(err?.message || 'Could not open meeting link. Please try again.');
    } finally {
      setJoiningOccurrenceId(null);
    }
  };

  const handleSaveTitle = async (row: FlatRow) => {
    const draft = titleDrafts[row.occurrence.id] ?? '';
    const original = row.occurrence.title ?? '';
    if (draft.trim() === original.trim()) {
      setEditingTitleId(null);
      return;
    }
    try {
      await fetch(
        `/api/groups/${groupId}/sessions/${row.sessionId}/occurrences/${row.occurrence.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: draft.trim() || null }),
        }
      );
      onRefresh();
    } finally {
      setEditingTitleId(null);
    }
  };

  const renderRow = (row: FlatRow, group: 'upcoming' | 'past' | 'deleted', index: number) => {
    const occ = row.occurrence;
    const isUpcoming = group === 'upcoming';
    const isDeleted = group === 'deleted';
    const isPast = group === 'past';
    const isBusy = busyOccurrenceId === occ.id;
    const isConfirming = confirmDeleteId === occ.id;
    const isEditing = editingTitleId === occ.id;
    const draft = titleDrafts[occ.id] ?? '';
    const dotClass = isDeleted
      ? 'bg-red-500'
      : isUpcoming
      ? 'bg-emerald-600'
      : 'bg-gray-300';

    return (
      <div
        key={occ.id}
        className={`flex items-start gap-3.5 px-5 py-3.5 border-b border-[#e5e9ee]/60 last:border-b-0 transition-colors ${
          isDeleted ? 'bg-[#fef2f2]' : 'bg-white hover:bg-[#fafbfc]'
        }`}
      >
        <div className="pt-[3px] flex-shrink-0">
          <div className={`w-[11px] h-[11px] rounded-full ${dotClass}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div
            className={`text-[13px] font-semibold mb-1 ${
              isDeleted
                ? 'line-through text-[#6b7280]'
                : isPast
                ? 'line-through text-[#6b7280] font-medium'
                : 'text-[#0f1923]'
            }`}
          >
            {formatDate(occ.scheduled_start_at)}
          </div>

          <div className="flex items-center gap-1.5 mb-[3px]">
            <input
              type="text"
              value={isEditing ? draft : occ.title ?? ''}
              placeholder="Untitled session"
              spellCheck={false}
              disabled={!isUpcoming}
              onFocus={() => {
                if (!isUpcoming) return;
                setEditingTitleId(occ.id);
                setTitleDrafts((prev) => ({ ...prev, [occ.id]: occ.title ?? '' }));
              }}
              onChange={(e) =>
                setTitleDrafts((prev) => ({ ...prev, [occ.id]: e.target.value }))
              }
              onBlur={() => isEditing && void handleSaveTitle(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  setEditingTitleId(null);
                  setTitleDrafts((prev) => ({
                    ...prev,
                    [occ.id]: occ.title ?? '',
                  }));
                }
              }}
              className={`text-[12px] px-1 py-0.5 rounded-[4px] outline-none bg-transparent font-sans min-w-[120px] max-w-full transition-colors ${
                isUpcoming
                  ? `border border-dashed cursor-text ${
                      isEditing
                        ? 'border-emerald-600 border-solid bg-white shadow-[0_0_0_2px_#d1fae5] text-[#0f1923] not-italic'
                        : !occ.title
                        ? 'border-[#e5e7eb] text-[#9ca3af] italic hover:bg-gray-50 hover:border-[#d1d5db]'
                        : 'border-transparent text-[#0f1923] hover:bg-gray-50 hover:border-[#d1d5db]'
                    }`
                  : `border border-transparent ${
                      isDeleted
                        ? 'line-through text-[#9ca3af] italic'
                        : 'text-[#9ca3af] italic'
                    } cursor-default`
              }`}
            />
            {isUpcoming && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="flex-shrink-0 text-[#d1d5db]"
              >
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
          </div>

          <div
            className={`text-[11px] ${
              isDeleted
                ? 'line-through text-[#fca5a5]'
                : 'text-[#6b7280]'
            }`}
          >
            {formatTimeRange(occ.scheduled_start_at, occ.scheduled_end_at)} ·{' '}
            {formatDuration(occ.scheduled_start_at, occ.scheduled_end_at)}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 pt-[2px]">
          {isUpcoming && (() => {
            const startMs = new Date(occ.scheduled_start_at).getTime();
            const endMs = new Date(occ.scheduled_end_at).getTime();
            const nowMsLocal = Date.now();
            const joinOpen =
              nowMsLocal >= startMs - JOIN_WINDOW_MS && nowMsLocal <= endMs;
            const isJoining = joiningOccurrenceId === occ.id;
            return joinOpen ? (
              <button
                onClick={() => handleJoin(row)}
                disabled={isJoining}
                className="inline-flex items-center gap-1.5 px-3.5 py-[5px] rounded-[7px] text-[12px] font-semibold bg-[#0d9668] hover:bg-[#047857] text-white transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                {isJoining ? 'Opening…' : 'Join'}
              </button>
            ) : (
              <button
                disabled
                title="Opens 15 minutes before the start time"
                className="inline-flex items-center gap-1.5 px-3.5 py-[5px] rounded-[7px] text-[12px] font-semibold bg-[#f4f6f8] text-[#d1d5db] border border-[#e5e9ee] cursor-not-allowed whitespace-nowrap"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                Join
              </button>
            );
          })()}

          {isUpcoming && (
            <span
              className={`text-[12px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap border ${
                index === 0
                  ? 'bg-[#d1fae5] text-[#047857] border-[#d1fae5]'
                  : 'bg-[#f4f6f8] text-[#6b7280] border-[#e5e9ee]'
              }`}
            >
              {formatCountdown(occ.scheduled_start_at)}
            </span>
          )}

          {isPast && (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide bg-[#f3f4f6] text-[#6b7280]">
              Ended
            </span>
          )}

          {isDeleted && (
            <span style={{ background: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
              DELETED
            </span>
          )}

          {isDeleted ? (
            <button
              onClick={() => handleRestore(row)}
              disabled={isBusy}
              style={{ background: '#e8f5ee', color: '#199358', padding: '6px 12px', borderRadius: 8, fontWeight: 600, fontSize: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: isBusy ? 0.6 : 1 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M3 7v6h6M3 13a9 9 0 105.5-8.4" /></svg>
              {isBusy ? '…' : 'Restore'}
            </button>
          ) : isUpcoming ? (
            isConfirming ? (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-[7px] px-2.5 py-[5px] text-[11px] text-[#991b1b] font-medium">
                <span className="whitespace-nowrap">Delete session?</span>
                <button
                  onClick={() => handleDelete(row)}
                  disabled={isBusy}
                  className="px-2.5 py-[3px] rounded-[5px] text-[11px] font-semibold bg-red-500 text-white disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-2.5 py-[3px] rounded-[5px] text-[11px] font-semibold bg-white text-[#6b7280] border border-[#e5e7eb]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(occ.id)}
                className="w-[30px] h-[30px] rounded-[7px] border border-[#e5e9ee] bg-white flex items-center justify-center text-[#9ca3af] hover:border-red-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                title="Delete this session"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              </button>
            )
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-[#e5e9ee] rounded-[14px] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e5e9ee]">
        <div className="flex gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                  active
                    ? 'bg-[#111] text-white border-[#111]'
                    : 'bg-white text-[#6b7280] border-[#e5e9ee] hover:bg-[#f4f6f8]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          disabled={!primarySeries}
          className="inline-flex items-center gap-1.5 px-[18px] py-[9px] rounded-[10px] bg-[#0d9668] hover:bg-[#047857] disabled:opacity-50 text-white text-[13px] font-semibold transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Session
        </button>
      </div>

      {showDisclaimer && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[#eff6ff] border-b border-[#dbeafe] text-[12px] text-[#1e40af]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Upcoming session rooms open 15 minutes before the scheduled start time.
        </div>
      )}

      {totalVisible === 0 ? (
        <div className="text-center py-14 text-[13px] text-[#6b7280]">
          {sessions.length === 0
            ? 'No sessions scheduled yet.'
            : 'No sessions match this filter.'}
        </div>
      ) : (
        <>
          {visibleUpcoming.length > 0 && (
            <>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-[#6b7280] bg-[#f4f6f8] border-b border-[#e5e9ee]">
                Upcoming
              </div>
              <div>
                {visibleUpcoming.map((row, idx) => renderRow(row, 'upcoming', idx))}
              </div>
              {hasMoreUpcoming && (
                <button
                  onClick={() => setUpcomingLimit((n) => n + LOAD_MORE_STEP)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors border-b border-[#e5e9ee]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  See more
                </button>
              )}
            </>
          )}

          {visibleDeleted.length > 0 && (
            <>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-[#6b7280] bg-[#f4f6f8] border-y border-[#e5e9ee]">
                Deleted
              </div>
              <div>
                {visibleDeleted.map((row, idx) => renderRow(row, 'deleted', idx))}
              </div>
            </>
          )}

          {visiblePast.length > 0 && (
            <>
              <div className="px-5 py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-[#6b7280] bg-[#f4f6f8] border-y border-[#e5e9ee]">
                Past
              </div>
              <div>{visiblePast.map((row, idx) => renderRow(row, 'past', idx))}</div>
              {hasMorePast && (
                <button
                  onClick={() => setPastLimit((n) => n + LOAD_MORE_STEP)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 text-[13px] font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors border-t border-[#e5e9ee]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  See more
                </button>
              )}
            </>
          )}
        </>
      )}

      {showAddModal && primarySeries && (
        <AddOccurrenceModal
          groupId={groupId}
          sessionId={primarySeries.id}
          defaultStartTime={primarySeries.start_time}
          defaultDuration={primarySeries.duration_minutes}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

interface AddOccurrenceModalProps {
  groupId: string;
  sessionId: string;
  defaultStartTime: string;
  defaultDuration: number;
  onClose: () => void;
  onCreated: () => void;
}

function AddOccurrenceModal({
  groupId,
  sessionId,
  defaultStartTime,
  defaultDuration,
  onClose,
  onCreated,
}: AddOccurrenceModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [scheduledDate, setScheduledDate] = useState(today);
  const [startTime, setStartTime] = useState(
    (defaultStartTime ?? '09:00').slice(0, 5)
  );
  const [duration, setDuration] = useState(defaultDuration ?? 60);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledDate) {
      setError('Date is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        `/api/groups/${groupId}/sessions/${sessionId}/occurrences`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduled_date: scheduledDate,
            start_time: startTime,
            duration_minutes: duration,
            title: title.trim() || null,
            timezone_offset: new Date().getTimezoneOffset(),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Failed to add session');
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add session');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add Session</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Quadratics review"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={scheduledDate}
              min={today}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (min)
              </label>
              <input
                type="number"
                min={15}
                max={480}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {submitting ? 'Saving…' : 'Add Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
