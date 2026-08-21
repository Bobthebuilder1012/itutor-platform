'use client';

/**
 * The Finder wizard: one question per screen.
 *
 * Deliberate choices, each of which the spec calls for and each of which is easy
 * to get wrong:
 *
 * - THE STEP LIVES IN THE URL (`?step=n`). Browser back and refresh both have to
 *   work; a family half way through a form that resets on refresh does not start
 *   again, they leave.
 * - CONTINUE IS DISABLED, NOT HIDDEN, until the step is answered. A disabled
 *   button shows what is expected next. A missing one reads as a broken page.
 * - NO PER-STEP SKIPPING. A skipped answer poisons the demand ledger, which is
 *   the half of this feature that outlives any single search. The WHOLE wizard is
 *   skippable, from step 1 only, via `Maybe later`.
 * - NO ARTIFICIAL DELAY between the last step and results. Padding a fast
 *   response to imply effort is a trick, and parents notice.
 *
 * Level is asked before subject because `subjectsForLevel` needs a level to
 * produce options at all — see lib/finder/wizard.ts for why the spec's
 * single-picker step 1 is not buildable against this data.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QUESTIONNAIRE_LEVELS, type CanonicalLevel } from '@/lib/matching/levels';
import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/matching/availability';
import {
  BUDGET_BANDS,
  LESSON_TYPES,
  STEP,
  TOTAL_STEPS,
  URGENCIES,
  emptyAnswers,
  isStepAnswered,
  type FinderAnswers,
  type LessonType,
  type Urgency,
} from '@/lib/finder/wizard';
import { trackClient } from '@/lib/analytics/client';
import { PRODUCT_EVENTS, type FinderEntryRoute, type FinderTrigger } from '@/lib/analytics/events';

interface Props {
  isParent: boolean;
  firstName: string | null;
  learnerLevel: string | null;
  prefillSubject: string | null;
  entryRoute: FinderEntryRoute;
  trigger: FinderTrigger | null;
  alreadyCompleted: boolean;
}

/** The selection dot every option row shares, so nothing drifts visually. */
function Indicator({ selected, multi = false }: { selected: boolean; multi?: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        'flex h-5 w-5 shrink-0 items-center justify-center border transition',
        multi ? 'rounded-md' : 'rounded-full',
        selected
          ? 'border-itutor-green bg-itutor-green'
          : 'border-itutor-border bg-transparent',
      ].join(' ')}
    >
      {selected ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="#000" strokeWidth={2}>
          <path d="M2 6.5 4.5 9 10 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function OptionRow({
  label,
  detail,
  selected,
  multi = false,
  onSelect,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  multi?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition',
        selected
          ? 'border-itutor-green bg-itutor-green/10'
          : 'border-itutor-border bg-itutor-card hover:border-itutor-green/40',
      ].join(' ')}
    >
      <span className="mt-0.5">
        <Indicator selected={selected} multi={multi} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-itutor-white">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-itutor-muted">{detail}</span>
        ) : null}
      </span>
    </button>
  );
}

