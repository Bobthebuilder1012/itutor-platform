'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';

export type ScheduleCalendarRole = 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';

type BookingEmbed = { subject_id: string | null; status: string | null } | null;

function getBookingEmbed(row: { bookings?: BookingEmbed | BookingEmbed[] }): BookingEmbed {
  const b = row.bookings;
  if (Array.isArray(b)) return b[0] ?? null;
  return b ?? null;
}

export type ScheduleEvent = {
  id: string;
  bookingId: string;
  studentId: string;
  tutorId: string;
  start: Date;
  end: Date;
  subjectLabel: string;
  colorKey: SessionColorKey;
  counterpartyLabel: string;
  childLabel?: string;
};

type SessionColorKey = 'math' | 'science' | 'english' | 'history' | 'coding';

type SessionColorStyle = {
  glow: string;
  bg: string;
  border: string;
  text: string;
};

const SESSION_COLORS: Record<SessionColorKey, SessionColorStyle> = {
  math: {
    glow: '#4ade80',
    bg: 'rgba(74,222,128,0.08)',
    border: 'rgba(74,222,128,0.35)',
    text: '#a7f3c0',
  },
  science: {
    glow: '#86efac',
    bg: 'rgba(134,239,172,0.08)',
    border: 'rgba(134,239,172,0.35)',
    text: '#bbf7d0',
  },
  english: {
    glow: '#d1fae5',
    bg: 'rgba(209,250,229,0.06)',
    border: 'rgba(209,250,229,0.3)',
    text: '#d1fae5',
  },
  history: {
    glow: '#6ee7b7',
    bg: 'rgba(110,231,183,0.08)',
    border: 'rgba(110,231,183,0.35)',
    text: '#a7f3d0',
  },
  coding: {
    glow: '#34d399',
    bg: 'rgba(52,211,153,0.09)',
    border: 'rgba(52,211,153,0.4)',
    text: '#6ee7b7',
  },
};

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Full day on week grid: 12am (0) through 11pm (23). */
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELL_H = 64;
const TIME_W = 60;

/** Human-friendly short TZ (e.g. "GMT -04") — avoids "GMT--4" from naive string replace. */
function formatTimezoneShort(raw: string | undefined): string {
  if (!raw?.trim()) return 'Local';
  const t = raw.trim();
  const m = t.match(/^GMT\s*([+-])\s*(\d{1,2})(?::(\d{2}))?$/i);
  if (m) {
    const sign = m[1];
    const hours = m[2].padStart(2, '0');
    return `GMT ${sign}${hours}`;
  }
  return t;
}

function fmtFromDate(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  const s = h >= 12 ? 'pm' : 'am';
  const hh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hh}:${String(m).padStart(2, '0')}${s}`;
}

function subjectToColorKey(subject: string): SessionColorKey {
  const s = subject.toLowerCase();
  if (/math|calculus|algebra|geometry|statistics/.test(s)) return 'math';
  if (/phys|chemistry|bio|science|chem/.test(s)) return 'science';
  if (/english|literature|language|reading|writing/.test(s)) return 'english';
  if (/history|social|geography|civic/.test(s)) return 'history';
  if (/code|computer|python|java|program/.test(s)) return 'coding';
  return 'math';
}

function getWeekDates(baseDate: Date) {
  const sunday = new Date(baseDate);
  sunday.setDate(baseDate.getDate() - baseDate.getDay());
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Fixed 6×7 cells for year mini-calendars (pad before/after month). */
function buildYearMonthCells(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1);
  const pad = first.getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);
  return cells;
}

function bookingHref(role: ScheduleCalendarRole, bookingId: string, studentId: string): string | null {
  if (role === 'student') return `/student/bookings/${bookingId}`;
  if (role === 'tutor') return `/tutor/bookings/${bookingId}`;
  if (role === 'parent') return `/parent/child/${studentId}/bookings`;
  if (role === 'admin') return `/admin/dashboard`;
  return null;
}

function GlassBtn({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(74,222,128,0.12)' : 'rgba(74,222,128,0.05)',
        border: `1px solid ${hov ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.1)'}`,
        borderRadius: 8,
        padding: 7,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const [hov, setHov] = useState(false);
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={onToggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        width: 56,
        height: 26,
        borderRadius: 999,
        border: `1px solid ${hov ? 'rgba(74,222,128,0.4)' : 'rgba(74,222,128,0.2)'}`,
        background: hov ? 'rgba(74,222,128,0.12)' : 'rgba(74,222,128,0.06)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        cursor: 'pointer',
        transition: 'all 0.18s',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.15)',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: isDark ? 2 : 30,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(167,243,208,0.25), rgba(74,222,128,0.15))',
          border: '1px solid rgba(167,243,208,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'left 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}
      >
        {isDark ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#d1fae5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#065f46" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        )}
      </span>
    </button>
  );
}

