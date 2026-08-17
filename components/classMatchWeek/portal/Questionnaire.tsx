'use client';

/**
 * The five-question Class Match Week questionnaire.
 *
 * One question per screen, about 90 seconds total, back navigation always
 * available. The visitor has NO account and anonymous clients read zero rows
 * through RLS — silently — so nothing in this component queries Supabase.
 * Subject options come from /api/class-match/subjects, and answers are
 * persisted after EVERY step via POST /api/class-match/submission, which sets
 * the HttpOnly `cmw_token` cookie. That server-side row — not component state —
 * is what lets answers survive a reload and the Google sign-in round trip.
 *
 * Mid-range Android over mobile data is the target device: CSS transitions
 * only, no animation libraries, and a failed save never blocks or loses a tap —
 * the answer stays on screen and a quiet retry line appears.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { QUESTIONNAIRE_LEVELS, type CanonicalLevel } from '@/lib/classMatchWeek/levels';
import {
  AVAILABILITY_BLOCKS,
  type AvailabilityBlock,
  type ClassMatchCampaign,
  type SubmissionRole,
} from '@/lib/classMatchWeek/types';
import CountdownPill from './CountdownPill';
import QuestionArt from './QuestionArt';

const TOTAL_STEPS = 5;
const NOT_SURE = 'Not sure yet';
const MAX_PICKS = 2;

const SUPPORT_OPTIONS = [
  'Exam preparation',
  'Homework help',
  'Catching up',
  'Staying challenged',
  NOT_SURE,
];

const TEACHER_OPTIONS = [
  'Patient and encouraging',
  'Structured and firm',
  'Experienced with exams',
  'Fun and engaging',
  NOT_SURE,
];

type SubjectOption = { value: string; label: string };

/**
 * Q4/Q5 shared mechanics. "Not sure yet" clears and locks the others; with two
 * picks made, further taps do nothing — the disabled styling says why. An
 * older selection is never silently swapped out.
 */
function toggleMaxTwo(current: string[], option: string): string[] {
  if (option === NOT_SURE) {
    return current.includes(NOT_SURE) ? [] : [NOT_SURE];
  }
  if (current.includes(option)) return current.filter((o) => o !== option);
  if (current.includes(NOT_SURE)) return current;
  if (current.length >= MAX_PICKS) return current;
  return [...current, option];
}

/**
 * The selection control on the right of every option row.
 *
 * A ring that fills when chosen — round for single-answer questions, rounded
 * square for multi-select, so the shape itself says whether picking a second
 * option is allowed before the visitor tries it.
 */
