'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GroupSessionWithOccurrences, GroupOccurrence } from '@/lib/types/groups';

interface StudentSessionsTabProps {
  sessions: GroupSessionWithOccurrences[];
  loading: boolean;
  groupId: string;
  onJoin: (sessionId: string, occurrenceId: string) => void;
  joiningOccurrenceId: string | null;
}

type OccStatus = 'too_early' | 'live' | 'ended';
type RsvpStatus = 'attending' | 'not_attending';
type RsvpMap = Record<string, { status: RsvpStatus; reason: string | null }>;

function occStatus(occ: GroupOccurrence): OccStatus {
  const s = new Date(occ.scheduled_start_at).getTime();
  const e = new Date(occ.scheduled_end_at).getTime();
  const now = Date.now();
  if (now < s - 15 * 60 * 1000) return 'too_early';
  if (now > e + 30 * 60 * 1000) return 'ended';
  return 'live';
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const INITIAL_VISIBLE = 3;

function Countdown({ target }: { target: Date }) {
  const [diff, setDiff] = useState(target.getTime() - Date.now());
  useEffect(() => {
    const iv = setInterval(() => setDiff(target.getTime() - Date.now()), 60_000);
    return () => clearInterval(iv);
  }, [target]);
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const Block = ({ n, label }: { n: number; label: string }) => (
    <div className="text-center px-2 py-1.5 bg-white/70 rounded-md min-w-[42px]">
      <p className="text-[16px] font-extrabold text-[#14532d] leading-none">{n}</p>
      <p className="text-[8px] font-semibold uppercase tracking-wide text-[#166534] mt-0.5">{label}</p>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <Block n={d} label="Days" />
      <span className="text-[16px] font-bold text-[#14532d] opacity-40">:</span>
      <Block n={h} label="Hrs" />
      <span className="text-[16px] font-bold text-[#14532d] opacity-40">:</span>
      <Block n={m} label="Min" />
    </div>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function buildIcsUrl(title: string, start: string, end: string): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const s = fmt(new Date(start));
  const e = fmt(new Date(end));
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `DTSTART:${s}`, `DTEND:${e}`, `SUMMARY:${title}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export default function StudentSessionsTab({ sessions, loading, groupId, onJoin, joiningOccurrenceId }: StudentSessionsTabProps) {
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [rsvps, setRsvps] = useState<RsvpMap>({});
  const [rsvpSaving, setRsvpSaving] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{ occurrenceId: string; sessionId: string } | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [attendance, setAttendance] = useState<{ attended: number; total: number }>({ attended: 0, total: 0 });

  const fetchRsvps = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/rsvps`);
      if (!res.ok) return;
      const data = await res.json();
      const map: RsvpMap = {};
      (data.rsvps ?? []).forEach((r: any) => {
        map[r.occurrence_id] = { status: r.status, reason: r.reason };
      });
      setRsvps(map);
    } catch {}
  }, [groupId]);

  const fetchAttendance = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/student`);
      if (!res.ok) return;
      const data = await res.json();
      const first = (data.feedback ?? [])[0];
      if (first?.sessions_attended !== undefined) {
        setAttendance({ attended: first.sessions_attended, total: first.sessions_total });
      }
    } catch {}
  }, [groupId]);

  useEffect(() => { fetchRsvps(); fetchAttendance(); }, [fetchRsvps, fetchAttendance]);

  const submitRsvp = async (sessionId: string, occurrenceId: string, status: RsvpStatus, reason?: string) => {
    setRsvpSaving(occurrenceId);
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions/${sessionId}/occurrences/${occurrenceId}/rsvp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason: reason || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setRsvps((prev) => ({ ...prev, [occurrenceId]: { status: data.rsvp.status, reason: data.rsvp.reason } }));
      }
    } catch {} finally { setRsvpSaving(null); }
  };

  const handleSubmitReason = () => {
    if (!reasonModal) return;
    submitRsvp(reasonModal.sessionId, reasonModal.occurrenceId, 'not_attending', reasonText);
    setReasonModal(null);
    setReasonText('');
  };

  const addAllToCal = (s: GroupSessionWithOccurrences) => {
    const futureOccs = (s.occurrences ?? []).filter((o) => new Date(o.scheduled_end_at).getTime() > Date.now() && o.status !== 'cancelled');
    futureOccs.forEach((occ) => {
      const a = document.createElement('a');
      a.href = buildIcsUrl(s.title, occ.scheduled_start_at, occ.scheduled_end_at);
      a.download = `${s.title.replace(/\s+/g, '_')}_${occ.scheduled_start_at.slice(0, 10)}.ics`;
      a.click();
    });
  };

  if (loading) {
    return <div className="py-12 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-14">
        <div className="w-20 h-20 rounded-[20px] bg-[#f5f7fa] flex items-center justify-center mx-auto mb-4">
          <svg className="w-9 h-9 text-[#6b7280] opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        </div>
        <h3 className="text-base font-bold mb-1.5">No sessions scheduled</h3>
        <p className="text-[13px] text-[#6b7280] max-w-[300px] mx-auto">The tutor hasn&apos;t scheduled any sessions yet. Check back later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {sessions.map((s) => {
        const now = Date.now();
        const allOccs = s.occurrences ?? [];
        const futureOccs = allOccs
          .filter((o) => new Date(o.scheduled_end_at).getTime() > now && o.status !== 'cancelled')
          .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
        const pastOccs = allOccs
          .filter((o) => new Date(o.scheduled_end_at).getTime() <= now)
          .sort((a, b) => new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime());
        const cancelledOccs = allOccs.filter((o) => o.status === 'cancelled');

        const nextOcc = futureOccs[0] ?? null;
        const nextStatus = nextOcc ? occStatus(nextOcc) : null;
        const isExpanded = expandedSessions[s.id] ?? false;
        const visibleFuture = isExpanded ? futureOccs : futureOccs.slice(0, INITIAL_VISIBLE);
        const hiddenCount = futureOccs.length - INITIAL_VISIBLE;

        const recurrenceLabel = s.recurrence_type === 'none' ? 'One-time' : s.recurrence_type === 'weekly' ? 'Weekly' : 'Daily';
        const dayChips = s.recurrence_type === 'weekly' && s.recurrence_days?.length
          ? s.recurrence_days.map((d) => DAY_LABELS[d]).join(', ') : null;
        const timeLabel = nextOcc ? fmtTime(nextOcc.scheduled_start_at) : '';

        const attendedCount = attendance.attended;
        const missedCount = Math.max(0, pastOccs.length - attendedCount);
        const attendancePct = pastOccs.length > 0 ? Math.round((attendedCount / pastOccs.length) * 100) : 100;

        return (
          <div key={s.id} className="bg-white border border-[#e4e8ee] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

            {/* Series header */}
            <div className="px-5 py-[18px] flex items-center justify-between border-b border-[#e4e8ee]">
              <div className="flex items-center gap-3.5">
                <div className="w-[5px] h-10 rounded-[3px] bg-[#0d9668] flex-shrink-0" />
                <div>
                  <h4 className="text-[16px] font-bold">{s.title}</h4>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-md text-[11px] font-medium bg-[#f5f7fa] text-[#6b7280]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16v16H4z" /><path d="M4 10h16" /><path d="M10 4v16" /></svg>
                      {recurrenceLabel}
                    </span>
                    {dayChips && timeLabel && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-md text-[11px] font-medium bg-[#f5f7fa] text-[#6b7280]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        {dayChips} &middot; {timeLabel}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-md text-[11px] font-medium bg-[#f5f7fa] text-[#6b7280]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 2L13 7M17 17l2 2-2 2" /><line x1="11" y1="5" x2="17" y2="5" /><line x1="11" y1="19" x2="17" y2="19" /></svg>
                      {s.duration_minutes} min
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <div className="relative group">
                  <button
                    onClick={() => addAllToCal(s)}
                    className="flex items-center gap-1 px-3 py-[6px] rounded-[10px] text-[11px] font-semibold border border-[#e4e8ee] bg-white text-[#6b7280] hover:border-[#0d9668] hover:text-[#0d9668] transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    Add all to calendar
                  </button>
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-md bg-[#111827] text-white text-[11px] whitespace-nowrap z-10 after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[5px] after:border-transparent after:border-t-[#111827]">
                    Adds all upcoming sessions to your calendar
                  </div>
                </div>
              </div>
            </div>

            {/* Next session highlight */}
            {nextOcc && (
              <div className="px-5 py-4 bg-gradient-to-r from-[#ecfdf5] to-[#d1fae5] border-b border-[#a7f3d0] flex items-center gap-4 flex-wrap">
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide text-white flex-shrink-0 ${nextStatus === 'live' ? 'bg-[#ef4444] animate-pulse' : 'bg-[#0d9668]'}`} style={nextStatus !== 'live' ? { animation: 'glow 2s infinite' } : undefined}>
                  {nextStatus === 'live' ? 'Live now' : 'Next up'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-[#14532d]">{fmtDateLong(nextOcc.scheduled_start_at)}</p>
                  <p className="text-[12px] text-[#166534] mt-px">
                    {fmtTime(nextOcc.scheduled_start_at)} – {fmtTime(nextOcc.scheduled_end_at)}
                    {nextStatus !== 'live' && ' · Meeting link opens 15 min before'}
                  </p>
                </div>
                {nextStatus !== 'live' && <Countdown target={new Date(nextOcc.scheduled_start_at)} />}
                {nextStatus === 'live' ? (
                  <button
                    onClick={() => onJoin(s.id, nextOcc.id)}
                    disabled={joiningOccurrenceId === nextOcc.id}
                    className="px-5 py-[9px] rounded-[10px] bg-[#0d9668] text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-[0_2px_8px_rgba(13,150,104,0.25)] hover:bg-[#047857] hover:-translate-y-px transition-all disabled:opacity-40 disabled:transform-none flex-shrink-0 ml-3"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.069A1 1 0 0121 8.876v6.248a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                    {joiningOccurrenceId === nextOcc.id ? 'Opening…' : 'Join Now'}
                  </button>
                ) : (
                  <button disabled className="px-5 py-[9px] rounded-[10px] bg-[#0d9668] text-white text-[12px] font-semibold flex items-center gap-1.5 opacity-40 cursor-not-allowed flex-shrink-0 ml-3">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 10l5 5-5 5" /><path d="M20 15H8a4 4 0 01-4-4V4" /></svg>
                    Not yet open
                  </button>
                )}
              </div>
            )}

            {/* Attendance summary bar */}
            <div className="px-5 py-3 bg-[#f5f7fa] border-b border-[#e4e8ee] flex items-center gap-4 text-[12px] flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[#6b7280]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <strong className="font-bold text-[#111827]">{futureOccs.length}</strong> upcoming
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#6b7280]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9668" strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>
                <strong className="font-bold text-[#111827]">{attendedCount}</strong> attended
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#6b7280]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                <strong className="font-bold text-[#111827]">{missedCount}</strong> missed
              </span>
              {pastOccs.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[#6b7280] ml-auto">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 8v4l2 2" /></svg>
                  Your attendance: <strong className={`font-bold ${attendancePct >= 80 ? 'text-[#0d9668]' : attendancePct >= 50 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>{attendancePct}%</strong>
                </span>
              )}
            </div>

            {/* Session list */}
            <div>
              {/* Past occurrences */}
              {pastOccs.slice(0, 2).map((occ) => {
                const start = new Date(occ.scheduled_start_at);
                const isCancelled = occ.status === 'cancelled';
                return (
                  <div key={occ.id} className="flex items-center px-5 py-3.5 border-b border-[#f1f5f9] gap-3.5 hover:bg-[rgba(0,0,0,0.005)] transition-colors">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isCancelled ? 'bg-[#fee2e2] border-2 border-[#ef4444]' : 'bg-[#f5f7fa] border-2 border-[#d1d5db]'}`} />
                    <div className="w-[52px] text-center flex-shrink-0">
                      <p className="text-[18px] font-extrabold leading-none text-[#6b7280]">{start.getDate()}</p>
                      <p className="text-[9px] font-semibold uppercase text-[#6b7280] mt-px">{start.toLocaleString(undefined, { month: 'short' })}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium ${isCancelled ? 'text-[#ef4444] line-through' : 'text-[#6b7280] line-through'}`}>{fmtDateLong(occ.scheduled_start_at)}</p>
                      <p className="text-[12px] text-[#9ca3af] mt-px">{fmtTime(occ.scheduled_start_at)} – {fmtTime(occ.scheduled_end_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isCancelled ? (
                        <span className="inline-flex items-center gap-1 px-3 py-[5px] rounded-md text-[11px] font-semibold bg-[#fee2e2] text-[#ef4444]">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          Cancelled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-[5px] rounded-md text-[11px] font-semibold bg-[#d1fae5] text-[#047857]">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                          Attended
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Future occurrences */}
              {visibleFuture.map((occ) => {
                const start = new Date(occ.scheduled_start_at);
                const status = occStatus(occ);
                const rsvp = rsvps[occ.id];
                const saving = rsvpSaving === occ.id;
                const isGoing = rsvp?.status === 'attending';
                const isNotGoing = rsvp?.status === 'not_attending';

                return (
                  <div key={occ.id} className="flex items-center px-5 py-3.5 border-b border-[#f1f5f9] gap-3.5 hover:bg-[rgba(0,0,0,0.005)] transition-colors">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status === 'live' ? 'bg-[#fee2e2] border-2 border-[#ef4444] animate-pulse' : 'bg-[#d1fae5] border-2 border-[#0d9668]'}`} />
                    <div className="w-[52px] text-center flex-shrink-0">
                      <p className="text-[18px] font-extrabold leading-none text-[#047857]">{start.getDate()}</p>
                      <p className="text-[9px] font-semibold uppercase text-[#6b7280] mt-px">{start.toLocaleString(undefined, { month: 'short' })}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold">{fmtDateLong(occ.scheduled_start_at)}</p>
                      <p className="text-[12px] text-[#6b7280] mt-px">{fmtTime(occ.scheduled_start_at)} – {fmtTime(occ.scheduled_end_at)}</p>
                      {isNotGoing && rsvp.reason && (
                        <p className="text-[11px] text-[#6b7280] italic mt-0.5">&ldquo;{rsvp.reason}&rdquo;</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Going / Absent buttons */}
                      <button
                        onClick={() => submitRsvp(s.id, occ.id, 'attending')}
                        disabled={saving}
                        className={`flex items-center gap-1 px-2.5 py-[5px] rounded-md text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-40 ${
                          isGoing
                            ? 'border border-[#0d9668] bg-[#d1fae5] text-[#047857]'
                            : 'border border-[#e4e8ee] bg-white text-[#6b7280] hover:border-[#0d9668] hover:text-[#0d9668] hover:bg-[#ecfdf5]'
                        }`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                        Going
                      </button>
                      <button
                        onClick={() => { setReasonModal({ occurrenceId: occ.id, sessionId: s.id }); setReasonText(''); }}
                        disabled={saving}
                        className={`flex items-center gap-1 px-2.5 py-[5px] rounded-md text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-40 ${
                          isNotGoing
                            ? 'border border-[#ef4444] bg-[#fee2e2] text-[#991b1b]'
                            : 'border border-[#e4e8ee] bg-white text-[#6b7280] hover:border-[#ef4444] hover:text-[#991b1b] hover:bg-[#fef2f2]'
                        }`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        Absent
                      </button>

                      {/* Status badge */}
                      {status === 'live' ? (
                        <button
                          onClick={() => onJoin(s.id, occ.id)}
                          disabled={joiningOccurrenceId === occ.id}
                          className="px-3.5 py-[5px] rounded-md bg-[#0d9668] hover:bg-[#047857] text-white text-[11px] font-semibold transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.069A1 1 0 0121 8.876v6.248a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                          {joiningOccurrenceId === occ.id ? 'Opening…' : 'Join'}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-[5px] rounded-md text-[11px] font-semibold bg-[#f5f7fa] text-[#6b7280] flex-shrink-0">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                          Not yet open
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show more / less */}
            {hiddenCount > 0 && (
              <div className="text-center px-5 py-3.5 border-t border-[#e4e8ee]">
                <button
                  onClick={() => setExpandedSessions((p) => ({ ...p, [s.id]: !isExpanded }))}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-[10px] border border-[#e4e8ee] bg-white text-[12px] font-semibold text-[#6b7280] hover:border-[#0d9668] hover:text-[#0d9668] hover:bg-[#d1fae5] transition-colors"
                >
                  <span>{isExpanded ? 'Show less' : `Show ${hiddenCount} more session${hiddenCount === 1 ? '' : 's'}`}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </div>
            )}

            {futureOccs.length === 0 && pastOccs.length > 0 && (
              <div className="px-5 py-3.5 bg-amber-50 border-t border-amber-100">
                <p className="text-[12px] text-amber-700 font-medium">No upcoming sessions — the tutor may add new dates soon.</p>
              </div>
            )}
            {futureOccs.length === 0 && pastOccs.length === 0 && (
              <div className="px-5 py-5 text-center">
                <p className="text-[12px] text-[#9ca3af]">No sessions have been scheduled yet.</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Reason modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReasonModal(null)}>
          <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-[420px] mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-[16px] font-bold">Can&apos;t make it?</h3>
              <p className="text-[12px] text-[#6b7280] mt-1">Let your tutor know why you won&apos;t be attending. This helps them track absences.</p>
            </div>
            <div className="px-6 py-3">
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="e.g. I have a doctor's appointment, family event, etc. (optional)"
                className="w-full p-3 border border-[#e4e8ee] rounded-[10px] text-[13px] min-h-[90px] resize-y outline-none leading-relaxed transition-colors focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5] placeholder:text-[#9ca3af]"
              />
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button onClick={() => setReasonModal(null)} className="px-4 py-2 rounded-[10px] text-[12px] font-semibold text-[#6b7280] border border-[#e4e8ee] hover:bg-[#f5f7fa] transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmitReason}
                disabled={rsvpSaving === reasonModal.occurrenceId}
                className="px-5 py-2 rounded-[10px] bg-[#ef4444] text-white text-[12px] font-semibold hover:bg-[#dc2626] transition-colors disabled:opacity-40"
              >
                {rsvpSaving === reasonModal.occurrenceId ? 'Saving…' : 'Confirm Not Attending'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
