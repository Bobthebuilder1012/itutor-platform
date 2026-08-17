'use client';

/**
 * Class Match Week — the explore catalogue (docs 04 §4.5, adapted to the
 * authed flow: the server page gates on a signed-in user and hands the whole
 * published catalogue down as props).
 *
 * ALL filtering is client-side. The catalogue is tens of sessions, so a server
 * round-trip per filter change would be pure latency — the page fetches once
 * and every tab/chip press is a synchronous re-filter of props.
 *
 * Day tabs are the PRIMARY navigation: a seven-day event reads better as days
 * than as one list, particularly on mobile. Prefill rules (docs 04 §4.5):
 * level, subject and time of day prefill from the questionnaire submission and
 * are all clearable — but the day tabs always start at "All days". Someone who
 * answered "weekday evenings" must not land with four days of sessions hidden.
 *
 * Past sessions REMAIN VISIBLE — the [OPEN] item in docs 04 §4.5 (recorded
 * beside appendix item 13) is decided as remain-visible: hiding them makes a
 * thin day look broken mid-week, while visibility keeps the whole week
 * legible. They render muted, labelled "Ended", with Reserve suppressed.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import TeacherResultCard from '@/components/classMatchWeek/portal/TeacherResultCard';
import {
  classServesLevel,
  QUESTIONNAIRE_LEVELS,
  type CanonicalLevel,
} from '@/lib/classMatchWeek/levels';
import { normaliseSubject, subjectMatches } from '@/lib/classMatchWeek/subjects';
import { formatAstDate, formatAstTimeRange } from '@/lib/utils/scheduleFormat';

/** One reservable (or ended) session inside a card, as the server page built it. */
export type ExploreSessionData = {
  sessionId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  discountPercent: number;
  /** Null means unlimited — render no counter, never "0 spaces". */
  spacesRemaining: number | null;
};

/** One teacher/class card. `formLevel` is the RAW groups.form_level for level filtering. */
export type ExploreCardData = {
  tutorId: string;
  teacherName: string;
  avatarUrl: string | null;
  subject: string | null;
  levelLabels: string[];
  classId: string;
  className: string;
  priceMonthly: number | null;
  classSlots: string[];
  formLevel: string | null;
  sessions: ExploreSessionData[];
};

export type ExploreTimeBand = 'morning' | 'afternoon' | 'evening';

type Props = {
  campaignStartsAt: string;
  campaignEndsAt: string;
  cards: ExploreCardData[];
  reservedSessionIds: string[];
  prefillLevel: CanonicalLevel | null;
  prefillSubjects: string[];
  prefillBands: ExploreTimeBand[];
  /**
   * "Now" as the server rendered it, so ended-ness is identical between the
   * server pass and hydration — Date.now() in render would mismatch.
   */
  serverNow: number;
};

const AST = 'America/Port_of_Spain';

/** Which Trinidad calendar date a timestamp falls on — 'YYYY-MM-DD' (en-CA), sortable. */
function astDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: AST });
}

/**
 * Time-of-day band of the SESSION's own start, Trinidad wall-clock. Half-open
 * bands matching lib/classMatchWeek/schedule.ts (and timeBandOf in
 * lib/utils/scheduleFormat.ts): morning 05:00 ≤ t < 12:00, afternoon
 * 12:00 ≤ t < 17:00, evening 17:00 ≤ t < 22:00 — a 17:00 start is evening,
 * not both. Outside every band → null: matches only when no band is selected.
 */
function astBand(iso: string): ExploreTimeBand | null {
  const hm = new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: AST,
  });
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (minutes >= 5 * 60 && minutes < 12 * 60) return 'morning';
  if (minutes >= 12 * 60 && minutes < 17 * 60) return 'afternoon';
  if (minutes >= 17 * 60 && minutes < 22 * 60) return 'evening';
  return null;
}

type DayTab = { key: string; label: string };

/**
 * One tab per Trinidad calendar day from campaign start to end, inclusive.
 * Hard-capped at 14 — a "week" campaign should never exceed it, and a bad
 * ends_at must not render an endless tab strip. A session falling outside the
 * campaign window (data error) still appears under "All days".
 */
