'use client';

/**
 * The scheduling pop-up: when a class meets, then how students join it.
 *
 * It opens by itself straight after a class is created (the create page lands
 * on /tutor/classes/<id>?schedule=1), and from the Sessions tab's Add session /
 * Set schedule buttons. It used to live inline in the Sessions tab of the class
 * page; it moved here when it grew a second step, because the class page is
 * already over 3,000 lines.
 *
 *   Step 1  Class schedule. Times are Trinidad wall-clock time — the server
 *           resolves them against America/Port_of_Spain whatever zone the
 *           browser is in, so the labels say so.
 *   Step 2  How will students join? Generated Meet links, or the tutor's own
 *           link. Skipped for in-person-only classes, which have nothing to
 *           join. A tutor who picks their own link but doesn't have it to hand
 *           can "Continue and add link later": the class is saved as
 *           custom-with-no-link (migration 263) and the sessions are created,
 *           so the schedule — the thing that lists the class — isn't held
 *           hostage to a Zoom room they haven't made yet. The Sessions tab
 *           then asks for the link in amber until it's added.
 *
 * THE PREVIEW IS THE SERVER'S OWN ARITHMETIC. It is computed with
 * buildOccurrenceRows, the same function POST /api/groups/[groupId]/sessions
 * uses, with the same end date the server would clamp to. The old inline
 * preview ran its own loop (local time, a 60-session cap, a 3-month default)
 * and could promise a different calendar from the one that got created.
 *
 * SAVE ORDER: the link first, then the sessions. The link save is idempotent —
 * repeating it changes nothing — and the sessions POST is not: every retry
 * after a partial failure would otherwise risk a second copy of the series. So
 * if the link saves and the sessions don't, the tutor is told exactly that, and
 * "Try again" repeats only the sessions.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Clock, Link as LinkIcon, Repeat, Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildOccurrenceRows, type OccurrenceRow } from '@/lib/classes/scheduleSessions';
import { formatSchoolDate, trinidadToday } from '@/lib/classes/academicCalendar';
import { TRINIDAD_TZ } from '@/lib/payments/secureSpot';
import type { MeetingLinkMode } from '@/lib/types/groups';
import type { ClassFormat } from '@/lib/utils/seatCapacity';
import ClassLinkChoice, {
  classLinkChanged,
  connectUrl,
  displayLink,
  draftFromClass,
  providerLabel,
  resolveClassLinkDraft,
  saveClassLink,
  useVideoConnection,
  type ClassLinkDraft,
} from '@/components/tutor/classes/ClassLinkChoice';

export type Recurrence = 'none' | 'daily' | 'weekly';
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 === 0 ? '00' : '30';
  const value = `${String(h).padStart(2, '0')}:${m}`;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const label = `${h12}:${m} ${period}`;
  return { value, label };
});

/** One occurrence as POST /api/groups/[groupId]/sessions returns it. */
export type CreatedOccurrence = {
  id: string;
  scheduled_start_at: string;
  scheduled_end_at?: string | null;
  status?: string | null;
};

/** buildOccurrenceRows' ceiling for a series that has an end date. */
const OCCURRENCE_CAP = 400;
/** How many clashing times the conflict warning lists before summarising. */
const CONFLICTS_SHOWN = 8;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

type ScheduleForm = {
  date: string;
  time: string;
  duration: number;
  recurrence: Recurrence;
  weekdays: number[];
  /** "Last session". '' = up to the class end date (or no end, if the class has none). */
  endDate: string;
};

/** Noon UTC, so no zone can move a date-only value onto another day. */
function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOfYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/**
 * Tomorrow in Trinidad, not tomorrow in the browser: a tutor abroad at 11pm
 * would otherwise be offered a date Trinidad already considers the day after.
 * Weekly by default — a class is a weekly thing, and a one-off on its own never
 * lists the class on the marketplace.
 */
function blankForm(classEndDate: string | null): ScheduleForm {
  const tomorrow = addDaysYmd(trinidadToday(), 1);
  return {
    date: tomorrow,
    time: '16:00',
    duration: 60,
    recurrence: 'weekly',
    weekdays: [weekdayOfYmd(tomorrow)],
    endDate: classEndDate ?? '',
  };
}

