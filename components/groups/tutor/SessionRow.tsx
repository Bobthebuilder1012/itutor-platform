'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GroupSessionWithOccurrences, GroupOccurrence } from '@/lib/types/groups';

interface SessionRowProps {
  session: GroupSessionWithOccurrences;
  groupId: string;
  onRefresh: () => void;
}

const DAY_LABELS: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

const ACCENT_COLORS = ['#6366f1', '#10b981', '#f97316', '#f59e0b', '#ef4444', '#0891b2'];

type OccurrenceStatus = 'too_early' | 'live' | 'ended';

function getOccurrenceStatus(occ: GroupOccurrence): OccurrenceStatus {
  const start = new Date(occ.scheduled_start_at).getTime();
  const end = new Date(occ.scheduled_end_at).getTime();
  const now = Date.now();
  const joinWindowMs = 15 * 60 * 1000;

  if (now < start - joinWindowMs) return 'too_early';
  if (now > end) return 'ended';
  return 'live';
}

function getSessionColor(session: GroupSessionWithOccurrences): string {
  let hash = 0;
  for (let i = 0; i < session.id.length; i++) {
    hash = ((hash << 5) - hash + session.id.charCodeAt(i)) | 0;
  }
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
}

function formatTime(time: string) {
  const [h, m] = time.split(':');
  const d = new Date();
  d.setHours(parseInt(h), parseInt(m));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function hasUpcomingOccurrence(session: GroupSessionWithOccurrences): boolean {
  return (session.occurrences ?? []).some(
    (o) => o.status === 'upcoming' && new Date(o.scheduled_start_at) > new Date()
  );
}

function hasLiveOccurrence(session: GroupSessionWithOccurrences): boolean {
  return (session.occurrences ?? []).some(
    (o) => o.status === 'upcoming' && getOccurrenceStatus(o) === 'live'
  );
}

type RsvpSummary = Record<string, { attending: number; not_attending: number; reasons: Array<{ name: string; reason: string }> }>;

export default function SessionRow({ session, groupId, onRefresh }: SessionRowProps) {
  const [deleting, setDeleting] = useState(false);
  const [joiningOccurrenceId, setJoiningOccurrenceId] = useState<string | null>(null);
  const [rsvpSummary, setRsvpSummary] = useState<RsvpSummary>({});
  const [expandedRsvp, setExpandedRsvp] = useState<string | null>(null);
  const color = getSessionColor(session);
  const isLive = hasLiveOccurrence(session);
  const isUpcoming = hasUpcomingOccurrence(session);

  const fetchRsvps = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/rsvps`);
      if (!res.ok) return;
      const data = await res.json();
      const summary: RsvpSummary = {};
      (data.rsvps ?? []).forEach((r: any) => {
        if (!summary[r.occurrence_id]) summary[r.occurrence_id] = { attending: 0, not_attending: 0, reasons: [] };
        if (r.status === 'attending') summary[r.occurrence_id].attending++;
        else {
          summary[r.occurrence_id].not_attending++;
          if (r.reason) summary[r.occurrence_id].reasons.push({ name: r.student?.full_name ?? 'Student', reason: r.reason });
        }
      });
      setRsvpSummary(summary);
    } catch {}
  }, [groupId]);

  useEffect(() => { fetchRsvps(); }, [fetchRsvps]);

  const recurrenceLabel =
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

  const handleJoinOccurrence = async (occurrenceId: string) => {
    setJoiningOccurrenceId(occurrenceId);
    try {
      const res = await fetch(
        `/api/groups/${groupId}/sessions/${session.id}/occurrences/${occurrenceId}/join-link`,
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

  const statusBadge = isLive ? 'live' : isUpcoming ? 'upcoming' : 'ended';
  const BADGE_STYLES: Record<string, string> = {
    upcoming: 'bg-[#dbeafe] text-[#2563eb]',
    live: 'bg-[#fee2e2] text-[#dc2626] animate-pulse',
    ended: 'bg-[#f4f6fa] text-[#64748b]',
  };

  const upcomingOccs = (session.occurrences ?? [])
    .filter((o) => o.status === 'upcoming')
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())
    .slice(0, 5);

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-[14px] mb-4 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="flex justify-between items-start p-[18px_20px] gap-3 flex-wrap">
        <div className="flex gap-3.5 items-start">
          <div
            className="w-[5px] rounded self-stretch flex-shrink-0"
            style={{ background: color }}
          />
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <h3 className="text-base font-bold">{session.title}</h3>
              <span className={`px-2.5 py-[3px] rounded-[20px] text-[11px] font-bold uppercase tracking-wide ${BADGE_STYLES[statusBadge]}`}>
                {statusBadge === 'live' ? 'Live' : statusBadge === 'upcoming' ? 'Upcoming' : 'Ended'}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="inline-flex items-center gap-[5px] px-2.5 py-1 rounded-md text-[12px] font-medium bg-[#f4f6fa] text-[#64748b]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                {recurrenceLabel}
              </span>
              <span className="inline-flex items-center gap-[5px] px-2.5 py-1 rounded-md text-[12px] font-medium bg-[#f4f6fa] text-[#64748b]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 2L13 7M17 17l2 2-2 2" /><line x1="11" y1="5" x2="17" y2="5" /><line x1="11" y1="19" x2="17" y2="19" /></svg>
                {session.duration_minutes} min
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={handleDeleteSession}
            disabled={deleting}
            className="inline-flex items-center gap-1 px-3.5 py-[7px] rounded-[10px] text-[12px] font-semibold border border-red-500 text-red-500 bg-transparent hover:bg-red-500 hover:text-white transition-all disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {upcomingOccs.length > 0 && (
        <div className="border-t border-[#e2e8f0] py-1">
          {upcomingOccs.map((occ, idx) => {
            const occStatus = getOccurrenceStatus(occ);
            const isEnded = occStatus === 'ended';
            const isOccLive = occStatus === 'live';

            return (
              <div key={occ.id}>
                <div className="flex items-center py-3 px-5 pl-[38px] relative hover:bg-[#f4f6fa] transition-colors">
                  {/* Connecting line */}
                  {idx < upcomingOccs.length - 1 && (
                    <div className="absolute left-[43px] top-8 bottom-[-12px] w-[2px] bg-[#e2e8f0]" />
                  )}

                  {/* Dot */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 relative z-[1] border-2 ${
                      isOccLive
                        ? 'border-green-500 bg-green-100 animate-pulse'
                        : isEnded
                        ? 'border-[#64748b] bg-[#f4f6fa]'
                        : 'border-emerald-500 bg-emerald-50'
                    }`}
                  />

                  {/* Date */}
                  <div className="flex-1 ml-3.5">
                    <span className={`text-[13.5px] font-semibold ${isEnded ? 'text-[#64748b] line-through font-medium' : ''}`}>
                      {new Date(occ.scheduled_start_at).toLocaleString(undefined, {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* RSVP counts */}
                  {(() => {
                    const r = rsvpSummary[occ.id];
                    if (!r || (r.attending === 0 && r.not_attending === 0)) return null;
                    return (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {r.attending > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-[3px] rounded text-[10px] font-semibold bg-[#d1fae5] text-[#047857]">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                            {r.attending}
                          </span>
                        )}
                        {r.not_attending > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedRsvp(expandedRsvp === occ.id ? null : occ.id); }}
                            className="inline-flex items-center gap-0.5 px-2 py-[3px] rounded text-[10px] font-semibold bg-[#fee2e2] text-[#991b1b] hover:bg-[#fecaca] transition-colors"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            {r.not_attending}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Status + Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isOccLive ? (
                      <button
                        onClick={() => handleJoinOccurrence(occ.id)}
                        disabled={joiningOccurrenceId === occ.id}
                        className="bg-green-600 hover:bg-green-700 text-white text-[12px] font-semibold px-3.5 py-1 rounded-md transition-colors disabled:opacity-50"
                      >
                        {joiningOccurrenceId === occ.id ? 'Opening…' : 'Join Session'}
                      </button>
                    ) : isEnded ? (
                      <span className="text-[12px] font-medium px-2.5 py-1 rounded-md bg-[#f4f6fa] text-[#64748b]">Session ended</span>
                    ) : (
                      <span className="text-[12px] font-medium px-2.5 py-1 rounded-md bg-[#dbeafe] text-[#2563eb]">Opens 15 min before</span>
                    )}
                    {!isEnded && (
                      <button
                        onClick={() => handleCancelOccurrence(occ.id)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-base text-[#64748b] hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Cancel this occurrence"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded absence reasons */}
                {expandedRsvp === occ.id && rsvpSummary[occ.id]?.reasons.length > 0 && (
                  <div className="ml-[54px] mr-5 mb-2 p-2.5 rounded-[8px] bg-[#fef2f2] border border-[#fecaca]">
                    <p className="text-[10px] font-bold text-[#991b1b] mb-1.5">Absence reasons:</p>
                    {rsvpSummary[occ.id].reasons.map((r, ri) => (
                      <div key={ri} className="text-[11px] text-[#7f1d1d] mb-1 last:mb-0">
                        <span className="font-semibold">{r.name}:</span> {r.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