function buildDayTabs(startsAt: string, endsAt: string): DayTab[] {
  const tabs: DayTab[] = [];
  const endKey = astDateKey(endsAt);
  let cursor = new Date(startsAt);
  if (Number.isNaN(cursor.getTime())) return tabs;

  for (let i = 0; i < 14; i++) {
    const key = astDateKey(cursor.toISOString());
    const weekday = cursor.toLocaleDateString('en-US', { weekday: 'short', timeZone: AST });
    const dayOfMonth = cursor.toLocaleDateString('en-US', { day: 'numeric', timeZone: AST });
    tabs.push({ key, label: `${weekday} ${dayOfMonth}` });
    if (key >= endKey) break;
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }
  return tabs;
}

/** Distinct subject chips from the sessions actually present — never a static list. */
function deriveSubjectChips(cards: ExploreCardData[]): string[] {
  const byKey = new Map<string, string>();
  for (const card of cards) {
    const raw = (card.subject ?? '').trim();
    if (!raw) continue;
    const key = normaliseSubject(raw);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, raw);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

const TIME_BAND_OPTIONS: ReadonlyArray<{ value: ExploreTimeBand; label: string }> = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

type MinDiscount = 0 | 10 | 15 | 20;

const DISCOUNT_OPTIONS: ReadonlyArray<{ value: MinDiscount; label: string }> = [
  { value: 0, label: 'Any discount' },
  { value: 10, label: '10%+' },
  { value: 15, label: '15%+' },
  { value: 20, label: '20%' },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-brand bg-brand text-white'
          : 'border-border bg-white text-ink hover:bg-mint'
      }`}
    >
      {children}
    </button>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

type AnnotatedSession = ExploreSessionData & {
  dayKey: string;
  band: ExploreTimeBand | null;
  endsAtMs: number;
};

export default function ExploreView({
  campaignStartsAt,
  campaignEndsAt,
  cards,
  reservedSessionIds,
  prefillLevel,
  prefillSubjects,
  prefillBands,
  serverNow,
}: Props) {
  const dayTabs = useMemo(
    () => buildDayTabs(campaignStartsAt, campaignEndsAt),
    [campaignStartsAt, campaignEndsAt]
  );
  const subjectChips = useMemo(() => deriveSubjectChips(cards), [cards]);

  // Day is the ONE thing never prefilled — see the header comment.
  const [dayKey, setDayKey] = useState<string>('all');
  const [level, setLevel] = useState<CanonicalLevel | null>(prefillLevel);
  // Prefill selects every present chip the questionnaire answers cover, via the
  // same normalised matching the matcher uses — "Mathematics" from the form
  // must light up a "CSEC Mathematics" chip, not miss it on raw string compare.
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(() =>
    prefillSubjects.length === 0
      ? []
      : deriveSubjectChips(cards).filter((chip) => subjectMatches(chip, prefillSubjects))
  );
  const [bands, setBands] = useState<ExploreTimeBand[]>(prefillBands);
  const [minDiscount, setMinDiscount] = useState<MinDiscount>(0);

  /**
   * Filters start COLLAPSED. Four rows of chips pushed the first result card
   * below the fold on a phone, and the day tabs above are the primary
   * navigation — the filters are a refinement, so they should not outrank the
   * thing they refine.
   *
   * Collapsed even when prefilled, which is the risky half of that decision:
   * level, subject and time prefill from the questionnaire, so a student can
   * arrive already filtered. Hiding an active filter behind a closed panel is
   * how someone concludes the week is empty when it is only their answers being
   * applied. The collapsed bar therefore carries its own state — a count and the
   * filters spelled out — and Clear all stays reachable without expanding.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);

  const annotated = useMemo(
    () =>
      cards.map((card) => ({
        card,
        sessions: card.sessions.map<AnnotatedSession>((s) => ({
          ...s,
          dayKey: astDateKey(s.scheduledAt),
          band: astBand(s.scheduledAt),
          endsAtMs: Date.parse(s.scheduledAt) + s.durationMinutes * 60_000,
        })),
      })),
    [cards]
  );

  const filtered = useMemo(() => {
    // Level routes through classServesLevel on the RAW form_level — the column
    // holds two vocabularies and one class can serve several levels.
    const passesCard = (card: ExploreCardData) =>
      (level === null || classServesLevel(card.formLevel, level)) &&
      (selectedSubjects.length === 0 || subjectMatches(card.subject, selectedSubjects));

    const passesSession = (s: AnnotatedSession) =>
      (bands.length === 0 || (s.band !== null && bands.includes(s.band))) &&
      s.discountPercent >= minDiscount;

    // Tab badges count sessions with every filter EXCEPT day applied, so a
    // badge is exactly "what tapping this tab shows".
    const dayCounts = new Map<string, number>();
    let allCount = 0;

    const visible: Array<{
      card: ExploreCardData;
      upcoming: AnnotatedSession[];
      ended: AnnotatedSession[];
    }> = [];

    for (const { card, sessions } of annotated) {
      if (!passesCard(card)) continue;

      const preDay = sessions.filter(passesSession);
      for (const s of preDay) {
        dayCounts.set(s.dayKey, (dayCounts.get(s.dayKey) ?? 0) + 1);
        allCount += 1;
      }

      const inDay = dayKey === 'all' ? preDay : preDay.filter((s) => s.dayKey === dayKey);
      if (inDay.length === 0) continue;

      visible.push({
        card,
        upcoming: inDay.filter((s) => s.endsAtMs > serverNow),
        ended: inDay.filter((s) => s.endsAtMs <= serverNow),
      });
    }

    // Reservable cards first, soonest session leading; ended-only cards sink
    // to the bottom. Never sorted by discount — that turns the page into price
    // comparison and pushes teachers to undercut each other.
    const sortKey = (v: (typeof visible)[number]) =>
      v.upcoming[0] ? `0|${v.upcoming[0].scheduledAt}` : `1|${v.ended[0]?.scheduledAt ?? '9999'}`;
    visible.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    return { visible, dayCounts, allCount };
  }, [annotated, level, selectedSubjects, bands, minDiscount, dayKey, serverNow]);

  /**
   * What is running regardless of the filters — the escape hatch for a dead end.
   *
   * A filter combination that matches nothing is a statement about the filters,
   * not about the week, and a student who sees an empty page has no way to tell
   * those apart. Rather than asking them to guess which filter to loosen, the
   * page shows what IS on and lets them recognise something. Ignores every
   * filter including the day, takes only sessions that have not already run,
   * soonest first, and caps at four so the suggestion reads as a nudge rather
   * than a second results page.
   */
  const fallback = useMemo(() => {
    const out: Array<{ card: ExploreCardData; upcoming: AnnotatedSession[] }> = [];
    for (const { card, sessions } of annotated) {
      const upcoming = sessions.filter((s) => s.endsAtMs > serverNow);
      if (upcoming.length > 0) out.push({ card, upcoming });
    }
    out.sort((a, b) =>
      (a.upcoming[0]?.scheduledAt ?? '9999').localeCompare(b.upcoming[0]?.scheduledAt ?? '9999')
    );
    return out.slice(0, 4);
  }, [annotated, serverNow]);

  // The docs are explicit that with this catalogue some days WILL be empty, so
  // the empty-day state links the nearest non-empty day instead of dead-ending.
  const nearestDay = useMemo(() => {
    if (dayKey === 'all') return null;
    const selectedIdx = dayTabs.findIndex((t) => t.key === dayKey);
    // A for-of keeps the narrowing honest — TS cannot track assignments made
    // inside a forEach callback, which left `best` typed never at the return.
    let best: { tab: DayTab; dist: number } | null = null;
    for (const [i, tab] of dayTabs.entries()) {
      if ((filtered.dayCounts.get(tab.key) ?? 0) === 0) continue;
      const dist = Math.abs(i - selectedIdx);
      if (best === null || dist < best.dist) best = { tab, dist }; // ties keep the earlier day
    }
    return best === null ? null : best.tab;
  }, [dayTabs, dayKey, filtered.dayCounts]);

  /**
   * Every active filter, named, for the collapsed bar. Counts individual
   * selections rather than categories — "Form 5 · Morning · Afternoon" is three
   * things a student would recognise, where "3 categories" is not.
   */
  const activeFilters = useMemo(() => {
    const parts: string[] = [];
    if (level !== null) {
      parts.push(QUESTIONNAIRE_LEVELS.find((l) => l.value === level)?.label ?? level);
    }
    parts.push(...selectedSubjects);
    parts.push(...bands.map((b) => TIME_BAND_OPTIONS.find((o) => o.value === b)?.label ?? b));
    if (minDiscount > 0) {
      parts.push(DISCOUNT_OPTIONS.find((d) => d.value === minDiscount)?.label ?? `${minDiscount}%+`);
    }
    return parts;
  }, [level, selectedSubjects, bands, minDiscount]);

  const anyFilterActive = activeFilters.length > 0;

  /** One teacher card, shared by the results grid and the fallback suggestions. */
  const renderEntry = ({
    card,
    upcoming,
    ended = [],
  }: {
    card: ExploreCardData;
    upcoming: AnnotatedSession[];
    ended?: AnnotatedSession[];
  }) => {
    const { formLevel: _formLevel, sessions: _sessions, ...rest } = card;
    return (
      <div key={`${card.tutorId}-${card.classId}`}>
        <TeacherResultCard
          card={{ ...rest, sessions: upcoming, tier: 'exact' }}
          reservedSessionIds={reservedSessionIds}
          authed={true}
        />
        {/* Ended sessions: visible, muted, Reserve suppressed — the
            remain-visible decision on docs 04 §4.5's open item. */}
        {ended.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-mint opacity-75">
            {ended.map((s) => (
              <li key={s.sessionId} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-muted">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {formatAstDate(new Date(s.scheduledAt), {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {formatAstTimeRange(new Date(s.scheduledAt), s.durationMinutes)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-border bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                  Ended
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  /**
   * "Nothing here, but here is what is on" — rendered under every empty state.
   *
   * The rule this enforces: a student must never reach a screen that shows them
   * no teachers at all while teachers are in fact running sessions.
   */
  const fallbackBlock =
    fallback.length > 0 ? (
      <div className="mt-6">
        <h2 className="text-sm font-bold text-ink">Other classes running this week</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          These are outside what you picked, but they are free and still open.
        </p>
        <div className="mt-3 grid gap-4">
          {fallback.map(({ card, upcoming }) => renderEntry({ card, upcoming }))}
        </div>
      </div>
    ) : null;

  const clearFilters = () => {
    setLevel(null);
    setSelectedSubjects([]);
    setBands([]);
    setMinDiscount(0);
  };

  const toggleSubject = (chip: string) =>
    setSelectedSubjects((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );

  const toggleBand = (band: ExploreTimeBand) =>
    setBands((prev) => (prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band]));

  const dayTabButton = (key: string, label: string, count: number) => {
    const active = dayKey === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setDayKey(key)}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
          active
            ? 'border-brand-deep bg-brand-deep text-white'
            : 'border-border bg-white text-ink hover:bg-mint'
        }`}
      >
        {label}
        {/* Count badge: thin days are visible before tapping. */}
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            active
              ? 'bg-white/20 text-white'
              : count === 0
                ? 'bg-mint text-ink-muted'
                : 'bg-brand-soft text-brand-deep'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div>
      {/* Day tabs — the primary navigation. Edge-to-edge scroll strip on mobile. */}
      <div className="-mx-4 mt-5 overflow-x-auto px-4">
        <div className="flex w-max gap-2 pb-1">
          {dayTabButton('all', 'All days', filtered.allCount)}
          {dayTabs.map((tab) =>
            dayTabButton(tab.key, tab.label, filtered.dayCounts.get(tab.key) ?? 0)
          )}
        </div>
      </div>

      {/* Filters — collapsed by default, all clearable, prefilled from the
          questionnaire where present. */}
      <div className="mt-4 rounded-3xl border border-border bg-white shadow-card">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <SlidersHorizontal className="size-4 shrink-0 text-ink-muted" />
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Filters
            </span>
            {anyFilterActive && (
              <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-deep">
                {activeFilters.length}
              </span>
            )}
            {/* Closed and filtered is the state that misleads, so it is the one
                that gets spelled out. Truncated rather than wrapped: the bar
                must stay one line tall on a phone. */}
            {!filtersOpen && anyFilterActive && (
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
                {activeFilters.join(' · ')}
              </span>
            )}
            <span className="ml-auto shrink-0 pl-1 text-ink-muted">
              {filtersOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </span>
          </button>
          {anyFilterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 text-[11px] font-semibold text-brand-deep underline underline-offset-2"
            >
              Clear all
            </button>
          )}
        </div>

        <div className={filtersOpen ? 'border-t border-border px-4 pb-4' : 'hidden'}>
        <FilterRow label="Level">
          <Chip active={level === null} onClick={() => setLevel(null)}>
            Any level
          </Chip>
          {QUESTIONNAIRE_LEVELS.map((l) => (
            <Chip key={l.value} active={level === l.value} onClick={() => setLevel(l.value)}>
              {l.label}
            </Chip>
          ))}
        </FilterRow>

        {subjectChips.length > 0 && (
          <FilterRow label="Subject">
            <Chip active={selectedSubjects.length === 0} onClick={() => setSelectedSubjects([])}>
              All subjects
            </Chip>
            {subjectChips.map((chip) => (
              <Chip
                key={chip}
                active={selectedSubjects.includes(chip)}
                onClick={() => toggleSubject(chip)}
              >
                {chip}
              </Chip>
            ))}
          </FilterRow>
        )}

        <FilterRow label="Time of day">
          <Chip active={bands.length === 0} onClick={() => setBands([])}>
            Any time
          </Chip>
          {TIME_BAND_OPTIONS.map((b) => (
            <Chip key={b.value} active={bands.includes(b.value)} onClick={() => toggleBand(b.value)}>
              {b.label}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Discount after attending">
          {DISCOUNT_OPTIONS.map((d) => (
            <Chip
              key={d.value}
              active={minDiscount === d.value}
              onClick={() => setMinDiscount(d.value)}
            >
              {d.label}
            </Chip>
          ))}
        </FilterRow>
        </div>
      </div>

      {/* Results grid — the same one-card-per-teacher presentation as results. */}
      {filtered.visible.length > 0 ? (
        <div className="mt-5 grid gap-4">
          {filtered.visible.map((entry) => renderEntry(entry))}
        </div>
      ) : dayKey !== 'all' ? (
        // Designed empty-day state, never a blank screen: with this catalogue
        // some days WILL be empty (docs 04 §4.5).
        <>
          <div className="mt-5 rounded-3xl border border-border bg-white p-6 text-center shadow-card">
            <p className="text-sm font-bold text-ink">No results for these filters</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Nothing matching runs on this day — try All days.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDayKey('all')}
                className="rounded-2xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
              >
                Show all days
              </button>
              {nearestDay && (
                <button
                  type="button"
                  onClick={() => setDayKey(nearestDay.key)}
                  className="rounded-2xl border border-border bg-white px-4 py-2.5 text-xs font-bold text-ink transition-colors hover:bg-mint"
                >
                  Try {nearestDay.label}
                </button>
              )}
            </div>
          </div>
          {fallbackBlock}
        </>
      ) : (
        <>
          <div className="mt-5 rounded-3xl border border-border bg-white p-6 text-center shadow-card">
            <p className="text-sm font-bold text-ink">
              {cards.length === 0 ? 'No sessions published yet' : 'No results for these filters'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {cards.length === 0
                ? 'Teachers are still adding their free sessions — check back soon.'
                : 'Nothing matches every filter at once. Clear them to see the full week.'}
            </p>
            {/* Only when the filters are actually the cause. With nothing
                published at all, clearing them changes nothing, and offering it
                implies the student did something wrong. */}
            {anyFilterActive && cards.length > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-2xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
              >
                Clear filters
              </button>
            )}
          </div>
          {fallbackBlock}
        </>
      )}
    </div>
  );
}
