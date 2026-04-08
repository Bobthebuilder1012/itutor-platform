'use client';

import { useState, useMemo, useEffect } from 'react';
import type { GroupSessionWithOccurrences, GroupOccurrence } from '@/lib/types/groups';

interface StudentSessionsTabProps {
  sessions: GroupSessionWithOccurrences[];
  loading: boolean;
  groupId: string;
  onJoin: (sessionId: string, occurrenceId: string) => void;
  joiningOccurrenceId: string | null;
}

type OccStatus = 'too_early' | 'live' | 'ended';

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

export default function StudentSessionsTab({ sessions, loading, groupId, onJoin, joiningOccurrenceId }: StudentSessionsTabProps) {
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
      </div>
    );
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

        const nextOcc = futureOccs[0] ?? null;
        const nextStatus = nextOcc ? occStatus(nextOcc) : null;
        const isExpanded = expandedSessions[s.id] ?? false;
        const visibleFuture = isExpanded ? futureOccs : futureOccs.slice(0, INITIAL_VISIBLE);
        const hiddenCount = futureOccs.length - INITIAL_VISIBLE;

        const recurrenceLabel =
          s.recurrence_type === 'none'
            ? 'One-time'
            : s.recurrence_type === 'weekly'
            ? 'Weekly'
            : 'Daily';
        const dayChips =
          s.recurrence_type === 'weekly' && s.recurrence_days?.length
            ? s.recurrence_days.map((d) => DAY_LABELS[d]).join(', ')
            : null;
        const timeLabel = nextOcc ? fmtTime(nextOcc.scheduled_start_at) : '';

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
            </div>

            {/* Next up highlight */}
            {nextOcc && (
              <div className="px-5 py-4 bg-gradient-to-r from-[#ecfdf5] to-[#d1fae5] border-b border-[#a7f3d0] flex items-center gap-4 flex-wrap">
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide text-white flex-shrink-0 ${nextStatus === 'live' ? 'bg-[#ef4444] animate-pulse' : 'bg-[#0d9668]'}`}>
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
                  <button
                    disabled
                    className="px-5 py-[9px] rounded-[10px] bg-[#0d9668] text-white text-[12px] font-semibold flex items-center gap-1.5 opacity-40 cursor-not-allowed flex-shrink-0 ml-3"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    Not yet open
                  </button>
                )}
              </div>
            )}

            {/* Attendance summary bar */}
            <div className="px-5 py-3 bg-[#f5f7fa] border-b border-[#e4e8ee] flex items-center gap-5 text-[12px] flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[#6b7280]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <strong className="font-bold text-[#111827]">{futureOccs.length}</strong> upcoming
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#6b7280]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9668" strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>
                <strong className="font-bold text-[#111827]">{pastOccs.length}</strong> completed
              </span>
            </div>

            {/* Session occurrence rows */}
            <div>
              {/* Past occurrences (most recent first, max 2) */}
              {pastOccs.slice(0, 2).map((occ) => {
                const start = new Date(occ.scheduled_start_at);
                const end = new Date(occ.scheduled_end_at);
                return (
                  <div key={occ.id} className="flex items-center px-5 py-3.5 border-b border-[#f1f5f9] gap-3.5 hover:bg-[rgba(0,0,0,0.005)] transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f5f7fa] border-2 border-[#d1d5db] flex-shrink-0" />
                    <div className="w-[52px] text-center flex-shrink-0">
                      <p className="text-[18px] font-extrabold leading-none text-[#6b7280]">{start.getDate()}</p>
                      <p className="text-[9px] font-semibold uppercase text-[#6b7280] mt-px">{start.toLocaleString(undefined, { month: 'short' })}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#6b7280] line-through">{fmtDateLong(occ.scheduled_start_at)}</p>
                      <p className="text-[12px] text-[#9ca3af] mt-px">{fmtTime(occ.scheduled_start_at)} – {fmtTime(occ.scheduled_end_at)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-[5px] rounded-md text-[11px] font-semibold bg-[#f5f7fa] text-[#6b7280] flex-shrink-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                      Completed
                    </span>
                  </div>
                );
              })}

              {/* Future occurrences */}
              {visibleFuture.map((occ) => {
                const start = new Date(occ.scheduled_start_at);
                const status = occStatus(occ);
                const isNext = nextOcc && occ.id === nextOcc.id;

                const statusBadge = status === 'live' ? (
                  <span className="inline-flex items-center gap-1 px-3 py-[5px] rounded-md text-[11px] font-semibold bg-[#fee2e2] text-[#ef4444] animate-pulse flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></svg>
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-[5px] rounded-md text-[11px] font-semibold bg-[#f5f7fa] text-[#6b7280] flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    Not yet open
                  </span>
                );

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
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {status === 'live' && (
                        <button
                          onClick={() => onJoin(s.id, occ.id)}
                          disabled={joiningOccurrenceId === occ.id}
                          className="px-3.5 py-[5px] rounded-md bg-[#0d9668] hover:bg-[#047857] text-white text-[11px] font-semibold transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 10l4.553-2.069A1 1 0 0121 8.876v6.248a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                          {joiningOccurrenceId === occ.id ? 'Opening…' : 'Join'}
                        </button>
                      )}
                      {statusBadge}
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

            {/* No upcoming hint */}
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
    </div>
  );
}
