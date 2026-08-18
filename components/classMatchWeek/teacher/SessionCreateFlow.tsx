'use client';

/**
 * Create a Class Match Week session — three steps, on a page.
 *
 * Ported from the design-kit prototype, with one deliberate change: it is a PAGE,
 * not the modal it was drawn as. The flow collects a taster and a discount offer
 * across three steps with a persistent preview; a modal that tall fights the
 * viewport on a laptop, traps scrolling, and loses everything typed if the
 * backdrop is clicked. The old single-panel modal is gone rather than kept
 * beside this, so there is one implementation to change.
 *
 * WHY THREE STEPS AND NOT ONE LIST. The session and the offer are different
 * objects with different audiences: the session is a free half hour a family
 * turns up to, the offer is a discount they spend later, possibly on a different
 * class. Teachers filling one flat form treated the discount fields as optional
 * detail on the session. Splitting them makes the reward a decision of its own,
 * and Review exists because publishing puts a price in front of strangers.
 *
 * ONE CLASS LIST DOES BOTH JOBS (owner's decision). Everything ticked is covered
 * by the discount, and the first tick that CAN host a taster is the taster's
 * class — the database needs exactly one of those, since the session inherits
 * that class's schedule, price and page. Order therefore carries meaning, which
 * is why `picked` is an array and "Make taster" moves an id to the front rather
 * than writing a second field that could disagree with the list.
 *
 * The dark step rail and its live family-facing preview were removed on the
 * owner's instruction. Step position still shows in the header, so nothing about
 * navigation was lost with it.
 *
 * Defaults still make publishing cheap (docs 01 §1.4): discount 10%, a 14-day
 * claim window, price held 3 months, unlimited attendees. A teacher who changes
 * nothing but the name, class and time has a valid session.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Check,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Minus,
  Clock,
  Calendar,
  Users,
  BookOpen,
  Gift,
  Percent,
  Layers,
  Timer,
  Type,
  PartyPopper,
  Loader2,
  AlertTriangle,
  ExternalLink,
  FlaskConical,
  Sigma,
  PenLine,
  Microscope,
  Landmark,
  Languages,
  Globe2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DISCOUNT_MIN, DISCOUNT_MAX, type ClassMatchCampaign } from '@/lib/classMatchWeek/types';

/** A class the teacher can pick, already filtered by the caller. */
export type FlowClass = {
  id: string;
  name: string;
  /** Pre-formatted, e.g. "TT$120/mo" — this component never touches money fields. */
  priceLabel: string;
  subject: string | null;
};

const DURATIONS = [30, 45, 60, 90];

/**
 * How long the discounted price holds. Labelled from the family's side —
 * "their first 3 months" — because the count starts at THEIR enrolment, not at
 * the class's start date.
 *
 * There is no "as long as they stay enrolled" option, though the prototype drew
 * one: `price_duration_months` is finite by design (migration 232), because the
 * savings figure quoted to the family is price × discount × months and has no
 * answer for an unbounded duration.
 */
const PRICE_HOLDS = [
  { months: 1, label: 'Their first month' },
  { months: 2, label: 'Their first 2 months' },
  { months: 3, label: 'Their first 3 months' },
  { months: 6, label: 'Their first 6 months' },
  { months: 12, label: 'Their first 12 months' },
];

const STEPS = [
  { n: 1, label: 'The session', hint: 'What families turn up to' },
  { n: 2, label: 'The reward', hint: 'What they unlock by coming' },
  { n: 3, label: 'Review', hint: 'One last look, then publish' },
] as const;

/**
 * A tint and an icon per class card.
 *
 * Neither is stored on a class, so both are DERIVED and must be stable: the tint
 * from the position in the list, the icon from a keyword in the subject. A random
 * or re-sorted assignment would make the same class look different on each visit,
 * which is worse than a plain list.
 */