function Indicator({ selected, multi = false }: { selected: boolean; multi?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-5 shrink-0 place-items-center border-2 transition-colors ${
        multi ? 'rounded-md' : 'rounded-full'
      } ${selected ? 'border-brand bg-brand text-white' : 'border-border bg-white text-transparent'}`}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

/** Greyed out: unselected, and either locked by "Not sure yet" or by two picks. */
function isLockedMaxTwo(current: string[], option: string): boolean {
  if (current.includes(option)) return false;
  if (current.includes(NOT_SURE)) return true;
  return current.length >= MAX_PICKS;
}

export default function Questionnaire({
  role,
  campaign,
}: {
  role: SubmissionRole;
  campaign: ClassMatchCampaign;
}) {
  const router = useRouter();
  const isParent = role === 'parent';

  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<CanonicalLevel | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [support, setSupport] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);

  const [saveFailed, setSaveFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Q2 option list — fetched per level, refetched when the user goes back and
  // changes level (optionsLevel tracks which level the current list answers).
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[] | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [fetchNonce, setFetchNonce] = useState(0);
  const [query, setQuery] = useState('');
  const optionsLevelRef = useRef<CanonicalLevel | null>(null);

  // ── persistence ──────────────────────────────────────────────────────────

  type Payload = {
    role: SubmissionRole;
    level: CanonicalLevel | null;
    subjects: string[];
    availability: AvailabilityBlock[];
    support_needed: string[];
    teacher_preferences: string[];
  };

  const lastPayload = useRef<Payload | null>(null);

  const buildPayload = (over: Partial<Omit<Payload, 'role'>> = {}): Payload => ({
    role,
    level: over.level !== undefined ? over.level : level,
    subjects: over.subjects ?? subjects,
    availability: over.availability ?? availability,
    support_needed: over.support_needed ?? support,
    teacher_preferences: over.teacher_preferences ?? prefs,
  });

  const persist = useCallback(async (payload: Payload): Promise<boolean> => {
    lastPayload.current = payload;
    try {
      const res = await fetch('/api/class-match/submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`submission save failed: ${res.status}`);
      setSaveFailed(false);
      return true;
    } catch {
      // Never lose a tap: the answer stays in state, the retry line appears.
      setSaveFailed(true);
      return false;
    }
  }, []);

  const retrySave = () => {
    if (lastPayload.current) void persist(lastPayload.current);
  };

  // ── step handlers ────────────────────────────────────────────────────────

  const pickLevel = (value: CanonicalLevel) => {
    const changed = value !== level;
    setLevel(value);
    // Subjects are conditional on level: a changed level invalidates the
    // selection and forces the option list to refetch on entry to Q2.
    if (changed) {
      setSubjects([]);
      setQuery('');
      optionsLevelRef.current = null;
      setSubjectOptions(null);
      setOptionsError(false);
    }
    // No auto-advance: the illustration reacts to this choice, and jumping to
    // the next question would move the screen before that read. Continue is
    // the same explicit control every other step uses.
  };

  const continueFrom = (index: number) => {
    setStep(index + 1);
    // Fire-and-forget: intermediate saves never block the next question.
    void persist(buildPayload());
  };

  /** Has the current question been answered? Drives Continue and the artwork. */
  const answered =
    step === 0
      ? level !== null
      : step === 1
        ? subjects.length > 0
        : step === 2
          ? availability.length > 0
          : step === 3
            ? support.length > 0
            : prefs.length > 0;

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    // The final save must land before navigating — the results page re-runs
    // the match from the stored row, so leaving on a failed save would show
    // stale or missing answers. (The response includes { match }; we ignore it
    // and let the results page re-run live, so nothing here can drift.)
    const ok = await persist(buildPayload());
    if (ok) {
      // Signup sits BETWEEN the questionnaire and results: the anonymous
      // phase ends at Q5, and results require an authenticated user. A
      // visitor who already has a session skips straight through —
      // getSession() reads local auth state, not the database, so the
      // no-Supabase-queries rule in the header still holds.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      router.push(session ? '/class-match-week/results' : '/class-match-week/signup');
      return;
    }
    setSubmitting(false);
  };

  // ── Q2 option fetching ───────────────────────────────────────────────────

  useEffect(() => {
    if (step !== 1 || !level) return;
    if (optionsLevelRef.current === level && subjectOptions !== null) return;

    let cancelled = false;
    setSubjectOptions(null);
    setOptionsError(false);
    (async () => {
      try {
        const res = await fetch(`/api/class-match/subjects?level=${encodeURIComponent(level)}`);
        if (!res.ok) throw new Error(`subjects fetch failed: ${res.status}`);
        const data = await res.json();
        // The route is being built alongside this component — accept the
        // common response shapes rather than betting on one.
        const raw = Array.isArray(data) ? data : data?.subjects ?? data?.options ?? data?.data ?? [];
        const opts: SubjectOption[] = (Array.isArray(raw) ? raw : [])
          .map((item: unknown) => {
            if (typeof item === 'string') return { value: item, label: item };
            const o = item as Record<string, unknown>;
            const value = String(o?.value ?? o?.name ?? o?.label ?? '');
            const label = String(o?.label ?? o?.name ?? o?.value ?? '');
            return { value, label };
          })
          .filter((o) => o.value.trim() !== '');
        if (!cancelled) {
          setSubjectOptions(opts);
          optionsLevelRef.current = level;
        }
      } catch {
        if (!cancelled) {
          setSubjectOptions([]);
          setOptionsError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // subjectOptions intentionally omitted: the guard above reads it, but the
    // fetch should re-run only on step/level changes or an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, level, fetchNonce]);

  const retryOptions = () => {
    optionsLevelRef.current = null;
    setSubjectOptions(null);
    setOptionsError(false);
    setFetchNonce((n) => n + 1);
  };

  // Empty query shows the first ~10 options as popular chips; a query searches
  // the whole list.
  const visibleOptions = useMemo(() => {
    const opts = subjectOptions ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return opts.slice(0, 10);
    return opts.filter((o) => o.label.toLowerCase().includes(q));
  }, [subjectOptions, query]);

  const toggleSubject = (value: string) => {
    setSubjects((cur) => (cur.includes(value) ? cur.filter((s) => s !== value) : [...cur, value]));
  };

  const subjectLabel = (value: string) =>
    subjectOptions?.find((o) => o.value === value)?.label ?? value;

  // A search that matches nothing can still be recorded as free text — the
  // submission stores subjects as plain strings, and an unmet request is the
  // demand signal telling iTutor which teachers to recruit next.
  const customEntry = query.trim();
  const showCustomAdd =
    customEntry.length > 1 &&
    subjectOptions !== null &&
    visibleOptions.length === 0 &&
    !subjects.includes(customEntry);

  // ── copy ─────────────────────────────────────────────────────────────────

  const titles: string[] = [
    isParent ? 'What level is your child at?' : 'What level are you at?',
    isParent ? 'Which subjects does your child need?' : 'Which subjects do you need?',
    isParent ? 'When can your child attend a class?' : 'When can you attend a class?',
    isParent ? 'What kind of support does your child need?' : 'What kind of support do you need?',
    'What matters most in a teacher?',
  ];

  const subtitles: (string | null)[] = [
    null,
    'Pick as many as you like — search for anything you don’t see.',
    'Pick every time that works. We match against the teacher’s regular weekly class, not just the free session.',
    'Choose up to two.',
    'Choose up to two.',
  ];

  // Q1 now requires Continue like every other step. Auto-advancing would skip
  // straight past the illustration reacting to the choice, which is the whole
  // point of the interaction model this flow is modelled on.
  const canContinue =
    step === 0
      ? level !== null
      : step === 1
        ? subjects.length > 0
        : step === 2
          ? availability.length > 0
          : step === 3
            ? support.length > 0
            : prefs.length > 0;

  // ── shared option styling ────────────────────────────────────────────────
  // Full-width rows with the state indicator on the RIGHT, so the eye tracks a
  // single column of controls down the list rather than hunting a tick that
  // moves with the label length.

  const rowBase =
    'flex min-h-[60px] w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-[15px] font-semibold transition-all duration-150';
  const rowIdle = 'border-border bg-white text-ink hover:border-brand/60 hover:shadow-sm';
  const rowSelected = 'border-brand bg-brand-soft/50 text-ink shadow-sm';
  const rowLocked = 'cursor-not-allowed border-border bg-muted text-ink-muted opacity-60';

  const renderMaxTwo = (options: string[], current: string[], set: (next: string[]) => void) => (
    <div className="mt-4 grid gap-2">
      {options.map((option) => {
        const selected = current.includes(option);
        const locked = isLockedMaxTwo(current, option);
        return (
          <button
            key={option}
            type="button"
            disabled={locked}
            onClick={() => set(toggleMaxTwo(current, option))}
            className={`${rowBase} ${selected ? rowSelected : locked ? rowLocked : rowIdle}`}
          >
            {option}
            <Indicator selected={selected} multi />
          </button>
        );
      })}
    </div>
  );

  return (
    // Split screen: artwork on the left, one question on the right. The art
    // panel is hidden below lg — on a phone the question must own the viewport,
    // and a decorative half would push the options under the fold.
    <main className="flex min-h-screen bg-white">
      <aside className="sticky top-0 hidden h-screen w-[42%] shrink-0 lg:block">
        <QuestionArt step={step} answered={answered} />
      </aside>

      <div className="flex w-full flex-1 justify-center px-4 pb-16 pt-6 lg:items-center lg:px-12">
        <div className="w-full max-w-md">
        {/* header: back (mandatory — subjects depend on level), campaign clock */}
        <div className="flex items-center justify-between gap-3">
          {step === 0 ? (
            <Link
              href="/class-match-week"
              aria-label="Back to Class Match Week"
              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:bg-mint"
            >
              <ArrowLeft className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              aria-label="Back to the previous question"
              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:bg-mint"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} size="sm" />
        </div>

        {/* progress */}
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? 'bg-brand' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-muted">
          Question {step + 1} of {TOTAL_STEPS}
          {step === 0 && ' · takes about 90 seconds'}
        </p>

        {saveFailed && (
          <p className="mt-2 text-[11px] text-ink-muted">
            Your answer is kept on this screen but didn&rsquo;t save.{' '}
            <button
              type="button"
              onClick={retrySave}
              className="font-semibold text-brand-deep underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        )}

        {/* Mobile keeps a compact version of the artwork so the reaction to a
            selection is still visible where the panel cannot be. */}
        <div className="mt-6 h-32 overflow-hidden rounded-3xl lg:hidden">
          <QuestionArt step={step} answered={answered} />
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {titles[step]}
        </h1>
        {subtitles[step] && <p className="mt-2 text-sm text-ink-muted">{subtitles[step]}</p>}

        {/* Q1 — level, single select */}
        {step === 0 && (
          <div className="mt-6 grid gap-2.5">
            {QUESTIONNAIRE_LEVELS.map((l) => {
              const selected = level === l.value;
              return (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => pickLevel(l.value)}
                  className={`${rowBase} ${selected ? rowSelected : rowIdle}`}
                >
                  {l.label}
                  <Indicator selected={selected} />
                </button>
              );
            })}
          </div>
        )}

        {/* Q2 — subjects: search on top, popular chips beneath */}
        {step === 1 && (
          <div className="mt-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search subjects — Maths, POB, Add Maths…"
                className="w-full rounded-2xl border border-border bg-white py-3 pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </div>

            {subjects.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {subjects.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-deep"
                  >
                    {subjectLabel(s)}
                    <button type="button" onClick={() => toggleSubject(s)} aria-label={`Remove ${subjectLabel(s)}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {subjectOptions === null ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="h-9 w-24 animate-pulse rounded-full bg-muted" />
                ))}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {visibleOptions.map((o) => {
                  const selected = subjects.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleSubject(o.value)}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                        selected
                          ? 'border-brand bg-brand text-white'
                          : 'border-border bg-white text-ink hover:border-brand'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
                {showCustomAdd && (
                  <button
                    type="button"
                    onClick={() => {
                      toggleSubject(customEntry);
                      setQuery('');
                    }}
                    className="rounded-full border border-dashed border-brand-deep bg-white px-3.5 py-2 text-xs font-semibold text-brand-deep transition-colors hover:bg-brand-soft"
                  >
                    Add &ldquo;{customEntry}&rdquo;
                  </button>
                )}
              </div>
            )}

            {optionsError && (
              <p className="mt-3 text-[11px] text-ink-muted">
                Couldn&rsquo;t load the subject list.{' '}
                <button
                  type="button"
                  onClick={retryOptions}
                  className="font-semibold text-brand-deep underline underline-offset-2"
                >
                  Retry
                </button>
              </p>
            )}
          </div>
        )}

        {/* Q3 — availability, multi-select */}
        {step === 2 && (
          <div className="mt-4 grid gap-2">
            {AVAILABILITY_BLOCKS.map((block) => {
              const selected = availability.includes(block.value);
              return (
                <button
                  key={block.value}
                  type="button"
                  onClick={() =>
                    setAvailability((cur) =>
                      cur.includes(block.value)
                        ? cur.filter((b) => b !== block.value)
                        : [...cur, block.value]
                    )
                  }
                  className={`${rowBase} ${selected ? rowSelected : rowIdle}`}
                >
                  {block.label}
                  <Indicator selected={selected} multi />
                </button>
              );
            })}
          </div>
        )}

        {/* Q4 — support needed, max two, "Not sure yet" clears and locks */}
        {step === 3 && renderMaxTwo(SUPPORT_OPTIONS, support, setSupport)}

        {/* Q5 — what matters in a teacher, same mechanics */}
        {step === 4 && renderMaxTwo(TEACHER_OPTIONS, prefs, setPrefs)}

        {/* Every step ends in the same explicit control, disabled until the
            question is answered — the flow never advances under the visitor. */}
        <button
          type="button"
          disabled={!canContinue || (step === 4 && submitting)}
          onClick={step === 4 ? finish : () => continueFrom(step)}
          className={`mt-8 w-full rounded-2xl px-4 py-4 text-[15px] font-bold transition-colors ${
            canContinue && !(step === 4 && submitting)
              ? 'bg-brand text-white hover:bg-brand-deep'
              : 'cursor-not-allowed bg-muted text-ink-muted'
          }`}
        >
          {step === 4 ? (submitting ? 'Finding your matches…' : 'See my matches') : 'Continue'}
        </button>
        </div>
      </div>
    </main>
  );
}
