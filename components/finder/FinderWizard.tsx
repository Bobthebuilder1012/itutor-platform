'use client';

/**
 * The Finder wizard: one question per screen, art on the left.
 *
 * Modelled on Class Match Week's questionnaire rather than invented: light
 * surface, brand-green accents, a reactive illustration panel, and the same row
 * and progress treatment. The previous dark-on-black version read as a different
 * product bolted onto the side of this one.
 *
 * Deliberate choices, each easy to get wrong:
 *
 * - THE STEP LIVES IN THE URL (`?step=n`). Browser back and refresh both have to
 *   work; a family half way through a form that resets on refresh does not start
 *   again, they leave.
 * - CONTINUE IS DISABLED, NOT HIDDEN, until the step is answered. A disabled
 *   button shows what is expected next; a missing one reads as a broken page.
 * - NO PER-STEP SKIPPING. A skipped answer poisons the demand ledger, which is
 *   the half of this feature that outlives any single search. The WHOLE wizard is
 *   skippable, from the first step only, via `Maybe later`.
 * - NO ARTIFICIAL DELAY before results. Padding a fast response to imply effort
 *   is a trick, and parents notice.
 *
 * THE LEVEL IS NOT ASKED — it was collected at signup and is read off the
 * profile. THE ACCOUNT'S SAVED SUBJECTS ARE SHOWN FIRST and badged, so the very
 * first question demonstrates that we already know the student rather than
 * starting cold.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/matching/availability';
import {
  BUDGET_BANDS,
  DELIVERY_PREFS,
  LESSON_TYPES,
  STEP,
  TOTAL_STEPS,
  URGENCIES,
  emptyAnswers,
  isStepAnswered,
  type DeliveryPref,
  type FinderAnswers,
  type LessonType,
  type Urgency,
} from '@/lib/finder/wizard';
import { trackClient } from '@/lib/analytics/client';
import { PRODUCT_EVENTS, type FinderEntryRoute, type FinderTrigger } from '@/lib/analytics/events';
import FinderArt from './FinderArt';

interface Props {
  isParent: boolean;
  firstName: string | null;
  /** Human label for the level held on the profile, e.g. "Form 4". */
  levelLabelText: string | null;
  /** Subjects already on the account, from signup or the dashboard. */
  savedSubjects: string[];
  prefillSubject: string | null;
  entryRoute: FinderEntryRoute;
  trigger: FinderTrigger | null;
  alreadyCompleted: boolean;
}

const ROW_IDLE = 'border-border bg-white text-ink hover:border-brand/60 hover:shadow-sm';
const ROW_SELECTED = 'border-brand bg-brand-soft/50 text-ink shadow-sm';

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

