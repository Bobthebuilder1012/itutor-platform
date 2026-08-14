'use client';

// Family calendar — handover §9.1.
//
// An agenda, not a grid. Seven columns of boxes is unreadable on a 390px phone
// and the parent app is phone-first, so this lists days downward — which is also
// the shape the mobile design kit uses. The child filter doubles as the legend,
// so a colour never appears without a name attached to it.
//
// ATTENDANCE ONLY ON THE PAST
// Upcoming classes carry no attendance value: an occurrence still to happen is
// neither attended nor absent. Colouring one as absent because no join exists yet
// would make the calendar wrong for every future class on it. Cancelled classes
// ARE shown and marked — a parent who sees a gap in the week assumes their child
// missed something.
//
// Every percentage on this page carries its denominator (§6). There is no bare
// figure anywhere.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Calendar as CalendarIcon, Check, Clock, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';

type Child = { id: string; name: string; color: string };

type PerChild = {
  childId: string;
  attended: number;
  late: number;
  absent: number;
  cancelled: number;
  excluded: number;
  rate: number | null;
  counted: number;
  rateLabel: string;
  lastAbsence: { title: string; start: string } | null;
};

type Event = {
  key: string;
  childId: string;
  title: string;
  tutorName: string | null;
  start: string;
  end: string | null;
  type: '1:1' | 'group';
  past: boolean;
  outcome: 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded' | null;
  lateMinutes: number | null;
};