export default function FinderWizard({
  isParent,
  firstName,
  learnerLevel,
  prefillSubject,
  entryRoute,
  trigger,
  alreadyCompleted,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const firstStep = isParent ? STEP.CHILD : STEP.LEVEL;

  const stepParam = Number.parseInt(searchParams.get('step') ?? '', 10);
  const step = Number.isFinite(stepParam) ? stepParam : firstStep;

  const [answers, setAnswers] = useState<FinderAnswers>(() => ({
    ...emptyAnswers(),
    subject: prefillSubject,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [subjectOptions, setSubjectOptions] = useState<string[] | null>(null);
  const [subjectError, setSubjectError] = useState(false);
  const [query, setQuery] = useState('');

  // ── events ───────────────────────────────────────────────────────────────
  // finder_prompted is a server fact (the page stamps finder_prompted_at), but
  // the event pairs with finder_skipped to give the interstitial funnel, so it
  // is emitted once on mount rather than on every step render.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    if (trigger) trackClient(PRODUCT_EVENTS.FINDER_PROMPTED, { trigger });
    trackClient(PRODUCT_EVENTS.FINDER_STARTED, { entry_route: entryRoute });
  }, [trigger, entryRoute]);

  const goToStep = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', String(next));
      router.push(`/find?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // ── subject options, fetched per level ───────────────────────────────────
  useEffect(() => {
    if (step !== STEP.SUBJECT || !answers.level) return;
    let cancelled = false;

    setSubjectOptions(null);
    setSubjectError(false);

    (async () => {
      try {
        const res = await fetch(`/api/finder/subjects?level=${encodeURIComponent(answers.level!)}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { subjects?: string[] };
        if (!cancelled) setSubjectOptions(json.subjects ?? []);
      } catch {
        if (!cancelled) setSubjectError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, answers.level]);

  const filteredSubjects = useMemo(() => {
    const list = subjectOptions ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(s => s.toLowerCase().includes(q));
  }, [subjectOptions, query]);

  // ── copy ─────────────────────────────────────────────────────────────────
  // Parents see the child's name once it is known: "When can Amara attend?"
  const learner = isParent ? (answers.childLabel || '').trim() : null;
  const who = learner || (isParent ? 'your child' : 'you');
  const canAttend = isParent ? `When can ${who} attend?` : 'When can you attend?';

  const answered = isStepAnswered(step, answers, isParent);

  const advance = useCallback(() => {
    if (!answered) return;
    trackClient(PRODUCT_EVENTS.FINDER_STEP, { step, value: null });
    goToStep(step + 1);
  }, [answered, step, goToStep]);

  const skip = useCallback(() => {
    trackClient(PRODUCT_EVENTS.FINDER_SKIPPED, { step_reached: step });
    router.push(isParent ? '/parent/dashboard' : '/student/dashboard');
  }, [step, router, isParent]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/finder/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: answers.level,
          subject: answers.subject,
          availabilityBlocks: answers.availabilityBlocks,
          lessonType: answers.lessonType,
          budgetBand: answers.budgetBand,
          urgency: answers.urgency,
          childLabel: answers.childLabel,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // No padded wait. Results are already computed server-side.
      router.push('/find/results');
    } catch {
      setSubmitError('We could not save your answers. Please try again.');
      setSubmitting(false);
    }
  }, [answers, submitting, router]);

  // ── step content ─────────────────────────────────────────────────────────
  let title = '';
  let subtitle: string | null = null;
  let body: React.ReactNode = null;

  if (step === STEP.CHILD) {
    title = 'Who are these lessons for?';
    subtitle = 'Just a first name and year — they do not need their own account yet.';
    body = (
      <div className="space-y-3">
        <input
          type="text"
          value={answers.childLabel ?? ''}
          onChange={e => setAnswers(a => ({ ...a, childLabel: e.target.value }))}
          placeholder="First name"
          maxLength={80}
          className="w-full rounded-xl border border-itutor-border bg-itutor-card px-4 py-3.5 text-[15px] text-itutor-white placeholder:text-itutor-muted/60 focus:border-itutor-green focus:outline-none"
        />
        <p className="text-[13px] leading-snug text-itutor-muted">
          You can link their account later — securing a place does not need one now.
        </p>
      </div>
    );
  } else if (step === STEP.LEVEL) {
    title = isParent ? `What year is ${who} in?` : 'What year are you in?';
    subtitle = 'This decides which classes and subjects we show.';
    body = (
      <div className="space-y-2">
        {QUESTIONNAIRE_LEVELS.map(level => (
          <OptionRow
            key={level.value}
            label={level.label}
            selected={answers.level === level.value}
            onSelect={() =>
              setAnswers(a => ({
                ...a,
                level: level.value as CanonicalLevel,
                // The subject list is level-specific, so a level change
                // invalidates a subject picked under the old one.
                subject: a.level === level.value ? a.subject : null,
              }))
            }
          />
        ))}
      </div>
    );
  } else if (step === STEP.SUBJECT) {
    title = 'What do you need help with?';
    subtitle = 'Pick the subject you want a class in.';
    body = (
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search subjects…"
          className="w-full rounded-xl border border-itutor-border bg-itutor-card px-4 py-3 text-[15px] text-itutor-white placeholder:text-itutor-muted/60 focus:border-itutor-green focus:outline-none"
        />

        {subjectError ? (
          <div className="rounded-xl border border-itutor-border bg-itutor-card px-4 py-4 text-[14px] text-itutor-muted">
            We could not load subjects just now.{' '}
            <button
              type="button"
              onClick={() => setAnswers(a => ({ ...a }))}
              className="text-itutor-green underline"
            >
              Try again
            </button>
          </div>
        ) : subjectOptions === null ? (
          <p className="px-1 py-3 text-[14px] text-itutor-muted">Loading subjects…</p>
        ) : filteredSubjects.length === 0 ? (
          <p className="px-1 py-3 text-[14px] text-itutor-muted">
            Nothing matches “{query}”. Try a shorter word.
          </p>
        ) : (
          <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {filteredSubjects.map(subject => (
              <OptionRow
                key={subject}
                label={subject}
                selected={answers.subject === subject}
                onSelect={() => setAnswers(a => ({ ...a, subject }))}
              />
            ))}
          </div>
        )}
      </div>
    );
  } else if (step === STEP.AVAILABILITY) {
    title = canAttend;
    subtitle = 'Choose every time that could work. More options means more classes fit.';
    body = (
      <div className="space-y-2">
        {AVAILABILITY_BLOCKS.map(block => {
          const selected = answers.availabilityBlocks.includes(block.value);
          return (
            <OptionRow
              key={block.value}
              label={block.label}
              multi
              selected={selected}
              onSelect={() =>
                setAnswers(a => ({
                  ...a,
                  availabilityBlocks: selected
                    ? a.availabilityBlocks.filter(b => b !== block.value)
                    : [...a.availabilityBlocks, block.value as AvailabilityBlock],
                }))
              }
            />
          );
        })}
        <p className="px-1 pt-1 text-[13px] leading-snug text-itutor-muted">
          Weekday mornings are not listed — classes run outside school hours.
        </p>
      </div>
    );
  } else if (step === STEP.LESSON_TYPE) {
    title = 'Group class or one-to-one?';
    subtitle = null;
    body = (
      <div className="space-y-2">
        {LESSON_TYPES.map(type => (
          <OptionRow
            key={type.value}
            label={type.label}
            detail={type.detail}
            selected={answers.lessonType === type.value}
            onSelect={() => setAnswers(a => ({ ...a, lessonType: type.value as LessonType }))}
          />
        ))}
      </div>
    );
  } else if (step === STEP.BUDGET) {
    title = "What's your monthly budget?";
    subtitle = 'In TT dollars, per month. This helps us show classes you can actually take.';
    body = (
      <div className="space-y-2">
        {BUDGET_BANDS.map(band => (
          <OptionRow
            key={band.value}
            label={band.label}
            selected={answers.budgetBand === band.value}
            onSelect={() => setAnswers(a => ({ ...a, budgetBand: band.value }))}
          />
        ))}
      </div>
    );
  } else if (step === STEP.URGENCY) {
    title = 'When do you want to start?';
    subtitle = null;
    body = (
      <div className="space-y-2">
        {URGENCIES.map(u => (
          <OptionRow
            key={u.value}
            label={u.label}
            selected={answers.urgency === u.value}
            onSelect={() => setAnswers(a => ({ ...a, urgency: u.value as Urgency }))}
          />
        ))}
      </div>
    );
  } else {
    // An out-of-range ?step= (a hand-edited URL, a stale bookmark) returns to
    // the beginning rather than rendering a blank screen.
    title = 'Let us find your iTutor';
    body = (
      <button
        type="button"
        onClick={() => goToStep(firstStep)}
        className="rounded-full bg-itutor-green px-6 py-3 text-[15px] font-semibold text-black"
      >
        Start
      </button>
    );
  }

  const isLastStep = step === STEP.URGENCY;
  const stepIndex = Math.max(0, step);
  const showBack = step > firstStep;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Header: brand, and the skip link on the first step only */}
      <div className="mb-8 flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-tight text-itutor-white">iTutor</span>
        {step === firstStep && !alreadyCompleted ? (
          <button
            type="button"
            onClick={skip}
            className="text-[13px] text-itutor-muted underline decoration-itutor-muted/40 hover:text-itutor-white"
          >
            Maybe later
          </button>
        ) : null}
      </div>

      {/* Progress: one dot per step */}
      <div className="mb-7 flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className={[
              'h-1.5 rounded-full transition-all',
              i < stepIndex
                ? 'w-6 bg-itutor-green/60'
                : i === stepIndex
                  ? 'w-8 bg-itutor-green'
                  : 'w-6 bg-itutor-border',
            ].join(' ')}
          />
        ))}
      </div>

      <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-itutor-white sm:text-[28px]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-[14px] leading-snug text-itutor-muted">{subtitle}</p>
      ) : null}

      <div className="mt-7 flex-1">{body}</div>

      {submitError ? (
        <p role="alert" className="mt-4 text-[14px] text-coral">
          {submitError}
        </p>
      ) : null}

      {/* Footer: Back as a text link, primary action on the right */}
      <div className="mt-8 flex items-center justify-between gap-4 pb-2">
        {showBack ? (
          <button
            type="button"
            onClick={() => goToStep(step - 1)}
            className="text-[14px] text-itutor-muted hover:text-itutor-white"
          >
            Back
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          disabled={!answered || submitting}
          onClick={isLastStep ? submit : advance}
          className={[
            'rounded-full px-7 py-3 text-[15px] font-semibold transition',
            answered && !submitting
              ? 'bg-itutor-green text-black hover:brightness-110'
              : 'cursor-not-allowed bg-itutor-border text-itutor-muted',
          ].join(' ')}
        >
          {submitting ? 'Finding classes…' : isLastStep ? 'Show my matches' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