function durationLabel(min: number): string {
  return min < 60 ? `${min} min` : min % 60 === 0 ? `${min / 60} hr` : `${Math.floor(min / 60)}h ${min % 60}m`;
}

/** "Tue 30 Sept" in Trinidad, optionally with the year. */
function fmtDay(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: TRINIDAD_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** "4:00 PM" in Trinidad — the same labels as the time picker. */
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: TRINIDAD_TZ, hour: 'numeric', minute: '2-digit' });
}

/**
 * A recurring series covers many dates, so naming it after the first one is
 * wrong the moment the second occurrence exists — that is how every row of a
 * weekly class ended up reading "Session — Wed, Sep 9". One-off sessions keep
 * the dated name, because for them it is accurate.
 */
function seriesTitle(form: ScheduleForm): string {
  if (form.recurrence === 'weekly') {
    return `Weekly session — ${form.weekdays
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d]?.slice(0, 3))
      .filter(Boolean)
      .join(', ')}`;
  }
  if (form.recurrence === 'daily') return 'Daily session';
  return `Session — ${new Date(`${form.date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })}`;
}

function findConflicts(
  rows: OccurrenceRow[],
  durationMin: number,
  existing: Array<{ date: string; durationMin: number }>,
): OccurrenceRow[] {
  return rows.filter((row) => {
    const start = Date.parse(row.scheduled_start_at);
    const end = start + durationMin * 60_000;
    return existing.some((x) => {
      const xStart = Date.parse(x.date);
      if (Number.isNaN(xStart)) return false;
      const xEnd = xStart + (x.durationMin ?? 60) * 60_000;
      return start < xEnd && end > xStart;
    });
  });
}

export type ScheduleSessionsModalProps = {
  groupId: string;
  /** The class's tutor. Only used to decide whether to show the "connect Google Meet" hint. */
  tutorId?: string | null;
  /** groups.end_date, 'YYYY-MM-DD'. Sessions can't start after it, and a series stops at it. */
  classEndDate: string | null;
  classFormat: ClassFormat;
  /** Sessions already on the calendar, for the clash check and the one-off warning. */
  existing: Array<{ date: string; durationMin: number }>;
  linkMode: MeetingLinkMode;
  link: string;
  /** False on an environment without migration 262 — the own-link option is hidden. */
  linkModeAvailable: boolean;
  initialStep?: 1 | 2;
  /** Open straight at step 2 and save only the link (the Sessions tab's Edit). */
  linkOnly?: boolean;
  /**
   * False when opened by itself after the class was created: a stray click
   * outside must not throw away the first thing the tutor is asked to do.
   */
  dismissOnBackdrop: boolean;
  onClose: () => void;
  /** setAt: the saved link's meeting_link_set_at, null when unknown or no link. */
  onLinkSaved: (mode: MeetingLinkMode, url: string, setAt: string | null) => void;
  /** Called with the server's occurrence rows (real ids) before the modal closes. */
  onSessionsCreated: (occurrences: CreatedOccurrence[], durationMin: number) => void;
};

export default function ScheduleSessionsModal({
  groupId,
  tutorId,
  classEndDate,
  classFormat,
  existing,
  linkMode,
  link,
  linkModeAvailable,
  initialStep,
  linkOnly = false,
  dismissOnBackdrop,
  onClose,
  onLinkSaved,
  onSessionsCreated,
}: ScheduleSessionsModalProps) {
  // An in-person-only class has nobody to send a link to.
  const physical = classFormat === 'physical';
  const classEnd = classEndDate && YMD_RE.test(classEndDate) ? classEndDate : null;

  const [initialForm] = useState(() => blankForm(classEnd));
  const [form, setForm] = useState<ScheduleForm>(initialForm);
  // Until the tutor picks days themselves, the weekday follows the date — so
  // moving the first session to a Thursday doesn't leave it repeating Tuesdays.
  const [weekdaysTouched, setWeekdaysTouched] = useState(false);
  const [step, setStep] = useState<1 | 2>(() => (linkOnly ? 2 : physical ? 1 : initialStep ?? 1));

  // What the class's link is right now, updated the moment a save lands, so a
  // retry after "the link saved but the sessions didn't" doesn't save it again.
  const [baseline, setBaseline] = useState<{ mode: MeetingLinkMode; url: string }>({ mode: linkMode, url: link });
  const [linkDraft, setLinkDraft] = useState<ClassLinkDraft>(() => draftFromClass(linkMode, link));
  // A class that already has sessions and a working link has made this choice
  // before; show it as one line rather than asking again.
  const canCollapse = !linkOnly && existing.length > 0 && (linkMode === 'generated' || !!link);
  const [linkExpanded, setLinkExpanded] = useState(!canCollapse);
  const [showLinkErrors, setShowLinkErrors] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<OccurrenceRow[]>([]);

  const connection = useVideoConnection(physical ? null : tutorId);

  const today = trinidadToday();
  const isRecurring = form.recurrence !== 'none';
  const dateValid = YMD_RE.test(form.date);

  // The same end the server will use: the tutor's "Last session", never past
  // the class end date, and the class end date when left blank.
  const endsOn = useMemo<string | null>(() => {
    if (!isRecurring) return null;
    let end = form.endDate && YMD_RE.test(form.endDate) ? form.endDate : classEnd;
    if (end && classEnd && end > classEnd) end = classEnd;
    return end ?? null;
  }, [isRecurring, form.endDate, classEnd]);
  const endClamped = isRecurring && !!classEnd && YMD_RE.test(form.endDate) && form.endDate > classEnd;

  const rows = useMemo<OccurrenceRow[]>(() => {
    if (!dateValid) return [];
    return buildOccurrenceRows({
      recurrence_type: form.recurrence,
      recurrence_days: form.recurrence === 'weekly' ? form.weekdays : [],
      start_time: form.time,
      duration_minutes: form.duration,
      starts_on: form.date,
      ends_on: endsOn,
    });
  }, [dateValid, form.recurrence, form.weekdays, form.time, form.duration, form.date, endsOn]);
  const capped = rows.length >= OCCURRENCE_CAP;

  const step1Error: string | null = (() => {
    if (!dateValid) return 'Pick a date for the first session.';
    if (form.date < today) return 'Pick today or a later date for the first session.';
    if (classEnd && form.date > classEnd) {
      return `This class ends on ${formatSchoolDate(classEnd)}. Pick a first session on or before it.`;
    }
    if (form.recurrence === 'weekly' && form.weekdays.length === 0) return 'Pick at least one day of the week.';
    if (isRecurring && YMD_RE.test(form.endDate) && form.endDate < form.date) {
      return "The last session can't be before the first one.";
    }
    if (rows.length === 0) return "These settings don't create any sessions. Check the dates and days.";
    return null;
  })();

  // Nothing else ahead on the calendar, and this adds a single date: the
  // marketplace lists a class by its repeating times, and one date isn't one.
  const upcomingExisting = existing.filter((x) => Date.parse(x.date) > Date.now()).length;
  const oneOffOnly = !linkOnly && form.recurrence === 'none' && upcomingExisting === 0;

  const resolvedLink = resolveClassLinkDraft(linkDraft);
  const scheduleDirty = !linkOnly && JSON.stringify(form) !== JSON.stringify(initialForm);
  const linkDirty =
    !physical &&
    (linkDraft.mode !== baseline.mode ||
      (linkDraft.mode === 'custom' &&
        (resolvedLink.ok ? resolvedLink.url !== baseline.url : linkDraft.input.trim() !== '')));
  const dirty = scheduleDirty || linkDirty;

  const requestClose = () => {
    if (saving) return;
    if (dirty) {
      const message = linkOnly
        ? 'Discard your changes to the class link?'
        : dismissOnBackdrop
          ? 'Discard this schedule? Nothing has been saved yet.'
          : "Close without saving? This class has no schedule yet, so students can't find or join it.";
      if (!window.confirm(message)) return;
    }
    onClose();
  };

  const setDate = (date: string) =>
    setForm((f) => ({
      ...f,
      date,
      weekdays: !weekdaysTouched && YMD_RE.test(date) ? [weekdayOfYmd(date)] : f.weekdays,
    }));

  const toggleWeekday = (i: number) => {
    setWeekdaysTouched(true);
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort(),
    }));
  };

  /**
   * `linkLater`: "Continue and add link later". The own-link choice is saved
   * without a link (url null — the route stores custom mode, no link) and
   * whatever is half-typed in the box is dropped rather than validated, then
   * the sessions are created exactly as Save does.
   */
  const save = async (thenConnect = false, linkLater = false) => {
    if (saving) return;
    setError('');

    // 1. The link, if it changed. Stop here on failure: the tutor chose how
    //    students join, and creating sessions they can't join is worse.
    let linkSavedNow = false;
    if (!physical) {
      let target: { mode: MeetingLinkMode; url: string | null };
      if (linkLater) {
        target = { mode: 'custom', url: null };
      } else if (!resolvedLink.ok) {
        setShowLinkErrors(true);
        setLinkExpanded(true);
        setStep(2);
        setError(resolvedLink.error);
        return;
      } else {
        target = resolvedLink;
      }
      if (classLinkChanged(target, baseline)) {
        setSaving(true);
        const r = await saveClassLink(groupId, target);
        if (!r.ok) {
          setSaving(false);
          setError(r.message);
          return;
        }
        setBaseline({ mode: r.mode, url: r.url });
        onLinkSaved(r.mode, r.url, r.setAt);
        linkSavedNow = true;
      }
      // The box now matches what's saved (no link), so a later Cancel — say
      // after the sessions failed — doesn't ask about discarding a link the
      // tutor already chose to leave for later.
      if (linkLater) {
        setLinkDraft({ mode: 'custom', input: '' });
        setShowLinkErrors(false);
      }
    }

    if (linkOnly) {
      setSaving(false);
      if (thenConnect) { window.location.href = connectUrl(groupId); return; }
      onClose();
      return;
    }

    if (step1Error) {
      setSaving(false);
      setStep(1);
      return;
    }

    // 2. The sessions. The body is the shape this endpoint has always taken;
    //    ends_on is only meaningful for a repeating series.
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: seriesTitle(form),
          start_time: form.time, // "HH:MM", Trinidad time
          starts_on: form.date, // "YYYY-MM-DD"
          ends_on: isRecurring ? endsOn : null,
          duration_minutes: form.duration,
          recurrence_type: form.recurrence, // "none" | "daily" | "weekly"
          recurrence_days: form.recurrence === 'weekly' ? form.weekdays : [],
          // Ignored by the API, which resolves class times in Trinidad time. Left
          // only so older deployments keep working; note this caller used the
          // opposite sign to every other one, which is what broke the times.
          timezone_offset: new Date().getTimezoneOffset(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);

      // 3. Hand the real rows back. The old modal invented `tmp-` ids when the
      //    server sent none, and a Join or Attendance click on one of those
      //    404'd until the page was reloaded.
      const occurrences: CreatedOccurrence[] = Array.isArray(json?.session?.occurrences)
        ? json.session.occurrences
        : [];
      onSessionsCreated(occurrences, form.duration);
      if (thenConnect) { window.location.href = connectUrl(groupId); return; }
      onClose();
    } catch (e: any) {
      const msg = String(e?.message ?? 'The sessions could not be created').replace(/[.\s]+$/, '');
      setError(
        linkSavedNow
          ? linkLater
            ? `Your link choice was saved, but the sessions weren't created: ${msg}. Try again.`
            : `Your class link was saved, but the sessions weren't created: ${msg}. Try again.`
          : `${msg}.`,
      );
    } finally {
      setSaving(false);
    }
  };

  // Step 1's button. The clash check runs here, so a tutor who keeps the
  // clashing times has decided to before step 2 asks anything else.
  const goNext = () => {
    if (step1Error || saving) return;
    const clash = findConflicts(rows, form.duration, existing);
    if (clash.length > 0) { setConflicts(clash); return; }
    advance();
  };

  const advance = () => {
    setConflicts([]);
    if (physical) { void save(); return; }
    setError('');
    setStep(2);
  };

  const generatedName = providerLabel(connection.status === 'connected' ? connection.provider : null);
  const linkSummary =
    linkDraft.mode === 'custom'
      ? `your own link${resolvedLink.ok ? ` (${displayLink(resolvedLink.url)})` : ''}`
      : `${generatedName} links, created when you press Join`;

  // Only while choosing: the link-only editor exists to set a link, and a class
  // that already has its own link has nothing to put off.
  const offerLinkLater =
    step === 2 &&
    !linkOnly &&
    !physical &&
    linkDraft.mode === 'custom' &&
    !(baseline.mode === 'custom' && baseline.url);

  const headerTitle = step === 1 ? 'Class schedule' : 'How will students join?';
  const headerStep = linkOnly || physical ? null : `Step ${step} of 2`;
  const headerSub =
    step === 1
      ? 'Students see these sessions on their calendar.'
      : 'Every Join button for this class — yours and your students\' — uses this.';

  return (
    <>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
        onClick={() => { if (dismissOnBackdrop) requestClose(); }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={headerTitle}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl bg-background shadow-xl border border-border max-h-[90vh] flex flex-col"
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="font-bold text-ink">
                {headerTitle}
                {headerStep && <span className="font-normal text-muted-foreground"> · {headerStep}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{headerSub}</div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              aria-label="Close"
              className="size-8 shrink-0 grid place-items-center rounded-lg hover:bg-muted disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>

          {step === 1 ? (
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {isRecurring ? 'First session' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    min={today}
                    max={classEnd ?? undefined}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Start time</label>
                  <div className="mt-1 relative">
                    <Clock className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      value={form.time}
                      onChange={(e) => setForm({ ...form, time: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand appearance-none"
                    >
                      {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Trinidad time (AST)</div>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Duration</label>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {[30, 60, 90, 120, 180, 300].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setForm({ ...form, duration: d })}
                      className={cn(
                        'px-3 py-1.5 rounded-lg border text-xs font-semibold',
                        form.duration === d
                          ? 'bg-brand/10 border-brand text-brand-deep'
                          : 'border-border bg-background text-muted-foreground hover:text-ink',
                      )}
                    >
                      {durationLabel(d)}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, duration: Math.max(15, f.duration - 15) }))}
                    className="size-8 grid place-items-center rounded-lg border border-border hover:bg-muted text-sm font-bold"
                  >
                    −
                  </button>
                  <div className="text-sm font-semibold text-ink w-20 text-center">{durationLabel(form.duration)}</div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, duration: Math.min(300, f.duration + 15) }))}
                    className="size-8 grid place-items-center rounded-lg border border-border hover:bg-muted text-sm font-bold"
                  >
                    +
                  </button>
                  <span className="text-xs text-muted-foreground">15 min steps · max 5 hr</span>
                </div>
              </div>

              {/* Recurrence */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Repeat className="size-3.5" /> Repeats
                </label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(['weekly', 'daily', 'none'] as Recurrence[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, recurrence: r })}
                      className={cn(
                        'px-3 py-2 rounded-lg border text-xs font-semibold capitalize',
                        form.recurrence === r
                          ? 'bg-brand/10 border-brand text-brand-deep'
                          : 'border-border bg-background text-muted-foreground hover:text-ink',
                      )}
                    >
                      {r === 'none' ? 'One-off' : r}
                    </button>
                  ))}
                </div>
              </div>

              {form.recurrence === 'weekly' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repeat on</label>
                  <div className="mt-1 flex gap-1.5 flex-wrap">
                    {WEEKDAYS.map((w, i) => (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={form.weekdays.includes(i)}
                        aria-label={DAY_NAMES[i]}
                        onClick={() => toggleWeekday(i)}
                        className={cn(
                          'size-10 rounded-lg border text-xs font-semibold',
                          form.weekdays.includes(i)
                            ? 'bg-brand text-white border-brand'
                            : 'border-border bg-background text-muted-foreground hover:text-ink',
                        )}
                      >
                        {w[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isRecurring && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Last session</label>
                  <input
                    type="date"
                    value={form.endDate}
                    min={dateValid ? form.date : today}
                    max={classEnd ?? undefined}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {classEnd
                      ? `Up to the class end date, ${formatSchoolDate(classEnd)}.`
                      : 'Optional.'}
                  </div>
                </div>
              )}

              {/* Preview — buildOccurrenceRows, so it is what the server will create. */}
              {!step1Error && rows.length > 0 && (
                <div className="rounded-lg bg-brand/5 border border-brand/20 px-3 py-2 text-xs text-brand-deep space-y-1">
                  {form.recurrence === 'none' ? (
                    <div>
                      One session on <strong>{fmtDay(rows[0].scheduled_start_at, true)}</strong> at{' '}
                      <strong>{fmtTime(rows[0].scheduled_start_at)}</strong> Trinidad time.
                    </div>
                  ) : (
                    <div>
                      Will create {capped ? 'the first ' : ''}<strong>{rows.length}</strong> session
                      {rows.length !== 1 ? 's' : ''} between{' '}
                      <strong>{fmtDay(rows[0].scheduled_start_at)}</strong> and{' '}
                      <strong>{fmtDay(rows[rows.length - 1].scheduled_start_at, true)}</strong>
                      {capped ? ' — add more later if the class runs longer' : ''}.
                    </div>
                  )}
                  {endClamped && classEnd && <div>Stops at the class end date, {formatSchoolDate(classEnd)}.</div>}
                </div>
              )}

              {oneOffOnly && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                  <span>
                    A single one-off session won&apos;t put this class on the marketplace — students find classes by
                    their weekly times. Choose Weekly to list it.
                  </span>
                </div>
              )}

              {/* Says why Next is disabled, rather than leaving a grey button. */}
              {step1Error && <p className="text-xs font-medium text-rose-600">{step1Error}</p>}
              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
              )}
            </div>
          ) : (
            <div className="p-5 space-y-4 overflow-y-auto">
              {linkExpanded ? (
                <ClassLinkChoice
                  value={linkDraft}
                  onChange={(next) => { setLinkDraft(next); setError(''); }}
                  linkModeAvailable={linkModeAvailable}
                  connection={connection}
                  onSaveAndConnect={() => void save(true)}
                  busy={saving}
                  showErrors={showLinkErrors}
                />
              ) : (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-2 text-sm">
                  {linkDraft.mode === 'custom'
                    ? <LinkIcon className="size-4 shrink-0 text-brand-deep" />
                    : <Video className="size-4 shrink-0 text-brand-deep" />}
                  <span className="min-w-0 flex-1 truncate text-ink">Students join with {linkSummary}.</span>
                  <button
                    type="button"
                    onClick={() => setLinkExpanded(true)}
                    className="shrink-0 text-xs font-semibold text-brand-deep hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}
              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
              )}
            </div>
          )}

          <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
            {step === 2 && !linkOnly && (
              <button
                type="button"
                onClick={() => { setError(''); setStep(1); }}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              {offerLinkLater && (
                <button
                  type="button"
                  onClick={() => void save(false, true)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-semibold text-ink hover:bg-muted disabled:opacity-50"
                >
                  Continue and add link later
                </button>
              )}
              {step === 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!!step1Error || saving}
                  className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50"
                >
                  {physical ? (saving ? 'Saving…' : 'Save schedule') : 'Next'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void save(false)}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : linkOnly ? 'Save class link' : 'Save schedule'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clash warning. Above the modal (z-[60]); it asks, it doesn't block. */}
      {conflicts.length > 0 && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-amber-100 grid place-items-center shrink-0">
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div>
                <div className="font-bold text-ink text-lg">Time conflict detected</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {conflicts.length === 1 ? 'This time overlaps' : `These ${conflicts.length} times overlap`} with a
                  session already in this class:
                </p>
              </div>
            </div>
            <ul className="space-y-1 text-sm bg-amber-50 rounded-xl p-3 border border-amber-200">
              {conflicts.slice(0, CONFLICTS_SHOWN).map((c) => (
                <li key={c.scheduled_start_at} className="text-amber-900 font-medium">
                  {fmtDay(c.scheduled_start_at)} · {fmtTime(c.scheduled_start_at)}
                </li>
              ))}
              {conflicts.length > CONFLICTS_SHOWN && (
                <li className="text-amber-800">and {conflicts.length - CONFLICTS_SHOWN} more</li>
              )}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConflicts([])}
                className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
              >
                Change time
              </button>
              <button
                type="button"
                onClick={advance}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
              >
                {physical ? 'Add anyway' : 'Continue anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
