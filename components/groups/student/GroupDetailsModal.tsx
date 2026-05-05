'use client';

import { useEffect, useMemo, useState } from 'react';

type GroupDetailsModalProps = {
  groupId: string;
  onClose: () => void;
  onMessageTutor: () => void;
  onJoinRequested: (groupId: string) => Promise<void>;
};

type GroupDetailsPayload = {
  id: string;
  name: string;
  description?: string | null;
  subject?: string | null;
  topic?: string | null;
  form_level?: string | null;
  session_length_minutes?: number | null;
  session_frequency?: string | null;
  member_count?: number;
  tutor_id: string;
  cover_image?: string | null;
  tutor?: {
    id?: string;
    full_name?: string | null;
    avatar_url?: string | null;
    rating_average?: number | null;
    rating_count?: number | null;
    response_time_minutes?: number | null;
  } | null;
  next_occurrence?: { scheduled_start_at: string } | null;
  upcoming_sessions?: Array<{ id: string; scheduled_start_at: string; scheduled_end_at?: string; title?: string }>;
  sessions?: Array<{ id: string }>;
  reviews?: Array<{
    id: string;
    rating: number;
    comment?: string | null;
    created_at: string;
    reviewer?: { full_name?: string | null };
  }>;
  other_classes_by_tutor?: Array<{ id: string; name: string; subject?: string | null }>;
  key_info?: {
    form_level?: string | null;
    session_length_minutes?: number | null;
    session_frequency?: string | null;
    members?: number;
    tutor_response_time?: number | null;
    price_per_session?: number | null;
    price_per_course?: number | null;
    pricing_mode?: string | null;
    availability_window?: string | null;
  };
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function GroupDetailsModal({
  groupId,
  onClose,
  onMessageTutor,
  onJoinRequested,
}: GroupDetailsModalProps) {
  const [group, setGroup] = useState<GroupDetailsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/groups/${groupId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const nextGroup = (data?.group ?? data?.data?.group) as GroupDetailsPayload;
        setGroup(nextGroup);
        const firstDate = nextGroup?.upcoming_sessions?.[0]?.scheduled_start_at;
        if (firstDate) setSelectedDay(dayKey(firstDate));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const byDay = useMemo(() => {
    const map = new Map<string, GroupDetailsPayload['upcoming_sessions']>();
    for (const s of group?.upcoming_sessions ?? []) {
      const key = dayKey(s.scheduled_start_at);
      const existing = map.get(key) ?? [];
      existing.push(s);
      map.set(key, existing);
    }
    return map;
  }, [group?.upcoming_sessions]);

  const selectedSessions = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const calendarMonth = useMemo(() => {
    const first = group?.upcoming_sessions?.[0]?.scheduled_start_at;
    return first ? new Date(first) : new Date();
  }, [group?.upcoming_sessions]);
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number; key: string; highlighted: boolean } | null> = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${month}-${day}`;
      cells.push({ day, key, highlighted: byDay.has(key) });
    }
    return cells;
  }, [calendarMonth, byDay]);
  const hasConfiguredSessions = (group?.sessions?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 p-4 md:p-8 overflow-y-auto" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Class details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">Close</button>
        </div>

        {loading || !group ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading class details...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5">
            <section className="lg:col-span-2 space-y-5">
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="h-52 bg-gradient-to-br from-emerald-100 to-cyan-100">
                  {group.cover_image ? (
                    <img src={group.cover_image} alt={group.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-4xl">📚</div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-bold text-gray-900">{group.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                    <span>Tutor: {group.tutor?.full_name ?? 'Tutor'}</span>
                    <span>Members: {group.member_count ?? group.key_info?.members ?? 0}</span>
                    <span>
                      Rating: {group.tutor?.rating_average ? `${group.tutor.rating_average.toFixed(1)} (${group.tutor?.rating_count ?? 0})` : 'No reviews'}
                    </span>
                  </div>
                  {group.description && <p className="mt-3 text-sm text-gray-600">{group.description}</p>}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Session calendar</h4>
                <p className="text-xs text-gray-500 mb-2">
                  {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
                <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-500 mb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <span key={d} className="text-center">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell, index) => {
                    if (!cell) {
                      return <div key={`empty-${index}`} className="h-8 rounded-md bg-gray-50" />;
                    }
                    const active = cell.key === selectedDay;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        disabled={!cell.highlighted}
                        onClick={() => setSelectedDay(cell.key)}
                        className={`h-8 rounded-md text-xs border ${
                          active
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : cell.highlighted
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-gray-100 text-gray-300 bg-gray-50'
                        }`}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
                {selectedSessions.length > 0 && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    {selectedSessions.map((s) => (
                      <p key={s.id} className="text-sm text-gray-700">{s.title ?? 'Session'} - {formatDateTime(s.scheduled_start_at)}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Next sessions</h4>
                <div className="space-y-1">
                  {(group.upcoming_sessions ?? []).slice(0, 6).map((s) => (
                    <p key={s.id} className="text-sm text-gray-600">
                      {formatDateTime(s.scheduled_start_at)}{s.title ? ` - ${s.title}` : ''}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Reviews</h4>
                {(group.reviews ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">No reviews yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(group.reviews ?? []).slice(0, 4).map((r) => (
                      <div key={r.id} className="rounded-lg bg-gray-50 p-3">
                        <p className="text-sm font-semibold text-gray-800">{'★'.repeat(Math.max(1, Number(r.rating ?? 0)))}</p>
                        {r.comment && <p className="text-sm text-gray-600 mt-1">{r.comment}</p>}
                        <p className="text-xs text-gray-400 mt-1">- {r.reviewer?.full_name ?? 'Student'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Key information</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>Form level: {group.key_info?.form_level ?? group.form_level ?? 'N/A'}</p>
                  <p>Session length: {group.key_info?.session_length_minutes ?? group.session_length_minutes ?? 'N/A'} min</p>
                  <p>Frequency: {group.key_info?.session_frequency ?? group.session_frequency ?? 'N/A'}</p>
                  <p>Members: {group.key_info?.members ?? group.member_count ?? 0}</p>
                  <p>Tutor response: {group.key_info?.tutor_response_time ? `~${group.key_info.tutor_response_time} mins` : 'N/A'}</p>
                  <p>
                    Price: {group.key_info?.price_per_session ? `$${group.key_info.price_per_session}/session` : group.key_info?.price_per_course ? `$${group.key_info.price_per_course}/month` : 'Free'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Other classes by tutor</h4>
                {(group.other_classes_by_tutor ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">No other classes yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(group.other_classes_by_tutor ?? []).map((c) => (
                      <p key={c.id} className="text-sm text-gray-600">{c.name}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => onMessageTutor()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Message Tutor
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!hasConfiguredSessions) return;
                    setRequesting(true);
                    try {
                      await onJoinRequested(group.id);
                    } finally {
                      setRequesting(false);
                    }
                  }}
                  disabled={requesting || !hasConfiguredSessions}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {requesting
                    ? 'Sending request...'
                    : hasConfiguredSessions
                    ? 'Ask to Join Session'
                    : 'Sessions not available yet'}
                </button>
                {!hasConfiguredSessions && (
                  <p className="text-xs text-amber-600">
                    Students can request to join after the tutor adds at least one session.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