const TINTS = ['bg-sky', 'bg-lavender', 'bg-mint-deep', 'bg-peach', 'bg-coral-soft', 'bg-mint'];

const SUBJECT_ICONS: ReadonlyArray<[RegExp, React.ComponentType<{ className?: string }>]> = [
  [/chem/i, FlaskConical],
  [/math|algebra|calculus/i, Sigma],
  [/english|writing|literature/i, PenLine],
  [/bio|science|physics/i, Microscope],
  [/history|social/i, Landmark],
  [/spanish|french|language/i, Languages],
  [/geograph/i, Globe2],
];

function iconForSubject(subject: string | null): React.ComponentType<{ className?: string }> {
  if (subject) {
    for (const [pattern, Icon] of SUBJECT_ICONS) if (pattern.test(subject)) return Icon;
  }
  return BookOpen;
}

const INPUT =
  'w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand-light';

const AST = 'America/Port_of_Spain';

/** Campaign dates are Trinidad wall-clock — never read groups.timezone. */
function astDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-TT', {
    timeZone: AST,
    day: 'numeric',
    month: 'short',
  });
}

/** Which Trinidad calendar date an instant falls on — 'YYYY-MM-DD', sortable. */
function astDateKey(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: AST });
}

/**
 * The campaign's days, as the only dates a session may be scheduled on.
 *
 * A select rather than a date input with min/max: min/max marks an out-of-range
 * value invalid but still lets someone type or paste one, and it leaves the whole
 * calendar navigable so the constraint reads as a suggestion. A taster outside
 * the week cannot be attended by anyone browsing the week, so the constraint is
 * absolute and the control should say so.
 *
 * Derived from the campaign row, never hard-coded — that row exists precisely so
 * a second Class Match Week is a row and not a code change (migration 232).
 * Capped at 14 like the Explore day tabs, so a bad `ends_at` cannot generate an
 * endless list.
 */
function campaignDays(startsAt: string, endsAt: string): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const endKey = astDateKey(endsAt);
  let cursor = new Date(startsAt);
  if (Number.isNaN(cursor.getTime())) return out;

  for (let i = 0; i < 14; i++) {
    const value = astDateKey(cursor);
    out.push({
      value,
      label: cursor.toLocaleDateString('en-TT', {
        timeZone: AST,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    });
    if (value >= endKey) break;
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }
  return out;
}

/**
 * Start times on the half hour, grouped by the same bands the questionnaire asks
 * about (lib/classMatchWeek/types AVAILABILITY_BLOCKS, boundaries in
 * ExploreView.astBand): morning 05:00–11:59, afternoon 12:00–16:59, evening
 * 17:00–21:59.
 *
 * Bounded at 05:00–21:30 for a reason beyond taste: a start outside 05:00–22:00
 * lands in no band at all, so it would be filtered out of Explore for every
 * family who picked a time of day. Offering such a slot would let a teacher
 * schedule a session almost nobody can find.
 */
const TIME_SLOTS: ReadonlyArray<{ band: string; times: string[] }> = (() => {
  const bands: Array<{ band: string; from: number; to: number }> = [
    { band: 'Morning', from: 5 * 60, to: 12 * 60 },
    { band: 'Afternoon', from: 12 * 60, to: 17 * 60 },
    { band: 'Evening', from: 17 * 60, to: 22 * 60 },
  ];
  return bands.map(({ band, from, to }) => ({
    band,
    times: Array.from({ length: (to - from) / 30 }, (_, i) => {
      const m = from + i * 30;
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    }),
  }));
})();

/** 14:30 → "2:30 PM", so the select reads the way a teacher says it. */
function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h! < 12 ? 'AM' : 'PM';
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function Pill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-2 text-xs font-semibold transition active:scale-[0.97]',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-surface-border bg-white text-ink-muted hover:border-brand hover:text-brand-deep',
        className
      )}
    >
      {children}
    </button>
  );
}