function TodayBtn({ onClick, theme = 'dark' }: { onClick: () => void; theme?: 'dark' | 'light' }) {
  const [hov, setHov] = useState(false);
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '5px 16px',
        borderRadius: 20,
        border: isLight
          ? `1px solid ${hov ? 'rgba(25,147,86,0.55)' : 'rgba(25,147,86,0.3)'}`
          : `1px solid ${hov ? 'rgba(74,222,128,0.45)' : 'rgba(74,222,128,0.2)'}`,
        background: isLight
          ? (hov ? 'rgba(25,147,86,0.14)' : 'rgba(25,147,86,0.06)')
          : (hov ? 'rgba(74,222,128,0.12)' : 'rgba(74,222,128,0.05)'),
        color: isLight ? '#199356' : 'rgba(167,243,208,0.85)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '0.3px',
        transition: 'all 0.18s',
      }}
    >
      Today
    </button>
  );
}

/** Vibrant solid emerald (reference lockup). */
const ITUTOR_LOGO_GREEN = '#10b981';

/**
 * Dot upper-left + thick pill ~36° CW; sized to align with wordmark cap / ascender band.
 */
function ITutorMark({ height = 22 }: { height?: number }) {
  const vbW = 38;
  const vbH = 24;
  const width = (height * vbW) / vbH;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="10.9" cy="6.55" r="2.8" fill={ITUTOR_LOGO_GREEN} />
      <rect
        x="15.5"
        y="3.45"
        width="7.15"
        height="18"
        rx="3.575"
        fill={ITUTOR_LOGO_GREEN}
        transform="rotate(36 19.075 12.45)"
      />
    </svg>
  );
}

function ITutorLogo({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: 18,
        columnGap: '0.04em',
      }}
    >
      <ITutorMark height={22} />
      <span
        style={{
          fontFamily: "'Plus Jakarta Sans', 'Inter', 'DM Sans', ui-sans-serif, system-ui, sans-serif",
          fontWeight: 500,
          fontSize: 'inherit',
          lineHeight: 1,
          letterSpacing: '-0.035em',
          color: theme === 'dark' ? '#ffffff' : '#052e1d',
          textTransform: 'lowercase',
        }}
      >
        itutor
      </span>
    </div>
  );
}

async function loadEvents(userId: string, role: ScheduleCalendarRole): Promise<ScheduleEvent[]> {
  if (role === 'reviewer') return [];

  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 7);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);

  let childIds: string[] = [];
  if (role === 'parent') {
    const { data: links } = await supabase.from('parent_child_links').select('child_id').eq('parent_id', userId);
    childIds = (links ?? []).map((r) => r.child_id as string);
    if (childIds.length === 0) return [];
  }

  let query = supabase
    .from('sessions')
    .select(
      'id, booking_id, student_id, tutor_id, scheduled_start_at, scheduled_end_at, status, bookings ( subject_id, status )'
    )
    .in('status', ['SCHEDULED', 'JOIN_OPEN'])
    .gte('scheduled_start_at', rangeStart.toISOString())
    .lte('scheduled_start_at', rangeEnd.toISOString())
    .order('scheduled_start_at', { ascending: true });

  if (role === 'student') query = query.eq('student_id', userId);
  else if (role === 'tutor') query = query.eq('tutor_id', userId);
  else if (role === 'parent') query = query.in('student_id', childIds);

  query = query.limit(500);

  const { data: rows, error } = await query;
  if (error) return [];

  const filtered = (rows ?? []).filter((row: { bookings?: BookingEmbed | BookingEmbed[] }) => {
    const st = getBookingEmbed(row)?.status;
    return !st || !['CANCELLED', 'DECLINED', 'PARENT_REJECTED'].includes(st);
  });

  const subjectIds = [
    ...new Set(filtered.map((r) => getBookingEmbed(r)?.subject_id).filter(Boolean)),
  ] as string[];
  const profileIds = [...new Set(filtered.flatMap((r: { student_id: string; tutor_id: string }) => [r.student_id, r.tutor_id]))];

  const [{ data: subjects }, { data: profiles }] = await Promise.all([
    subjectIds.length
      ? supabase.from('subjects').select('id, name, label').in('id', subjectIds)
      : Promise.resolve({ data: [] as { id: string; name: string; label: string | null }[] }),
    profileIds.length
      ? supabase.from('profiles').select('id, full_name, display_name, username').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name?: string; display_name?: string; username?: string }[] }),
  ]);

  const subMap = new Map((subjects ?? []).map((s) => [s.id, s.label || s.name || 'Session']));
  const profMap = new Map((profiles ?? []).map((p) => [p.id, getDisplayName(p)]));

  const out: ScheduleEvent[] = [];
  for (const row of filtered as {
    id: string;
    booking_id: string;
    student_id: string;
    tutor_id: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
    bookings?: BookingEmbed | BookingEmbed[];
  }[]) {
    const embed = getBookingEmbed(row);
    const sid = embed?.subject_id;
    const subjectLabel = sid ? subMap.get(sid) || 'Session' : 'Session';
    let counterparty = '';
    let childLabel: string | undefined;
    if (role === 'student' || (role === 'parent' && row.student_id)) {
      counterparty = profMap.get(row.tutor_id) || 'Tutor';
      if (role === 'parent') childLabel = profMap.get(row.student_id) || 'Student';
    } else if (role === 'tutor') {
      counterparty = profMap.get(row.student_id) || 'Student';
    } else {
      counterparty = `${profMap.get(row.student_id) || 'Student'} · ${profMap.get(row.tutor_id) || 'Tutor'}`;
    }

    out.push({
      id: row.id,
      bookingId: row.booking_id,
      studentId: row.student_id,
      tutorId: row.tutor_id,
      start: new Date(row.scheduled_start_at),
      end: new Date(row.scheduled_end_at),
      subjectLabel,
      colorKey: subjectToColorKey(subjectLabel),
      counterpartyLabel: counterparty,
      childLabel,
    });
  }
  return out;
}