function OptionRow({
  label,
  detail,
  badge,
  selected,
  multi = false,
  onSelect,
}: {
  label: string;
  detail?: string;
  badge?: string;
  selected: boolean;
  multi?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        selected ? ROW_SELECTED : ROW_IDLE
      }`}
    >
      <span className="mt-0.5">
        <Indicator selected={selected} multi={multi} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-medium">{label}</span>
          {badge ? (
            <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
              {badge}
            </span>
          ) : null}
        </span>
        {detail ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{detail}</span>
        ) : null}
      </span>
    </button>
  );
}

export default function FinderWizard({
  isParent,
  firstName,
  levelLabelText,
  savedSubjects,
  prefillSubject,
  entryRoute,
  trigger,
  alreadyCompleted,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const firstStep = isParent ? STEP.CHILD : STEP.SUBJECT;

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
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');

  // finder_prompted_at is stamped server-side; these events pair with it to give
  // the interstitial funnel, so they fire once on mount.
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

  // Subject options for the profile's level. Fetched when the subject step is
  // reached rather than on mount, so a parent typing a child's name is not
  // waiting on a request they may not need yet.
  useEffect(() => {
    if (step !== STEP.SUBJECT) return;
    let cancelled = false;
    setSubjectOptions(null);
    setSubjectError(false);

    (async () => {
      try {
        const res = await fetch('/api/finder/subjects');
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
  }, [step, retry]);

  /**
   * Saved subjects float to the top and are badged.
   *
   * This is the "we already know you" moment: a student whose account says they
   * study Maths should see Maths first, not hunt for it in an alphabetical list
   * of the whole curriculum. Comparison is on a normalised form so
   * "CSEC Mathematics" on the account still lines up with "Mathematics" here.
   */
  const { saved, rest } = useMemo(() => {
    const list = subjectOptions ?? [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const savedKeys = new Set(savedSubjects.map(norm));
    return {
      saved: list.filter(s => savedKeys.has(norm(s))),
      rest: list.filter(s => !savedKeys.has(norm(s))),
    };
  }, [subjectOptions, savedSubjects]);

  const filtered = useCallback(
    (list: string[]) => {
      const q = query.trim().toLowerCase();
      if (!q) return list;
      return list.filter(s => s.toLowerCase().includes(q));
    },
    [query]
  );

  const learner = isParent ? (answers.childLabel || '').trim() : null;
  const who = learner || (isParent ? 'your child' : 'you');

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
          subject: answers.subject,
          availabilityBlocks: answers.availabilityBlocks,
          lessonType: answers.lessonType,
          deliveryPref: answers.deliveryPref,
          budgetBand: answers.budgetBand,
          urgency: answers.urgency,
          childLabel: answers.childLabel,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.push(isParent ? '/parent/matches' : '/student/matches');
    } catch {
      setSubmitError('We could not save your answers. Please try again.');
      setSubmitting(false);
    }
  }, [answers, submitting, router, isParent]);

  // ── step content ─────────────────────────────────────────────────────────
  let title = '';
  let subtitle: string | null = null;
  let body: React.ReactNode = null;

  if (step === STEP.CHILD) {
    title = 'Who are these lessons for?';
    subtitle = 'Just a first name — they do not need their own account yet.';
    body = (
      <div className="mt-6 space-y-3">
        <input
          type="text"
          value={answers.childLabel ?? ''}
          onChange={e => setAnswers(a => ({ ...a, childLabel: e.target.value }))}
          placeholder="First name"
          maxLength={80}
          className="w-full rounded-2xl border border-border bg-white px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-brand focus:outline-none"
        />
        <p className="text-[13px] leading-snug text-ink-muted">
          You can link their account later — securing a place does not need one now.
        </p>
      </div>
    );
  } else if (step === STEP.SUBJECT) {
    title = isParent ? `What does ${who} need help with?` : 'What do you need help with?';
    subtitle = levelLabelText
      ? `Showing ${levelLabelText} subjects, from your account.`
      : 'Pick the subject you want a class in.';
    const savedShown = filtered(saved);
    const restShown = filtered(rest);
    body = (
      <div className="mt-6 space-y-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search subjects…"
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-brand focus:outline-none"
        />

        {subjectError ? (
          <div className="rounded-2xl border border-border bg-white px-4 py-4 text-[14px] text-ink-muted">
            We could not load subjects just now.{' '}
            <button
              type="button"
              onClick={() => setRetry(n => n + 1)}
              className="font-semibold text-brand-deep underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        ) : subjectOptions === null ? (
          <p className="px-1 py-3 text-[14px] text-ink-muted">Loading subjects…</p>
        ) : savedShown.length === 0 && restShown.length === 0 ? (
          <p className="px-1 py-3 text-[14px] text-ink-muted">
            Nothing matches that. Try a shorter word.
          </p>
        ) : (
          <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1">
            {savedShown.map(subject => (
              <OptionRow
                key={subject}
                label={subject}
                badge="You study this"
                selected={answers.subject === subject}
                onSelect={() => setAnswers(a => ({ ...a, subject }))}
              />
            ))}
            {savedShown.length > 0 && restShown.length > 0 ? (
              <p className="px-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                Other subjects
              </p>
            ) : null}
            {restShown.map(subject => (
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
    title = isParent ? `When can ${who} attend?` : 'When can you attend?';
    subtitle = 'Choose every time that could work. More options means more classes fit.';
    body = (
      <div className="mt-6 space-y-2">
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
      </div>
    );
  } else if (step === STEP.LESSON_TYPE) {
    title = 'Group class or one-to-one?';
    body = (
      <div className="mt-6 space-y-2">
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
  } else if (step === STEP.DELIVERY) {
    title = 'Online or in person?';
    subtitle = 'Most classes are online. Some meet at a venue.';
    body = (
      <div className="mt-6 space-y-2">
        {DELIVERY_PREFS.map(pref => (
          <OptionRow
            key={pref.value}
            label={pref.label}
            detail={pref.detail}
            selected={answers.deliveryPref === pref.value}
            onSelect={() =>
              setAnswers(a => ({ ...a, deliveryPref: pref.value as DeliveryPref }))
            }
          />
        ))}
      </div>
    );
  } else if (step === STEP.BUDGET) {
    title = 'What is your monthly budget?';
    subtitle = 'In TT dollars. We show everything at or below what you pick.';
    body = (
      <div className="mt-6 space-y-2">
        {BUDGET_BANDS.map(band => (
          <OptionRow
            key={band.value}
            label={band.label}
            detail={band.detail}
            selected={answers.budgetBand === band.value}
            onSelect={() => setAnswers(a => ({ ...a, budgetBand: band.value }))}
          />
        ))}
      </div>
    );
  } else if (step === STEP.URGENCY) {
    title = 'When do you want to start?';
    body = (
      <div className="mt-6 space-y-2">
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
    // An out-of-range ?step= (a hand-edited URL, a stale bookmark) restarts
    // rather than rendering a blank screen.
    title = 'Let us find your iTutor';
    body = (
      <button
        type="button"
        onClick={() => goToStep(firstStep)}
        className="mt-6 rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white"
      >
        Start
      </button>
    );
  }

  const isLastStep = step === STEP.URGENCY;
  const stepIndex = Math.max(0, step);
  const showBack = step > firstStep;

  return (
    <main className="flex min-h-screen bg-white">
      <aside className="sticky top-0 hidden h-screen w-[42%] shrink-0 lg:block">
        <FinderArt step={step} answered={answered} />
      </aside>

      <div className="flex w-full flex-1 justify-center px-4 pb-16 pt-6 lg:items-center lg:px-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between gap-3">
            {showBack ? (
              <button
                type="button"
                onClick={() => goToStep(step - 1)}
                aria-label="Back"
                className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:bg-mint"
              >
                <ArrowLeft className="size-4" />
              </button>
            ) : (
              <span className="text-[15px] font-semibold tracking-tight text-ink">iTutor</span>
            )}

            {step === firstStep && !alreadyCompleted ? (
              <button
                type="button"
                onClick={skip}
                className="text-[13px] text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Maybe later
              </button>
            ) : null}
          </div>

          <div className="mt-5 flex gap-1.5" aria-hidden>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-brand' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Question {Math.min(stepIndex + 1, TOTAL_STEPS)} of {TOTAL_STEPS}
          </p>

          <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-[14px] leading-snug text-ink-muted">{subtitle}</p>
          ) : null}

          {body}

          {/* Art on mobile, where the aside is hidden. */}
          <div className="mt-6 h-32 overflow-hidden rounded-3xl lg:hidden">
            <FinderArt step={step} answered={answered} />
          </div>

          {submitError ? (
            <p role="alert" className="mt-4 text-[14px] text-coral">
              {submitError}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!answered || submitting}
            onClick={isLastStep ? submit : advance}
            className={`mt-6 w-full rounded-full px-7 py-3.5 text-[15px] font-semibold transition ${
              answered && !submitting
                ? 'bg-brand text-white hover:brightness-110'
                : 'cursor-not-allowed bg-muted text-ink-muted'
            }`}
          >
            {submitting ? 'Finding classes…' : isLastStep ? 'Show my matches' : 'Continue'}
          </button>

          {firstName && step === firstStep ? (
            <p className="mt-3 text-center text-[13px] text-ink-muted">
              Welcome, {firstName}. This takes about a minute.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