function Section({
  step,
  label,
  hint,
  children,
}: {
  step?: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <div className="flex items-center gap-3">
          {step && (
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-light text-[11px] font-extrabold text-brand-deep">
              {step}
            </span>
          )}
          <h3 className="font-display text-base font-bold tracking-tight text-ink">{label}</h3>
        </div>
        {hint && (
          <p className={cn('text-xs leading-relaxed text-ink-muted', step && 'pl-9')}>{hint}</p>
        )}
      </div>
      <div className={cn('grid gap-2.5', step && 'pl-9')}>{children}</div>
    </section>
  );
}

export default function SessionCreateFlow({
  campaign,
  sessionable,
  promotable,
  backHref,
}: {
  campaign: ClassMatchCampaign;
  /** Classes that can HOST a taster — published, monthly and well-formed. */
  sessionable: FlowClass[];
  /** Classes the discount can cover — every published monthly class. */
  promotable: FlowClass[];
  backHref: string;
}) {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  /**
   * One list of classes now does both jobs: everything picked is covered by the
   * discount, and the FIRST pick that can host a taster is the taster's class.
   *
   * Order carries meaning, so this is an array rather than a Set. "Make taster"
   * moves an id to the front instead of writing a separate tasterId, which keeps
   * one source of truth — a second field could disagree with the list.
   */
  const [picked, setPicked] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [unlimited, setUnlimited] = useState(true);
  const [seats, setSeats] = useState(12);

  const [discount, setDiscount] = useState('10');
  const [priceMonths, setPriceMonths] = useState(3);
  const [windowDays, setWindowDays] = useState(14);

  const [submitting, setSubmitting] = useState<'publish' | 'draft' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defects, setDefects] = useState<string[]>([]);
  const [reconnectUrl, setReconnectUrl] = useState<string | null>(null);
  const [published, setPublished] = useState<{ title: string; isDraft: boolean } | null>(null);

  /**
   * Not every picked class can HOST the taster — a class with no weekly schedule
   * can carry the discount but cannot back a session (the API blocks it). So the
   * taster is the first pick that is also sessionable, and a class that cannot
   * host one is simply never offered the role.
   */
  const sessionableIds = useMemo(() => new Set(sessionable.map((c) => c.id)), [sessionable]);
  const canHost = (id: string) => sessionableIds.has(id);
  const classId = picked.find(canHost) ?? '';
  const selected = promotable.find((c) => c.id === classId) ?? null;

  const days = useMemo(
    () => campaignDays(campaign.starts_at, campaign.ends_at),
    [campaign.starts_at, campaign.ends_at]
  );

  const when = useMemo(() => {
    if (!date) return '';
    // Parsed as local midnight, not UTC, so the label never slips a day.
    const day = new Date(`${date}T00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
    return time ? `${day} · ${timeLabel(time)}` : day;
  }, [date, time]);

  const discountNumber = discount.trim() === '' ? NaN : Number(discount);
  const discountInvalid =
    !Number.isInteger(discountNumber) ||
    discountNumber < DISCOUNT_MIN ||
    discountNumber > DISCOUNT_MAX;

  const stepOneDone = !!name.trim() && !!classId && !!date && !!time;
  const canPublish = stepOneDone && !discountInvalid && !submitting;

  const togglePicked = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** Promote a class to taster by moving it to the front of the order. */
  const makeTaster = (id: string) =>
    setPicked((prev) => [id, ...prev.filter((x) => x !== id)]);

  const coveredCount = picked.length;

  const nudge = published
    ? 'Published. Host another, or head back to your sessions.'
    : step === 1
      ? stepOneDone
        ? 'Looking good. Next: the reward.'
        : 'Name it, pick a class, then set a day and time.'
      : step === 2
        ? `Minimum ${DISCOUNT_MIN}%. Generous offers fill faster.`
        : 'Publish when it reads the way you want.';

  const reset = () => {
    setStep(1);
    setName('');
    setPicked([]);
    setDate('');
    setTime('');
    setDuration(30);
    setUnlimited(true);
    setSeats(12);
    setDiscount('10');
    setPriceMonths(3);
    setWindowDays(14);
    setError(null);
    setDefects([]);
    setReconnectUrl(null);
    setPublished(null);
  };

  const submit = async (mode: 'published' | 'draft') => {
    if (!canPublish) return;
    setSubmitting(mode === 'published' ? 'publish' : 'draft');
    setError(null);
    setDefects([]);
    setReconnectUrl(null);

    // date + time are Trinidad wall-clock. AST is UTC-4 with no DST, so pin the
    // offset rather than trusting the browser's timezone — a teacher on a
    // mistimed device still schedules correctly.
    const scheduledAt = `${date}T${time.length === 5 ? `${time}:00` : time}-04:00`;

    try {
      const res = await fetch('/api/class-match/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: classId,
          title: name.trim(),
          scheduledAt,
          durationMinutes: duration,
          discountPercent: discountNumber,
          redemptionWindowDays: windowDays,
          priceDurationMonths: priceMonths,
          qualifyingGroupIds: picked.filter((id) => id !== classId),
          maxAttendees: unlimited ? null : seats,
          publish: mode === 'published',
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.session) {
        setPublished({ title: json.session.title, isDraft: json.session.status !== 'published' });
        setStep(3);
        return;
      }

      if (Array.isArray(json.messages) && json.messages.length > 0) {
        setDefects(json.messages);
      } else if (json.error === 'outside_campaign_window') {
        setError(
          `Sessions have to run during Class Match Week — ${astDay(campaign.starts_at)} to ${astDay(
            campaign.ends_at
          )}. Pick another day.`
        );
      } else if (json.error === 'meet_link_failed' || json.reconnectUrl) {
        setError(json.reason ?? 'We could not create the Google Meet link.');
        if (json.reconnectUrl) setReconnectUrl(json.reconnectUrl);
      } else {
        setError(json.error ?? 'Something went wrong — please try again.');
      }
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  const reviewRows: ReadonlyArray<[string, string, React.ComponentType<{ className?: string }>]> = [
    ['Session', name.trim() || 'Not named yet', Type],
    ['Taster for', selected?.name ?? 'No class picked', BookOpen],
    ['When', `${when || 'No date set'} · ${duration} min`, Calendar],
    ['Attendees', unlimited ? 'Unlimited' : `${seats} seats`, Users],
    [
      'Discount',
      discountInvalid
        ? 'Not set'
        : `${discountNumber}% off, held for ${
            PRICE_HOLDS.find((h) => h.months === priceMonths)?.label.replace('Their ', '') ??
            `${priceMonths} months`
          }`,
      Percent,
    ],
    ['Covers', coveredCount ? `${coveredCount} ${coveredCount === 1 ? 'class' : 'classes'}` : 'No classes yet', Layers],
    ['Claim window', `${windowDays} days from attending`, Timer],
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
      <div className="flex min-w-0 flex-col bg-surface-soft">
        <header className="flex items-center gap-4 border-b border-border bg-white px-5 py-4 sm:px-7">
          <div className="grid flex-1 gap-2">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-base font-bold tracking-tight text-ink">
                {published ? 'Published' : STEPS[step - 1].label}
              </span>
              <span className="whitespace-nowrap text-xs text-ink-muted">Step {step} of 3</span>
            </div>
            <div className="flex gap-1">
              {STEPS.map((s) => (
                <span
                  key={s.n}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    step >= s.n ? 'bg-brand' : 'bg-border'
                  )}
                />
              ))}
            </div>
          </div>
          <Link
            href={backHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3 py-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-muted hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> Sessions
          </Link>
        </header>

        <div className="grid flex-1 content-start gap-7 px-5 py-6 sm:px-7">
          {/* Step 1 — the session */}
          {step === 1 && !published && (
            <>
              <Section
                step="1"
                label="Name your session"
                hint="Families see this name when they browse Class Match Week."
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Meet your teacher: …"
                  className={cn(INPUT, 'font-display text-[1.0625rem] font-semibold tracking-tight')}
                />
                <div className="flex flex-wrap gap-1.5">
                  {['Meet your teacher: ', 'Try a lesson: ', 'Ask me anything: '].map((p) => (
                    <Pill key={p} active={name.startsWith(p)} onClick={() => setName(p)}>
                      {p.trim()}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section
                step="2"
                label="Which classes is this for?"
                hint="Everything you pick is covered by the discount. The first one you pick is the class the taster itself runs from — swap it any time."
              >
                <div className="grid gap-2">
                  {promotable.map((c, i) => {
                    const Icon = iconForSubject(c.subject);
                    const on = picked.includes(c.id);
                    const isTaster = classId === c.id;
                    const hostable = canHost(c.id);
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl border bg-white p-3 transition',
                          isTaster
                            ? 'border-brand ring-2 ring-brand-light'
                            : on
                              ? 'border-brand'
                              : 'border-surface-border'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => togglePicked(c.id)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <span
                            className={cn(
                              'grid size-[18px] shrink-0 place-items-center rounded-md border-[1.5px]',
                              on
                                ? 'border-brand bg-brand text-white'
                                : 'border-surface-border bg-white'
                            )}
                          >
                            {on && <Check className="size-3" />}
                          </span>
                          <span
                            className={cn(
                              'grid size-[34px] shrink-0 place-items-center rounded-lg text-forest',
                              TINTS[i % TINTS.length]
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <span className="grid min-w-0 gap-0.5">
                            <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                            <span className="text-xs text-ink-muted">
                              {c.subject ? `${c.subject} · ` : ''}
                              {c.priceLabel}
                              {!hostable && ' · discount only'}
                            </span>
                          </span>
                        </button>

                        {isTaster ? (
                          <span className="shrink-0 rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-deep">
                            Taster class
                          </span>
                        ) : (
                          on &&
                          hostable && (
                            <button
                              type="button"
                              onClick={() => makeTaster(c.id)}
                              className="shrink-0 rounded-lg border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-brand hover:text-brand-deep"
                            >
                              Make taster
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Picking only discount-only classes leaves nothing to host the
                    session, which would otherwise fail at publish with a defect
                    list rather than here, where it can be fixed in one tap. */}
                {picked.length > 0 && !classId && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    <p className="text-xs leading-relaxed text-amber-800">
                      None of these can host the session itself — they each need a weekly schedule
                      first. Pick one that can, or add a schedule from the class page.
                    </p>
                  </div>
                )}
              </Section>

              <Section
                step="3"
                label="When is it?"
                hint={`Trinidad & Tobago time. Sessions run during the campaign — ${astDay(
                  campaign.starts_at
                )} to ${astDay(campaign.ends_at)}.`}
              >
                <div className="grid gap-2.5 sm:grid-cols-[1.2fr_1fr]">
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-ink-muted">Date</span>
                    <select
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={INPUT}
                    >
                      <option value="">Pick a day…</option>
                      {days.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-ink-muted">Start time</span>
                    <select
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className={INPUT}
                    >
                      <option value="">Pick a time…</option>
                      {TIME_SLOTS.map((group) => (
                        <optgroup key={group.band} label={group.band}>
                          {group.times.map((t) => (
                            <option key={t} value={t}>
                              {timeLabel(t)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2">
                  <span className="text-xs font-semibold text-ink-muted">Duration</span>
                  <div className="flex gap-1.5">
                    {DURATIONS.map((d) => (
                      <Pill
                        key={d}
                        active={duration === d}
                        onClick={() => setDuration(d)}
                        className="flex-1"
                      >
                        {d} min
                      </Pill>
                    ))}
                  </div>
                </div>
                {duration > 60 && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                    Google may end this call after 60 minutes on free accounts.
                  </div>
                )}
              </Section>

              <Section
                step="4"
                label="Maximum attendees"
                hint="Students and parents together."
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <Pill active={unlimited} onClick={() => setUnlimited(true)}>
                    Unlimited
                  </Pill>
                  <Pill active={!unlimited} onClick={() => setUnlimited(false)}>
                    Cap it
                  </Pill>
                  {!unlimited && (
                    <div className="flex items-center gap-0.5 rounded-full border border-surface-border bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setSeats((s) => Math.max(1, s - 1))}
                        aria-label="Fewer seats"
                        className="grid size-7 place-items-center rounded-full bg-muted text-ink hover:bg-brand-light hover:text-brand-deep"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="min-w-9 text-center text-sm font-bold tabular-nums text-ink">
                        {seats}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSeats((s) => Math.min(200, s + 1))}
                        aria-label="More seats"
                        className="grid size-7 place-items-center rounded-full bg-muted text-ink hover:bg-brand-light hover:text-brand-deep"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </Section>
            </>
          )}

          {/* Step 2 — the reward */}
          {step === 2 && !published && (
            <>
              <div className="flex gap-3 rounded-2xl border border-brand/25 bg-gradient-to-br from-mint to-brand-light p-4">
                <span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-brand text-white">
                  <Gift className="size-4" />
                </span>
                <div className="grid gap-0.5">
                  <span className="text-sm font-semibold text-forest">What attendees unlock</span>
                  <span className="text-xs leading-relaxed text-forest/75">
                    A discount for the families who turn up, applied at checkout if they enrol.
                  </span>
                </div>
              </div>

              <Section step="1" label="Discount" hint={`Minimum ${DISCOUNT_MIN}%.`}>
                <div className="flex flex-wrap items-center gap-3.5">
                  <div className="flex items-baseline gap-0.5 rounded-2xl bg-ink px-4 py-2.5 text-white">
                    <span className="font-display text-4xl font-extrabold leading-none tracking-tight">
                      {discountInvalid ? '—' : discountNumber}
                    </span>
                    <span className="text-base font-bold not-italic text-brand-accent">%</span>
                  </div>
                  <div className="grid min-w-56 flex-1 gap-2">
                    <input
                      type="range"
                      className="cmw-range"
                      min={DISCOUNT_MIN}
                      max={DISCOUNT_MAX}
                      step={5}
                      value={discountInvalid ? DISCOUNT_MIN : discountNumber}
                      onChange={(e) => setDiscount(e.target.value)}
                      style={
                        {
                          '--cmw-fill': `${(((discountInvalid ? DISCOUNT_MIN : discountNumber) - DISCOUNT_MIN) / (DISCOUNT_MAX - DISCOUNT_MIN)) * 100}%`,
                        } as React.CSSProperties
                      }
                    />
                    <div className="flex gap-1.5">
                      {[10, 15, 20, 25].map((d) => (
                        <Pill
                          key={d}
                          active={discountNumber === d}
                          onClick={() => setDiscount(String(d))}
                          className="flex-1"
                        >
                          {d}%
                        </Pill>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Typed values can leave the slider's range, so the number
                    input stays authoritative and validates on its own. */}
                <input
                  type="number"
                  min={DISCOUNT_MIN}
                  max={DISCOUNT_MAX}
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  aria-label="Discount percentage"
                  className={cn(INPUT, 'max-w-32')}
                />
                {discountInvalid && (
                  <p className="text-xs text-coral">
                    Enter a whole number between {DISCOUNT_MIN} and {DISCOUNT_MAX}.
                  </p>
                )}
              </Section>

              <Section
                step="2"
                label="Discounted price holds for"
                hint="Counted from the day they enrol, not from the day the class starts."
              >
                <div className="flex flex-wrap gap-1.5">
                  {PRICE_HOLDS.map((h) => (
                    <Pill
                      key={h.months}
                      active={priceMonths === h.months}
                      onClick={() => setPriceMonths(h.months)}
                    >
                      {h.label}
                    </Pill>
                  ))}
                </div>
              </Section>

              <Section
                step="3"
                label="Days to claim it"
                hint="Counted from the day each family attends, so everyone gets the same window."
              >
                <div className="grid gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-ink-muted">7 days</span>
                    <span className="font-display text-base font-bold text-brand-deep">
                      {windowDays} days
                    </span>
                    <span className="text-xs font-semibold text-ink-muted">30 days</span>
                  </div>
                  <input
                    type="range"
                    className="cmw-range"
                    min={7}
                    max={30}
                    value={windowDays}
                    onChange={(e) => setWindowDays(Number(e.target.value))}
                    style={
                      { '--cmw-fill': `${((windowDays - 7) / 23) * 100}%` } as React.CSSProperties
                    }
                  />
                </div>
              </Section>

            </>
          )}

          {/* Step 3 — review, then the published state */}
          {step === 3 && (
            <>
              {!published && (
                <Section label="Read it back">
                  <div className="grid gap-1.5">
                    {reviewRows.map(([key, value, Icon]) => (
                      <div
                        key={key}
                        className="flex items-center gap-3 rounded-xl border border-border bg-white px-3.5 py-3"
                      >
                        <Icon className="size-4 shrink-0 text-brand-deep" />
                        <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {key}
                        </span>
                        <span className="min-w-0 text-sm font-medium text-ink">{value}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {published && (
                <div className="flex items-center gap-3 rounded-2xl border border-brand/35 bg-brand-light p-[18px]">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-brand text-white">
                    <PartyPopper className="size-4" />
                  </span>
                  <div className="grid gap-0.5">
                    <span className="text-sm font-semibold text-forest">
                      {published.isDraft
                        ? 'Saved as a draft'
                        : 'Published to Class Match Week'}
                    </span>
                    <span className="text-xs text-forest/75">
                      {published.isDraft ? (
                        <>
                          &ldquo;{published.title}&rdquo; is saved but not published, so families
                          can&rsquo;t find it yet.
                        </>
                      ) : (
                        <>
                          Families browsing {astDay(campaign.starts_at)} –{' '}
                          {astDay(campaign.ends_at)} can find &ldquo;{published.title}&rdquo; and
                          reserve a spot from now on.
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Errors — defect messages arrive from the API as finished copy */}
          {defects.length > 0 && (
            <div className="grid gap-1 rounded-xl border border-coral/30 bg-coral/5 p-3">
              {defects.map((m) => (
                <p key={m} className="text-sm text-ink">
                  {m}
                </p>
              ))}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-coral/30 bg-coral/5 p-3">
              <p className="text-sm text-ink">{error}</p>
              {reconnectUrl && (
                <a
                  href={reconnectUrl}
                  className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:underline"
                >
                  Reconnect Google <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border bg-white px-5 py-4 sm:px-7">
          <span className="flex-1 text-xs text-ink-muted">{nudge}</span>

          {published ? (
            <>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-muted"
              >
                <Plus className="size-3.5" /> Host another
              </button>
              <button
                type="button"
                onClick={() => router.push(backHref)}
                className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                Done
              </button>
            </>
          ) : (
            <>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-muted hover:text-ink"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => submit('draft')}
                disabled={!canPublish}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-muted disabled:opacity-50"
              >
                {submitting === 'draft' ? 'Saving…' : 'Save draft'}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !stepOneDone}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
                >
                  Continue <ArrowRight className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => submit('published')}
                  disabled={!canPublish}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
                >
                  {submitting === 'publish' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {submitting === 'publish' ? 'Publishing…' : 'Publish'}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