interface ScheduleCalendarModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  role: ScheduleCalendarRole;
}

export default function ScheduleCalendarModal({ open, onClose, userId, role }: ScheduleCalendarModalProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<'week' | 'month' | 'year'>('week');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('itutor-cal-theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('itutor-cal-theme', theme);
  }, [theme]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const refresh = useCallback(async () => {
    if (!open || !userId) return;
    setLoading(true);
    try {
      const ev = await loadEvents(userId, role);
      setEvents(ev);
    } finally {
      setLoading(false);
    }
  }, [open, userId, role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedEvent) setSelectedEvent(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, selectedEvent]);

  const hasUpcoming = events.some((e) => e.end.getTime() >= Date.now());
  const weekDates = useMemo(() => getWeekDates(cursor), [cursor]);

  const eventsInWeek = useMemo(() => {
    const start = weekDates[0];
    const end = new Date(weekDates[6]);
    end.setHours(23, 59, 59, 999);
    return events.filter((e) => e.start <= end && e.end >= start);
  }, [events, weekDates]);

  const monthMatrix = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const monthWeekRows = useMemo(() => Math.ceil(monthMatrix.length / 7), [monthMatrix]);

  const yearMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => new Date(cursor.getFullYear(), i, 1)), [cursor]);

  useEffect(() => {
    if (open && view === 'week' && scrollRef.current) {
      const h = new Date().getHours();
      scrollRef.current.scrollTop = Math.max(0, (h - 2) * CELL_H);
    }
  }, [open, view, weekDates]);

  const today = new Date();
  const isToday = (date: Date) => isSameDay(date, today);

  const nowTop = (() => {
    const now = new Date();
    return (now.getHours() + now.getMinutes() / 60) * CELL_H;
  })();

  function eventTop(d: Date) {
    return (d.getHours() + d.getMinutes() / 60) * CELL_H;
  }
  function eventHeightMs(start: Date, end: Date) {
    const hours = (end.getTime() - start.getTime()) / 3600000;
    return Math.max(hours * CELL_H, 28);
  }

  function prev() {
    const d = new Date(cursor);
    if (view === 'week') d.setDate(d.getDate() - 7);
    else if (view === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    setCursor(d);
  }
  function next() {
    const d = new Date(cursor);
    if (view === 'week') d.setDate(d.getDate() + 7);
    else if (view === 'month') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    setCursor(d);
  }
  function goToday() {
    setCursor(new Date());
  }

  const monthLabel = weekDates[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const headerLabel =
    view === 'year'
      ? String(cursor.getFullYear())
      : view === 'month'
        ? cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const upcomingSorted = useMemo(
    () =>
      [...events]
        .filter((e) => e.end.getTime() >= Date.now())
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events]
  );

  const tzShort = formatTimezoneShort(
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
          .formatToParts(new Date())
          .find((p) => p.type === 'timeZoneName')?.value
      : undefined
  );

  function openBooking() {
    const href = selectedEvent ? bookingHref(role, selectedEvent.bookingId, selectedEvent.studentId) : null;
    if (!href) return;
    setSelectedEvent(null);
    onClose();
    router.push(href);
  }

  function fabNavigate() {
    onClose();
    if (role === 'tutor') router.push('/tutor/bookings');
    else if (role === 'parent') router.push('/parent/approve-bookings');
    else if (role === 'admin') router.push('/admin/dashboard');
    else router.push('/student/find-tutors');
  }

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600&family=Inter:wght@500;600&family=Sora:wght@400;500;600;700;800&family=DM+Sans:wght@500&family=DM+Mono:wght@400;500&display=swap');
        .itutor-cal-scroll::-webkit-scrollbar { width: 5px; }
        .itutor-cal-scroll::-webkit-scrollbar-track { background: transparent; }
        .itutor-cal-scroll::-webkit-scrollbar-thumb { background: rgba(74,222,128,0.18); border-radius: 4px; }
        .itutor-ev-card { transition: transform 0.15s, box-shadow 0.2s !important; }
        .itutor-ev-card:hover { transform: translateY(-1px) scale(1.012) !important; z-index: 20 !important; }
        @keyframes itutor-pulse-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
          50% { opacity: 0.85; box-shadow: 0 0 0 5px rgba(74,222,128,0); }
        }
        @keyframes itutor-slide-up {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes itutor-bg-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
        .itutor-modal-anim { animation: itutor-slide-up 0.22s cubic-bezier(0.34,1.56,0.64,1); }
        .itutor-bg-anim { animation: itutor-bg-fade 0.18s ease; }

        /* ===== Light mode overrides (white / black / green) ===== */
        [data-cal-theme="light"] { color-scheme: light; }
        [data-cal-theme="light"] .itutor-cal-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); }
        [data-cal-theme="light"] .itutor-cal-scroll::-webkit-scrollbar-track { background: transparent; }

        /* Aside / event list panel */
        [data-cal-theme="light"] aside { background: #ffffff !important; }
        [data-cal-theme="light"] aside h3,
        [data-cal-theme="light"] aside li,
        [data-cal-theme="light"] aside span,
        [data-cal-theme="light"] aside div { color: #000000 !important; }
        [data-cal-theme="light"] aside p { color: rgba(0,0,0,0.55) !important; }
        [data-cal-theme="light"] aside, [data-cal-theme="light"] aside * { border-color: rgba(0,0,0,0.08) !important; }

        /* Time gutter & grid labels */
        [data-cal-theme="light"] .itutor-time-label { color: rgba(0,0,0,0.55) !important; }
        [data-cal-theme="light"] .itutor-day-label { color: rgba(0,0,0,0.55) !important; }
        [data-cal-theme="light"] .itutor-day-number { color: #000000 !important; }
        [data-cal-theme="light"] .itutor-hour-row { border-color: rgba(0,0,0,0.07) !important; }
        [data-cal-theme="light"] .itutor-col-divider { border-color: rgba(0,0,0,0.07) !important; }

        /* Month / year cells */
        [data-cal-theme="light"] .itutor-month-cell { background: #ffffff !important; color: #000000 !important; border-color: rgba(0,0,0,0.08) !important; }
        [data-cal-theme="light"] .itutor-year-mini { background: #ffffff !important; color: #000000 !important; border-color: rgba(0,0,0,0.08) !important; }

        /* Event detail popover */
        [data-cal-theme="light"] .itutor-event-detail { background: #ffffff !important; color: #000000 !important; border-color: rgba(0,0,0,0.1) !important; }
        [data-cal-theme="light"] .itutor-event-detail h2,
        [data-cal-theme="light"] .itutor-event-detail h3 { color: #000000 !important; }
        [data-cal-theme="light"] .itutor-event-detail .meta { color: rgba(0,0,0,0.6) !important; }

        /* FAB green */
        [data-cal-theme="light"] .itutor-fab { box-shadow: 0 10px 30px rgba(25,147,86,0.35) !important; }
      `}</style>

      <div
        data-cal-theme={theme}
        className="fixed inset-0 z-[200] flex flex-col overflow-hidden itutor-cal-root"
        style={{
          fontFamily: "'Sora', 'DM Sans', ui-sans-serif, system-ui, sans-serif",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Schedule calendar"
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            background: theme === 'dark' ? '#030804' : '#ffffff',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-15%',
              left: '5%',
              width: 600,
              height: 600,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(74,222,128,0.055) 0%, transparent 65%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-10%',
              right: '8%',
              width: 700,
              height: 700,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(52,211,153,0.04) 0%, transparent 65%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '45%',
              left: '-8%',
              width: 450,
              height: 450,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(110,231,183,0.03) 0%, transparent 70%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
              backgroundSize: '200px 200px',
              opacity: 0.4,
            }}
          />
        </div>

        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '10px 16px',
              background: theme === 'dark' ? 'rgba(5,12,5,0.8)' : 'rgba(255,255,255,0.75)',
              backdropFilter: 'blur(28px) saturate(180%)',
              WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              borderBottom: theme === 'dark' ? '1px solid rgba(74,222,128,0.1)' : '1px solid rgba(22,101,52,0.14)',
              boxShadow: theme === 'dark' ? '0 1px 0 rgba(74,222,128,0.05)' : '0 1px 0 rgba(22,101,52,0.04)',
              flexShrink: 0,
            }}
          >
            <GlassBtn onClick={onClose} ariaLabel="Close calendar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={theme === 'dark' ? 'rgba(74,222,128,0.65)' : '#199356'} strokeWidth="2.2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </GlassBtn>

            <ITutorLogo theme={theme} />

            <div style={{ width: 1, height: 18, background: theme === 'dark' ? 'rgba(74,222,128,0.15)' : 'rgba(0,0,0,0.12)', margin: '0 2px' }} />

            <span style={{ fontSize: 12, color: theme === 'dark' ? 'rgba(74,222,128,0.45)' : 'rgba(22,101,52,0.65)', fontWeight: 500 }}>Calendar</span>

            <div style={{ flex: 1, minWidth: 8 }} />

            <TodayBtn onClick={goToday} theme={theme} />

            <div style={{ display: 'flex', gap: 3 }}>
              <GlassBtn onClick={prev} ariaLabel="Previous">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={theme === 'dark' ? 'rgba(74,222,128,0.65)' : '#199356'} strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </GlassBtn>
              <GlassBtn onClick={next} ariaLabel="Next">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={theme === 'dark' ? 'rgba(74,222,128,0.65)' : '#199356'} strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </GlassBtn>
            </div>

            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-0.3px',
                maxWidth: 260,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                ...(view === 'year'
                  ? {
                      color: theme === 'dark' ? '#ffffff' : '#052e1d',
                      padding: '6px 16px',
                      borderRadius: 999,
                      background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(22,101,52,0.08)',
                      border: theme === 'dark' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(22,101,52,0.18)',
                    }
                  : {
                      color: theme === 'dark' ? '#d1fae5' : '#065f46',
                    }),
              }}
            >
              {view === 'week' ? monthLabel : headerLabel}
            </span>

            <div style={{ flex: 1, minWidth: 8 }} />

            <GlassBtn ariaLabel="Search (placeholder)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme === 'dark' ? 'rgba(74,222,128,0.55)' : '#199356'} strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </GlassBtn>

            <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />

            <div
              style={{
                display: 'flex',
                gap: 2,
                padding: 3,
                borderRadius: 10,
                background: theme === 'dark' ? 'rgba(74,222,128,0.04)' : 'rgba(25,147,86,0.06)',
                border: theme === 'dark' ? '1px solid rgba(74,222,128,0.1)' : '1px solid rgba(0,0,0,0.08)',
              }}
            >
              {(['Week', 'Month', 'Year'] as const).map((v) => {
                const key = v.toLowerCase() as 'week' | 'month' | 'year';
                const active = view === key;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(key)}
                    style={{
                      padding: '4px 11px',
                      borderRadius: 7,
                      border: 'none',
                      background: active
                        ? (theme === 'dark' ? 'rgba(74,222,128,0.16)' : 'rgba(25,147,86,0.14)')
                        : 'transparent',
                      color: active
                        ? (theme === 'dark' ? '#4ade80' : '#199356')
                        : (theme === 'dark' ? 'rgba(74,222,128,0.38)' : 'rgba(0,0,0,0.55)'),
                      fontFamily: "'Sora',sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: active
                        ? (theme === 'dark' ? '0 0 10px rgba(74,222,128,0.12)' : '0 0 10px rgba(25,147,86,0.18)')
                        : 'none',
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {hasUpcoming && (
              <aside
                className="itutor-cal-scroll w-full shrink-0 overflow-y-auto border-b border-emerald-400/10 p-3 max-lg:max-h-[30vh] lg:max-h-none lg:w-[220px] lg:border-b-0 lg:border-r lg:border-r-emerald-400/10"
                style={{
                  background: 'rgba(4,10,4,0.75)',
                  backdropFilter: 'blur(16px)',
                }}
              >
                <p
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: 1.4,
                    color: 'rgba(74,222,128,0.35)',
                    marginBottom: 10,
                  }}
                >
                  UPCOMING
                </p>
                {loading ? (
                  <p style={{ fontSize: 11, color: 'rgba(74,222,128,0.35)' }}>Loading…</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {upcomingSorted.slice(0, 24).map((ev) => {
                      const c = SESSION_COLORS[ev.colorKey];
                      return (
                        <li key={ev.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedEvent(ev)}
                            className="itutor-ev-card"
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              borderRadius: 8,
                              padding: '8px 10px',
                              cursor: 'pointer',
                              background: c.bg,
                              border: `1px solid ${c.border}`,
                              borderLeft: `2.5px solid ${c.glow}`,
                              boxShadow: '0 2px 10px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)',
                            }}
                          >
                            <p style={{ fontSize: 10.5, fontWeight: 700, color: c.text, margin: 0, lineHeight: 1.25 }}>{ev.subjectLabel}</p>
                            <p
                              style={{
                                fontSize: 9,
                                fontFamily: "'DM Mono',monospace",
                                color: 'rgba(167,243,208,0.55)',
                                margin: '4px 0 0',
                              }}
                            >
                              {ev.start.toLocaleString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </p>
                            <p style={{ fontSize: 9, color: 'rgba(167,243,208,0.45)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ev.counterpartyLabel}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>
            )}

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
              {view === 'week' && (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `${TIME_W}px repeat(7, minmax(0, 1fr))`,
                      background: theme === 'dark' ? 'rgba(4,10,4,0.7)' : 'rgba(255,255,255,0.95)',
                      backdropFilter: 'blur(20px)',
                      borderBottom: theme === 'dark' ? '1px solid rgba(74,222,128,0.08)' : '1px solid rgba(0,0,0,0.08)',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 0',
                        textAlign: 'center',
                        fontSize: 9.5,
                        color: theme === 'dark' ? 'rgba(74,222,128,0.28)' : 'rgba(0,0,0,0.45)',
                        fontFamily: "'DM Mono',monospace",
                        letterSpacing: '0.5px',
                      }}
                    >
                      {tzShort}
                    </div>
                    {weekDates.map((date, i) => {
                      const tod = isToday(date);
                      return (
                        <div
                          key={i}
                          style={{
                            padding: '8px 4px',
                            textAlign: 'center',
                            borderLeft: theme === 'dark' ? '1px solid rgba(74,222,128,0.06)' : '1px solid rgba(0,0,0,0.06)',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              letterSpacing: 1.4,
                              color: tod ? (theme === 'dark' ? '#4ade80' : '#199356') : (theme === 'dark' ? 'rgba(74,222,128,0.3)' : 'rgba(0,0,0,0.5)'),
                            }}
                          >
                            {DAYS[i]}
                          </div>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              marginTop: 3,
                              background: tod ? (theme === 'dark' ? 'rgba(74,222,128,0.12)' : 'rgba(25,147,86,0.12)') : 'transparent',
                              border: `1.5px solid ${tod ? (theme === 'dark' ? 'rgba(74,222,128,0.45)' : 'rgba(25,147,86,0.55)') : 'transparent'}`,
                              boxShadow: tod ? (theme === 'dark' ? '0 0 18px rgba(74,222,128,0.18), inset 0 0 10px rgba(74,222,128,0.06)' : '0 0 14px rgba(25,147,86,0.18)') : 'none',
                              color: tod ? (theme === 'dark' ? '#4ade80' : '#199356') : (theme === 'dark' ? '#d1fae5' : '#000000'),
                              fontSize: 15,
                              fontWeight: tod ? 800 : 400,
                            }}
                          >
                            {date.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div ref={scrollRef} className="itutor-cal-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `${TIME_W}px repeat(7, minmax(0, 1fr))`,
                        minHeight: HOURS.length * CELL_H,
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        {HOURS.map((h, i) => (
                          <div
                            key={h}
                            style={{
                              position: 'absolute',
                              top: i * CELL_H - 9,
                              right: 10,
                              fontSize: 9,
                              color: theme === 'dark' ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.6)',
                              fontFamily: "'DM Mono',monospace",
                              fontWeight: 500,
                              userSelect: 'none',
                            }}
                          >
                            {fmtFromDate(new Date(2000, 0, 1, h, 0))}
                          </div>
                        ))}
                      </div>

                      {weekDates.map((date, dayIdx) => {
                        const dayStart = new Date(date);
                        dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(date);
                        dayEnd.setHours(23, 59, 59, 999);
                        const dayEvents = eventsInWeek.filter((e) => e.start <= dayEnd && e.end >= dayStart);
                        const tod = isToday(date);
                        return (
                          <div
                            key={dayIdx}
                            style={{
                              position: 'relative',
                              borderLeft: theme === 'dark' ? '1px solid rgba(74,222,128,0.06)' : '1px solid rgba(0,0,0,0.06)',
                              height: HOURS.length * CELL_H,
                              background: tod ? (theme === 'dark' ? 'rgba(74,222,128,0.012)' : 'rgba(25,147,86,0.025)') : 'transparent',
                            }}
                          >
                            {HOURS.map((_, i) => (
                              <div
                                key={i}
                                style={{
                                  position: 'absolute',
                                  top: i * CELL_H,
                                  left: 0,
                                  right: 0,
                                  borderTop: theme === 'dark' ? '1px solid rgba(74,222,128,0.055)' : '1px solid rgba(0,0,0,0.07)',
                                }}
                              >
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: CELL_H / 2,
                                    left: 0,
                                    right: 0,
                                    borderTop: theme === 'dark' ? '1px dashed rgba(74,222,128,0.025)' : '1px dashed rgba(0,0,0,0.04)',
                                  }}
                                />
                              </div>
                            ))}

                            {tod && nowTop > 0 && nowTop < HOURS.length * CELL_H && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: nowTop,
                                  left: 0,
                                  right: 0,
                                  zIndex: 15,
                                  display: 'flex',
                                  alignItems: 'center',
                                  pointerEvents: 'none',
                                }}
                              >
                                <div
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#4ade80',
                                    flexShrink: 0,
                                    animation: 'itutor-pulse-dot 1.8s ease-in-out infinite',
                                  }}
                                />
                                <div
                                  style={{
                                    flex: 1,
                                    height: 1,
                                    background: 'linear-gradient(90deg,#4ade80,rgba(74,222,128,0.08))',
                                  }}
                                />
                              </div>
                            )}

                            {dayEvents.map((ev) => {
                              const clipStart = ev.start < dayStart ? dayStart : ev.start;
                              const clipEnd = ev.end > dayEnd ? dayEnd : ev.end;
                              const c = SESSION_COLORS[ev.colorKey];
                              const top = eventTop(clipStart) + 2;
                              const height = Math.max(eventHeightMs(clipStart, clipEnd) - 4, 28);
                              return (
                                <div
                                  key={ev.id + String(dayIdx)}
                                  role="button"
                                  tabIndex={0}
                                  className="itutor-ev-card"
                                  onClick={() => setSelectedEvent(ev)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setSelectedEvent(ev);
                                    }
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top,
                                    left: 5,
                                    right: 5,
                                    height,
                                    background: c.bg,
                                    backdropFilter: 'blur(18px) saturate(160%)',
                                    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                                    border: `1px solid ${c.border}`,
                                    borderLeft: `2.5px solid ${c.glow}`,
                                    borderRadius: 8,
                                    padding: '5px 8px',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    zIndex: 5,
                                    boxShadow: '0 2px 14px rgba(74,222,128,0.05), inset 0 1px 0 rgba(255,255,255,0.04)',
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      color: c.text,
                                      lineHeight: 1.3,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {ev.subjectLabel}
                                  </div>
                                  {height > 38 && (
                                    <div
                                      style={{
                                        fontSize: 9,
                                        color: c.text,
                                        opacity: 0.6,
                                        marginTop: 2,
                                        fontFamily: "'DM Mono',monospace",
                                      }}
                                    >
                                      {fmtFromDate(clipStart)} – {fmtFromDate(clipEnd)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {view === 'month' && (
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 12,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gap: 1,
                      flexShrink: 0,
                      marginBottom: 1,
                    }}
                  >
                    {DAYS.map((d) => (
                      <div
                        key={d}
                        style={{
                          textAlign: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 1,
                          padding: '10px 0',
                          color: theme === 'dark' ? 'rgba(74,222,128,0.35)' : 'rgba(0,0,0,0.55)',
                          background: theme === 'dark' ? 'rgba(4,10,4,0.85)' : '#ffffff',
                          border: theme === 'dark' ? 'none' : '1px solid rgba(0,0,0,0.06)',
                          borderRadius: 4,
                        }}
                      >
                        {d}
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gridTemplateRows: `repeat(${monthWeekRows}, minmax(0, 1fr))`,
                      gap: 1,
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: theme === 'dark' ? '1px solid rgba(74,222,128,0.08)' : '1px solid rgba(0,0,0,0.08)',
                      background: theme === 'dark' ? 'transparent' : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    {monthMatrix.map((cell, idx) => {
                      if (!cell) {
                        return <div key={`e-${idx}`} style={{ background: theme === 'dark' ? '#030804' : '#f7f7f7', minWidth: 0, minHeight: 0 }} />;
                      }
                      const dayEv = events.filter((e) => isSameDay(e.start, cell));
                      const t = isToday(cell);
                      return (
                        <div
                          key={cell.toISOString()}
                          style={{
                            minWidth: 0,
                            minHeight: 0,
                            borderTop: theme === 'dark' ? '1px solid rgba(74,222,128,0.06)' : '1px solid rgba(0,0,0,0.06)',
                            borderLeft: theme === 'dark' ? '1px solid rgba(74,222,128,0.06)' : '1px solid rgba(0,0,0,0.06)',
                            padding: 8,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            background: t
                              ? (theme === 'dark' ? 'rgba(74,222,128,0.07)' : 'rgba(25,147,86,0.08)')
                              : (theme === 'dark' ? 'rgba(5,14,5,0.55)' : '#ffffff'),
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: t ? 800 : 600,
                              color: t
                                ? (theme === 'dark' ? '#4ade80' : '#199356')
                                : (theme === 'dark' ? 'rgba(209,250,229,0.72)' : '#000000'),
                              flexShrink: 0,
                            }}
                          >
                            {cell.getDate()}
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              marginTop: 6,
                              flex: 1,
                              minHeight: 0,
                              overflowY: 'auto',
                            }}
                          >
                            {dayEv.slice(0, 5).map((ev) => {
                              const c = SESSION_COLORS[ev.colorKey];
                              return (
                                <button
                                  key={ev.id}
                                  type="button"
                                  onClick={() => setSelectedEvent(ev)}
                                  className="itutor-ev-card"
                                  style={{
                                    fontSize: 10,
                                    lineHeight: 1.25,
                                    textAlign: 'left',
                                    borderRadius: 6,
                                    padding: '4px 6px',
                                    border: `1px solid ${c.border}`,
                                    background: c.bg,
                                    color: c.text,
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                  }}
                                >
                                  {ev.subjectLabel}
                                </button>
                              );
                            })}
                            {dayEv.length > 5 && (
                              <span style={{ fontSize: 9, color: theme === 'dark' ? 'rgba(74,222,128,0.4)' : 'rgba(0,0,0,0.5)', flexShrink: 0 }}>
                                +{dayEv.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {view === 'year' && (
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2.5vw, 32px) 24px',
                    overflow: 'hidden',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                    gap: 'clamp(14px, 2.2vw, 28px)',
                  }}
                >
                  {yearMonths.map((monthStart) => {
                    const y = monthStart.getFullYear();
                    const m = monthStart.getMonth();
                    const cells = buildYearMonthCells(y, m);
                    return (
                      <div
                        key={m}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          minWidth: 0,
                          minHeight: 0,
                          padding: '4px 2px 0 0',
                        }}
                      >
                        <p
                          style={{
                            fontSize: 'clamp(12px, 1.35vw, 15px)',
                            fontWeight: 600,
                            color: theme === 'dark' ? '#ffffff' : '#000000',
                            margin: '0 0 10px 0',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {monthStart.toLocaleDateString('en-US', { month: 'long' })}
                        </p>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                            gap: 'clamp(2px, 0.35vw, 6px)',
                            marginBottom: 6,
                            fontSize: 'clamp(9px, 1vw, 11px)',
                            textAlign: 'center',
                            color: theme === 'dark' ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.5)',
                            fontWeight: 500,
                          }}
                        >
                          {DOW_INITIALS.map((letter, di) => (
                            <span key={`dow-${m}-${di}`}>{letter}</span>
                          ))}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            minHeight: 0,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                            gridTemplateRows: 'repeat(6, minmax(0, 1fr))',
                            gap: 'clamp(2px, 0.35vw, 5px)',
                            alignItems: 'center',
                            justifyItems: 'center',
                          }}
                        >
                          {cells.map((d, i) => {
                            if (d == null) {
                              return <div key={i} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
                            }
                            const dayDate = new Date(y, m, d);
                            const isTd = isSameDay(today, dayDate);
                            const hasEv = events.some((e) => isSameDay(e.start, dayDate));
                            const bubbleBase: CSSProperties = {
                              width: 'min(100%, 30px)',
                              height: 'min(100%, 30px)',
                              maxWidth: 30,
                              maxHeight: 30,
                              aspectRatio: '1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '50%',
                              fontSize: 'clamp(9px, 1vw, 11px)',
                              fontWeight: isTd ? 600 : 500,
                              color: isTd
                                ? (theme === 'dark' ? '#ecfdf5' : '#ffffff')
                                : (theme === 'dark' ? '#ffffff' : '#000000'),
                            };
                            const bubbleStyle: CSSProperties = isTd
                              ? {
                                  ...bubbleBase,
                                  background:
                                    theme === 'dark'
                                      ? 'linear-gradient(155deg, rgba(134,239,172,0.55) 0%, rgba(74,222,128,0.28) 38%, rgba(16,185,129,0.22) 72%, rgba(5,46,22,0.45) 100%)'
                                      : '#199356',
                                  backdropFilter: 'blur(14px) saturate(175%)',
                                  WebkitBackdropFilter: 'blur(14px) saturate(175%)',
                                  border: theme === 'dark' ? '1px solid rgba(187,247,208,0.65)' : '1px solid rgba(25,147,86,0.6)',
                                  boxShadow:
                                    theme === 'dark'
                                      ? 'inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -2px 4px rgba(6,78,59,0.45), 0 0 0 1px rgba(74,222,128,0.15), 0 6px 18px rgba(74,222,128,0.35)'
                                      : '0 4px 12px rgba(25,147,86,0.35)',
                                }
                              : hasEv
                                ? {
                                    ...bubbleBase,
                                    background: theme === 'dark' ? 'rgba(148,163,184,0.5)' : 'rgba(25,147,86,0.18)',
                                  }
                                : { ...bubbleBase, background: 'transparent' };
                            return (
                              <div key={i} style={bubbleStyle}>
                                {d}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedEvent &&
        (() => {
          const c = SESSION_COLORS[selectedEvent.colorKey];
          const href = bookingHref(role, selectedEvent.bookingId, selectedEvent.studentId);
          return (
            <div
              className="itutor-bg-anim fixed inset-0 z-[300] flex items-center justify-center"
              style={{
                background: 'rgba(0,6,0,0.65)',
                backdropFilter: 'blur(8px)',
              }}
              onClick={() => setSelectedEvent(null)}
            >
              <div
                className="itutor-modal-anim"
                style={{
                  width: 320,
                  maxWidth: 'calc(100% - 24px)',
                  background: 'rgba(5,14,5,0.9)',
                  backdropFilter: 'blur(48px) saturate(200%)',
                  WebkitBackdropFilter: 'blur(48px) saturate(200%)',
                  border: `1px solid ${c.border}`,
                  borderTop: `2px solid ${c.glow}`,
                  borderRadius: 18,
                  padding: '22px 24px',
                  boxShadow: `0 0 80px rgba(74,222,128,0.07), 0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: 1.8,
                      color: c.glow,
                      textTransform: 'uppercase',
                      background: 'rgba(74,222,128,0.07)',
                      border: `1px solid ${c.border}`,
                      padding: '3px 10px',
                      borderRadius: 20,
                    }}
                  >
                    {selectedEvent.colorKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(74,222,128,0.35)',
                      fontSize: 15,
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ marginTop: 14, fontSize: 17, fontWeight: 800, color: '#f0fdf4', lineHeight: 1.3 }}>
                  {selectedEvent.subjectLabel}
                </div>

                <div style={{ height: 1, background: 'rgba(74,222,128,0.08)', margin: '14px 0' }} />

                {[
                  { icon: '⏱', text: `${fmtFromDate(selectedEvent.start)} – ${fmtFromDate(selectedEvent.end)}` },
                  { icon: '👤', text: selectedEvent.counterpartyLabel },
                  {
                    icon: '📅',
                    text: selectedEvent.start.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    }),
                  },
                  ...(selectedEvent.childLabel ? [{ icon: '🎓', text: `Student: ${selectedEvent.childLabel}` }] : []),
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 13 }}>{row.icon}</span>
                    <span style={{ fontSize: 12.5, color: 'rgba(167,243,208,0.75)', fontWeight: 500 }}>{row.text}</span>
                  </div>
                ))}

                <div style={{ height: 1, background: 'rgba(74,222,128,0.08)', margin: '14px 0 16px' }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  {href ? (
                    <>
                      <button
                        type="button"
                        onClick={openBooking}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: 10,
                          background: 'rgba(74,222,128,0.14)',
                          border: '1px solid rgba(74,222,128,0.3)',
                          color: '#4ade80',
                          fontFamily: "'Sora',sans-serif",
                          fontWeight: 700,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          boxShadow: '0 0 20px rgba(74,222,128,0.08)',
                          transition: 'all 0.18s',
                        }}
                      >
                        {role === 'admin' ? 'Open admin' : 'Join Session'}
                      </button>
                      <button
                        type="button"
                        onClick={openBooking}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(74,222,128,0.1)',
                          color: 'rgba(167,243,208,0.45)',
                          fontFamily: "'Sora',sans-serif",
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Details
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(null)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(74,222,128,0.1)',
                        color: 'rgba(167,243,208,0.55)',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      <button
        type="button"
        onClick={fabNavigate}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'rgba(74,222,128,0.1)',
          backdropFilter: 'blur(24px)',
          border: '1.5px solid rgba(74,222,128,0.3)',
          color: '#4ade80',
          fontSize: 24,
          fontWeight: 300,
          cursor: 'pointer',
          zIndex: 250,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 30px rgba(74,222,128,0.12), inset 0 1px 0 rgba(255,255,255,0.05)',
          transition: 'all 0.2s',
        }}
        aria-label="Quick actions"
      >
        +
      </button>
    </>,
    document.body
  );
}