const OUTCOME = {
  attended: { label: 'Attended', icon: Check, cls: 'bg-brand/10 text-brand border-brand/30' },
  late: { label: 'Late', icon: Clock, cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  absent: { label: 'Absent', icon: X, cls: 'bg-rose-50 text-rose-700 border-rose-300' },
  cancelled: { label: 'Cancelled', icon: Ban, cls: 'bg-muted text-muted-foreground border-border' },
  excluded: { label: 'Didn’t run', icon: Ban, cls: 'bg-muted text-muted-foreground border-border' },
} as const;

export default function ParentCalendarPage() {
  return (
    <ParentShell>
      <CalendarContent />
    </ParentShell>
  );
}

function CalendarContent() {
  const [children, setChildren] = useState<Child[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [perChild, setPerChild] = useState<PerChild[]>([]);
  const [view, setView] = useState<'Week' | 'Month'>('Week');
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState<string | null>(null);

  // Fetched separately from the calendar data: minting the token on first view
  // means a parent who never opens this page never has a live credential.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/calendar/subscribe-link', { cache: 'no-store' });
        if (res.ok) setSubscribeUrl((await res.json()).url ?? null);
      } catch {
        /* the copy button stays disabled */
      }
    })();
  }, []);

  const rotate = async () => {
    setRotating(true);
    try {
      const res = await fetch('/api/parent/calendar/subscribe-link', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setSubscribeUrl(json.url ?? null);
        setRotated(json.note ?? 'The old link no longer works.');
      }
    } finally {
      setRotating(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/parent/calendar', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setChildren(json.children ?? []);
      setEvents(json.events ?? []);
      setPerChild(json.perChild ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => events.filter((e) => !hidden.has(e.childId)), [events, hidden]);

  // Grouped by day, upcoming first, so the thing a parent opens this page for —
  // "what is on today" — is at the top rather than buried under last month.
  const { upcoming, past } = useMemo(() => {
    const up: Record<string, Event[]> = {};
    const pa: Record<string, Event[]> = {};
    for (const e of shown) {
      const day = new Date(e.start).toLocaleDateString('en-TT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Port_of_Spain',
      });
      const bucket = e.past ? pa : up;
      (bucket[day] = bucket[day] ?? []).push(e);
    }
    return { upcoming: up, past: pa };
  }, [shown]);

  const tally = useMemo(() => {
    const t = { attended: 0, late: 0, absent: 0, cancelled: 0 };
    for (const e of shown) {
      if (e.outcome && e.outcome in t) t[e.outcome as keyof typeof t] += 1;
    }
    const counted = t.attended + t.late + t.absent;
    return {
      ...t,
      counted,
      rate: counted ? Math.round(((t.attended + t.late) / counted) * 100) : null,
    };
  }, [shown]);

  // Week: the current Mon–Sun. Month: whole weeks covering the month, so the
  // grid stays seven columns and days never shift under the weekday headings.
  const gridDays = useMemo(() => {
    const now = new Date();
    const start = new Date(now);

    if (view === 'Week') {
      // Monday-first, matching the kit.
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow);
    } else {
      start.setDate(1);
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow);
    }
    start.setHours(0, 0, 0, 0);

    const count = view === 'Week' ? 7 : 42;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view]);

  const colorOf = (childId: string) => children.find((c) => c.id === childId)?.color ?? '#9ca3af';
  const nameOf = (childId: string) =>
    children.find((c) => c.id === childId)?.name.split(' ')[0] ?? 'Child';

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Family calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every child&rsquo;s classes in one place, colour-coded.
        </p>
      </header>

      {children.length === 0 ? (
        <div className="rounded-2xl border border-border bg-background p-6">
          <p className="text-sm text-ink">No children are linked to your account yet.</p>
        </div>
      ) : (
        <>
          {/* Filter and legend in one control: a colour never appears without a
              name next to it. */}
          <div className="flex flex-wrap gap-2">
            {children.map((c) => {
              const on = !hidden.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                    on ? 'border-border bg-background text-ink' : 'border-border text-muted-foreground'
                  }`}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: on ? c.color : '#d1d5db' }}
                  />
                  {c.name.split(' ')[0]}
                </button>
              );
            })}
          </div>

          {/* §6: never a bare percentage. */}
          {tally.rate !== null && (
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attendance in this range
              </div>
              <div className="mt-0.5 text-xl font-extrabold tabular-nums text-ink">
                {tally.rate}% of {tally.counted} {tally.counted === 1 ? 'session' : 'sessions'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {tally.attended} attended · {tally.late} late · {tally.absent} absent
                {tally.cancelled > 0 && ` · ${tally.cancelled} cancelled (not counted)`}
              </div>
            </div>
          )}

          {/* Legend. The kit carries one because the grid is colour- and
              icon-coded, and a colour with no key is a puzzle. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-background p-3">
            {(['attended', 'late', 'absent', 'cancelled'] as const).map((k) => {
              const o = OUTCOME[k];
              const Icon = o.icon;
              return (
                <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`grid size-4 place-items-center rounded border ${o.cls}`}>
                    <Icon className="size-2.5" />
                  </span>
                  {o.label}
                </span>
              );
            })}
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-4 rounded border border-border bg-muted" />
              Upcoming
            </span>
          </div>

          {/* Week/Month grid on desktop — the kit's shape. Hidden on mobile,
              where seven columns at 390px is unreadable and the mobile kit uses
              an agenda for exactly that reason. */}
          <div className="hidden lg:block">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {view === 'Week' ? 'This week' : 'This month'}
              </h2>
              <div className="inline-flex overflow-hidden rounded-lg border border-border">
                {(['Week', 'Month'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 text-xs font-semibold transition ${
                      view === v ? 'bg-muted text-ink' : 'bg-background text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {gridDays.map((d) => {
                const dayEvents = shown.filter(
                  (e) => new Date(e.start).toDateString() === d.toDateString()
                );
                return (
                  <div
                    key={d.toISOString()}
                    className={`min-h-[110px] rounded-xl border p-2 ${
                      d.toDateString() === new Date().toDateString()
                        ? 'border-brand/40 bg-brand/5'
                        : 'border-border bg-background'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      {d.toLocaleDateString('en-TT', { weekday: 'short', day: 'numeric' })}
                    </div>
                    <div className="mt-1 space-y-1">
                      {dayEvents.length === 0 ? (
                        <div className="text-[10px] text-muted-foreground/60">—</div>
                      ) : (
                        dayEvents.map((e) => {
                          const o = e.outcome && e.outcome in OUTCOME ? OUTCOME[e.outcome as keyof typeof OUTCOME] : null;
                          const Icon = o?.icon;
                          return (
                            <div
                              key={e.key}
                              className="rounded-lg border border-border bg-muted/30 p-1.5"
                              style={{ borderLeftWidth: 3, borderLeftColor: colorOf(e.childId) }}
                              title={`${nameOf(e.childId)} · ${e.title}`}
                            >
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold tabular-nums text-ink">
                                  {new Date(e.start).toLocaleTimeString('en-TT', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                    timeZone: 'America/Port_of_Spain',
                                  })}
                                </span>
                                {o && Icon && (
                                  <span className={`ml-auto grid size-3.5 place-items-center rounded border ${o.cls}`}>
                                    <Icon className="size-2" />
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {nameOf(e.childId)}
                              </div>
                              <div className="truncate text-[10px] text-ink">{e.title}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agenda — the mobile kit's shape, and the only one that works at
              390px. Shown below the grid on desktop as the scrollable detail. */}
          <div className="lg:hidden">
            <Section title="Coming up" days={upcoming} empty="Nothing scheduled ahead." colorOf={colorOf} nameOf={nameOf} />
            <div className="mt-4">
              <Section title="Already happened" days={past} empty="Nothing yet." colorOf={colorOf} nameOf={nameOf} />
            </div>
          </div>

          {/* Per-child attendance cards — the kit's AttendanceSummary. Figures
              come from the server's shared-helper output, not recomputed here,
              so a card and the grid cannot disagree about the same child. */}
          {perChild.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Attendance
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Recorded automatically when a student joins. Cancelled classes don&rsquo;t count
                against the rate.
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {perChild
                  .filter((p) => !hidden.has(p.childId))
                  .map((p) => {
                    const total = p.attended + p.late + p.absent + p.cancelled;
                    const segs = [
                      ['attended', p.attended, 'bg-brand'],
                      ['late', p.late, 'bg-amber-500'],
                      ['absent', p.absent, 'bg-rose-500'],
                      ['cancelled', p.cancelled, 'bg-muted-foreground/40'],
                    ] as const;
                    return (
                      <div
                        key={p.childId}
                        className="rounded-2xl border border-border bg-background p-4"
                        style={{ borderLeftWidth: 4, borderLeftColor: colorOf(p.childId) }}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-ink">{nameOf(p.childId)}</span>
                          {/* §6: denominator always attached. */}
                          <span className="text-sm font-extrabold tabular-nums text-ink">
                            {p.rateLabel}
                          </span>
                        </div>

                        {total > 0 && (
                          <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
                            {segs
                              .filter(([, v]) => v > 0)
                              .map(([k, v, cls]) => (
                                <span
                                  key={k}
                                  className={cls}
                                  style={{ width: `${(v / total) * 100}%` }}
                                  title={`${v} ${k}`}
                                />
                              ))}
                          </div>
                        )}

                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {segs.map(([k, v]) => (
                            <div key={k}>
                              <div className="text-base font-bold tabular-nums text-ink">{v}</div>
                              <div className="text-[10px] capitalize text-muted-foreground">{k}</div>
                            </div>
                          ))}
                        </div>

                        {p.excluded > 0 && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {p.excluded} didn&rsquo;t run — not counted either way.
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {p.lastAbsence
                            ? `Last absence: ${p.lastAbsence.title}, ${new Date(p.lastAbsence.start).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', timeZone: 'America/Port_of_Spain' })}.`
                            : 'No absences in this range.'}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* ICS subscribe. A copyable link rather than a download, so the
              calendar stays in sync instead of going stale the day it is added. */}
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700">
                <CalendarIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-ink">Add to your own calendar</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Paste this into Google, Apple or Outlook Calendar and every class stays in sync.
                </p>
                <code className="mt-2 block break-all rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {subscribeUrl ?? 'Loading your link…'}
                </code>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (!subscribeUrl) return;
                  void navigator.clipboard?.writeText(subscribeUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                disabled={!subscribeUrl}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-ink hover:bg-muted disabled:opacity-50"
              >
                <Copy className="size-3.5" />
                {copied ? 'Copied' : 'Copy subscribe link'}
              </button>
              <button
                onClick={rotate}
                disabled={rotating}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {rotating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Reset link
              </button>
            </div>

            {rotated && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                {rotated}
              </p>
            )}

            {/* The honest warning. This link is the credential — there is no
                password on it — and a parent who forwards it is handing over
                their children's timetable. Rotation is the only recovery, which
                is why the button sits right here rather than in Settings. */}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Anyone with this link can see your children&rsquo;s class times, so treat it like a
              password. Reset it if you have shared it by accident — the old link stops working
              straight away. Attendance is never included in the feed.
            </p>
          </div>
        </>
      )}
    </div>
  );
}


function Section({
  title,
  days,
  empty,
  colorOf,
  nameOf,
}: {
  title: string;
  days: Record<string, Event[]>;
  empty: string;
  colorOf: (id: string) => string;
  nameOf: (id: string) => string;
}) {
  const keys = Object.keys(days);
  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {keys.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-2 space-y-4">
          {keys.map((day) => (
            <div key={day}>
              <div className="text-xs font-semibold text-ink">{day}</div>
              <div className="mt-1.5 space-y-2">
                {days[day].map((e) => {
                  const o = e.outcome && e.outcome in OUTCOME ? OUTCOME[e.outcome as keyof typeof OUTCOME] : null;
                  const Icon = o?.icon;
                  return (
                    <div
                      key={e.key}
                      className="rounded-xl border border-border bg-background p-3"
                      style={{ borderLeftWidth: 4, borderLeftColor: colorOf(e.childId) }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold tabular-nums text-ink">
                          {new Date(e.start).toLocaleTimeString('en-TT', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: 'America/Port_of_Spain',
                          })}
                        </span>
                        <span className="text-xs text-muted-foreground">· {nameOf(e.childId)}</span>
                        {o && Icon && (
                          <span
                            className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${o.cls}`}
                          >
                            <Icon className="size-3" />
                            {o.label}
                            {e.outcome === 'late' && e.lateMinutes ? ` · ${e.lateMinutes} min` : ''}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-sm text-ink">{e.title}</div>
                      {e.tutorName && (
                        <div className="text-xs text-muted-foreground">{e.tutorName}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
