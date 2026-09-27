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
 *   skippable — and now from EVERY step, not just the first, because a visitor
 *   with no account has no dashboard to be sent back to and needs a way out that
 *   still shows them something.
 * - NO ARTIFICIAL DELAY before results. Padding a fast response to imply effort
 *   is a trick, and parents notice.
 *
 * THE LEVEL IS ASKED, because there may be no account to read it from. It used to
 * come off `profiles.form_level` and only be displayed. Where a session exists
 * that is still true and the question is skipped; pre-auth it is question one,
 * and it has to be, because the subject list is a function of it.
 *
 * THE ACCOUNT'S SAVED SUBJECTS are still shown first and badged when there are
 * any. Pre-auth there are none and the list renders as one flat block, which is
 * the correct degradation rather than something to special-case.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/matching/availability';
import {
  BUDGET_BANDS,
  DELIVERY_PREFS,
  FINDER_LEVEL_LABELS,
  LESSON_TYPES,
  QUESTIONNAIRE_LEVELS,
  STEP,
  URGENCIES,
  emptyAnswers,
  formLevelLabelFor,
  isStepAnswered,
  questionPosition,
  questionSequence,
  type CanonicalLevel,
  type DeliveryPref,
  type FinderAnswers,
  type LessonType,
  type Urgency,
} from '@/lib/finder/wizard';
import { trackClient } from '@/lib/analytics/client';
import { PRODUCT_EVENTS, type FinderEntryRoute, type FinderTrigger } from '@/lib/analytics/events';
import FinderArt from './FinderArt';
import FinderExitControls from './FinderExitControls';
import RolePicker from './RolePicker';

interface Props {
  /** From `?role=` pre-auth, from the profile when there is a session. */
  isParent: boolean;
  /** Null when no role has been chosen yet — the wizard opens on the picker. */
  role: 'student' | 'parent' | null;
  /** Whether a session exists. Decides skip/login destinations and whether the
   *  level is asked or read from the account. */
  isAuthenticated: boolean;
  firstName: string | null;
  /** The account's canonical level, when there is an account. Pre-selects the
   *  level question so an authed re-run never contradicts the profile. */
  profileLevel: CanonicalLevel | null;
  /** Subjects already on the account, from signup or the dashboard. Empty
   *  pre-auth, which simply removes the badge. */
  savedSubjects: string[];
  prefillSubject: string | null;
  entryRoute: FinderEntryRoute;
  trigger: FinderTrigger | null;
}

const ROW_IDLE = 'border-border bg-white text-ink hover:border-brand/60 hover:shadow-sm';
const ROW_SELECTED = 'border-brand bg-brand-soft/50 text-ink shadow-sm';

/**
 * The answers the visitor has actually given in THIS render, so a late-arriving
 * hydration cannot overwrite something they just typed.
 *
 * The stored copy is authoritative for questions not yet touched and wrong for
 * the one they are standing on: the fetch is in flight while the screen is
 * interactive, so without this a slow connection can clobber a fresh answer a
 * second after it was chosen — the worst kind of bug to reproduce.
 */
function pickAnswered(a: FinderAnswers): Partial<FinderAnswers> {
  const out: Partial<FinderAnswers> = {};
  if (a.childLabel) out.childLabel = a.childLabel;
  if (a.level) out.level = a.level;
  if (a.subject) out.subject = a.subject;
  if (a.availabilityBlocks.length > 0) out.availabilityBlocks = a.availabilityBlocks;
  if (a.lessonType) out.lessonType = a.lessonType;
  if (a.deliveryPref) out.deliveryPref = a.deliveryPref;
  if (a.budgetBand) out.budgetBand = a.budgetBand;
  if (a.urgency) out.urgency = a.urgency;
  return out;
}

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
  role,
  isAuthenticated,
  firstName,
  profileLevel,
  savedSubjects,
  prefillSubject,
  entryRoute,
  trigger,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const seq = questionSequence(isParent);
  // No role yet means the picker is the screen. Everything below still runs, so
  // the step content switch simply lands on STEP.ROLE.
  const firstStep = role === null ? STEP.ROLE : seq[0];

  const stepParam = Number.parseInt(searchParams.get('step') ?? '', 10);
  const stepFromUrl = Number.isFinite(stepParam) ? stepParam : null;
  // A `?step=` on a URL with no role would drop the visitor into a question we
  // cannot label ("What year is your child in?" vs "What year are you in?"), so
  // the picker wins until a role exists.
  const step = role === null ? STEP.ROLE : (stepFromUrl ?? firstStep);

  const [answers, setAnswers] = useState<FinderAnswers>(() => ({
    ...emptyAnswers(),
    subject: prefillSubject,
    // An authed run does not ask the level; pre-selecting it from the profile
    // keeps the wizard from ever disagreeing with the account.
    level: profileLevel,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [subjectOptions, setSubjectOptions] = useState<string[] | null>(null);
  const [subjectError, setSubjectError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');

  // finder_prompted_at is stamped server-side; these events pair with it to give
  // the interstitial funnel, so they fire once on mount.
  // See the <h1> below: focus moves here on every step change.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

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

  // ── Restore answers when arriving mid-wizard ──────────────────────────────
  //
  // FIXES A LIVE BUG, not just a pre-auth one. `answers` starts from
  // emptyAnswers(), so a FilterChip on the results screen that links to
  // `/find?step=4` let the visitor change their budget and then submitted
  // `subject: null` — validateAnswers returned 'subject', the route 400'd, and
  // the screen said "We could not save your answers". That is broken today for
  // logged-in users, and editing a filter is the primary way a family widens a
  // search, so it would have been the main failure mode of the new flow.
  //
  // Only hydrates when `?step=` is present, i.e. an explicit deep link into a
  // question. A bare `/find?role=…` is a new search and must start clean — that
  // is the owner's rule about return visits, and it is why this cannot simply
  // always restore.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || stepFromUrl === null) return;
    hydrated.current = true;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/finder/answers', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { answers?: Partial<FinderAnswers> | null };
        if (cancelled || !json.answers) return;
        // Merged rather than replaced: whatever the visitor has already changed
        // on this screen wins over the stored copy.
        setAnswers(prev => ({ ...prev, ...json.answers, ...pickAnswered(prev) }));
      } catch {
        // Nothing stored, or the endpoint is unavailable. The chip still opens
        // the right question; the visitor just re-answers the others.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stepFromUrl]);

  // Subject options for the chosen level. Fetched when the subject step is
  // reached rather than on mount, so a parent typing a child's name is not
  // waiting on a request they may not need yet.
  //
  // The level now travels as a query param. It used to be read from the profile
  // server-side, which cannot work for a visitor who has no profile — and
  // sending it explicitly is also what makes the question honest: the options
  // reflect the answer just given, not an account fact that may differ.
  useEffect(() => {
    if (step !== STEP.SUBJECT) return;
    let cancelled = false;
    setSubjectOptions(null);
    setSubjectError(false);

    (async () => {
      try {
        const url = answers.level
          ? `/api/finder/subjects?level=${encodeURIComponent(answers.level)}`
          : '/api/finder/subjects';
        const res = await fetch(url);
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
  }, [step, retry, answers.level]);

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

  // Position in the sequence. `index === -1` means this is not a question — the
  // ROLE picker, or a hand-edited `?step=` — and the progress indicator is
  // hidden rather than showing a made-up position.
  const { index, total } = questionPosition(step, isParent);
  const isLastStep = index >= 0 && index === total - 1;
  const canGoBack = index > 0;

  // Sequence-driven, not `step + 1`. The steps are no longer contiguous
  // integers: LEVEL is -1 and SUBJECT is 0, so arithmetic would work by accident
  // here and break the next time a question is inserted.
  const advance = useCallback(() => {
    if (!answered || index < 0) return;
    trackClient(PRODUCT_EVENTS.FINDER_STEP, { step, value: null });
    goToStep(seq[index + 1]);
  }, [answered, index, seq, step, goToStep]);

  const goBack = useCallback(() => {
    if (index > 0) goToStep(seq[index - 1]);
  }, [index, seq, goToStep]);

  /**
   * Skip the whole questionnaire.
   *
   * Anonymous visitors go to /find/browse — the unfiltered catalogue. They used
   * to be sent to a dashboard, which for someone with no account is a bounce
   * straight to a login screen: the exact dead end this whole change exists to
   * remove. Someone who IS signed in has a dashboard worth returning to.
   */
  const skip = useCallback(() => {
    trackClient(PRODUCT_EVENTS.FINDER_SKIPPED, { step_reached: step });
    if (!isAuthenticated) {
      router.push(role ? `/find/browse?role=${role}` : '/find/browse');
      return;
    }
    router.push(isParent ? '/parent/dashboard' : '/student/dashboard');
  }, [step, router, isParent, isAuthenticated, role]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/finder/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // role and level are new on the wire. Pre-auth they are the only
          // identity and the only syllabus signal there is; the route falls back
          // to the profile for an authed run that omits them.
          role: role ?? (isParent ? 'parent' : 'student'),
          level: answers.level,
          // The profile's vocabulary, captured now because the map from
          // canonical -> profile is lossy for CAPE and this is the only moment
          // both are known. Null for CAPE, on purpose: signup asks which
          // sixth-form year rather than us guessing one.
          formLevelLabel: formLevelLabelFor(answers.level),
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
      // Anonymous runs land on the public results page; the token cookie the
      // route just set is what identifies them there. Authed runs go to their
      // permanent "my best matches" home inside the app chrome.
      if (!isAuthenticated) {
        router.push('/find/results');
        return;
      }
      router.push(isParent ? '/parent/matches' : '/student/matches');
    } catch {
      setSubmitError('We could not save your answers. Please try again.');
      setSubmitting(false);
    }
  }, [answers, submitting, router, isParent, isAuthenticated, role]);

  // ── step content ─────────────────────────────────────────────────────────
  let title = '';
  let subtitle: string | null = null;
  let body: React.ReactNode = null;

  if (step === STEP.ROLE) {
    // The picker, inline. Rendered here rather than redirecting to /start so a
    // campaign link carrying ?subject= keeps it — a redirect would drop every
    // param the visitor arrived with, and those params are the attribution this
    // feature exists to measure.
    title = 'What brings you to iTutor?';
    subtitle = 'Pick the one that sounds like you.';
    body = <RolePicker variant="inline" searchParams={searchParams} />;
  } else if (step === STEP.LEVEL) {
    title = isParent ? `Which year is ${who} in?` : 'Which year are you in?';
    subtitle = "We'll only show classes that teach your syllabus.";
    body = (
      <div className="mt-6 space-y-2">
        {QUESTIONNAIRE_LEVELS.map(level => (
          <OptionRow
            key={level.value}
            label={FINDER_LEVEL_LABELS[level.value]}
            selected={answers.level === level.value}
            onSelect={() => setAnswers(a => ({ ...a, level: level.value }))}
          />
        ))}
      </div>
    );
  } else if (step === STEP.CHILD) {
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
    // No longer "from your account" — the level is the visitor's own answer from
    // the previous screen. Saying otherwise was true when the level came off the
    // profile and is a plain lie now.
    subtitle = answers.level
      ? `${FINDER_LEVEL_LABELS[answers.level]} subjects. Search if you don't see it.`
      : 'Pick the subject you want a class in.';
    const savedShown = filtered(saved);
    const restShown = filtered(rest);
    body = (
      <div className="mt-6 space-y-3">
        {/* The level is one tap behind this list and decides what is in it, so a
            mis-tap on the previous screen otherwise looks like "we teach nothing
            for my child". Only offered when the wizard asked — for an authed run
            the level comes from the account and is changed in settings. */}
        {answers.level && !isAuthenticated ? (
          <button
            type="button"
            onClick={() => goToStep(STEP.LEVEL)}
            className="text-[13px] font-semibold text-brand-deep underline underline-offset-2"
          >
            Not {FINDER_LEVEL_LABELS[answers.level]}? Change year
          </button>
        ) : null}

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

  const showProgress = index >= 0;

  return (
    <main className="flex min-h-screen bg-white">
      {/*
        THREE ROWS, NOT ONE. The aside used to be nothing but FinderArt. It now
        owns the panel and FinderArt is one row of it, because the skip and
        log-in controls have to live "under the icons" and cannot live INSIDE
        FinderArt: that component's root is aria-hidden, and it is rendered a
        second time as the clipped h-32 mobile strip below — so a control placed
        inside would be invisible to assistive tech and also produce a phantom,
        off-screen tab stop on every phone.

        The gradient moved here from FinderArt's root. Leaving it there as well
        would paint a gradient inside a gradient with a visible seam where two
        `from-mint` edges meet at the flex boundary.
      */}
      <aside className="sticky top-0 hidden h-screen w-[42%] shrink-0 flex-col bg-gradient-to-br from-mint via-brand-soft to-mint lg:flex">
        {/*
          min-h-0 is load-bearing. Without it a flex child containing an h-full
          element refuses to shrink below its content height, and the controls
          row is pushed off the bottom of a short viewport — a 1366x667 laptop,
          which is exactly the machine this gets demoed on.
        */}
        <div className="min-h-0 flex-1">
          <FinderArt step={step} answered={answered} />
        </div>
        <div className="shrink-0 px-8 pb-10">
          <FinderExitControls variant="rail" onSkip={skip} isAuthenticated={isAuthenticated} />
        </div>
      </aside>

      <div className="flex w-full flex-1 justify-center px-4 pb-16 pt-6 lg:items-center lg:px-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between gap-3">
            {canGoBack ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back to the previous question"
                className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:bg-mint"
              >
                <ArrowLeft className="size-4" />
              </button>
            ) : (
              // invisible, not hidden, on desktop: the slot has to stay so the
              // right-hand cluster keeps its position.
              <Link
                href="/"
                aria-label="iTutor home"
                className="text-[15px] font-semibold tracking-tight text-ink lg:invisible"
              >
                iTutor
              </Link>
            )}

            {/* Desktop's copy of these lives in the rail. Mobile has no aside, so
                they sit here — top-right, on every step, which is the only place
                that survives the soft keyboard on the two text-input steps. */}
            <div className="lg:hidden">
              <FinderExitControls variant="header" onSkip={skip} isAuthenticated={isAuthenticated} />
            </div>
          </div>

          {showProgress ? (
            <>
              <div className="mt-5 flex gap-1.5" aria-hidden>
                {Array.from({ length: total }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i <= index ? 'bg-brand' : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-muted">
                Question {index + 1} of {total}
                {index === 0 ? ' · about a minute' : ''}
              </p>
            </>
          ) : null}

          {/*
            tabIndex + focus on step change. Pressing Continue re-renders the
            button and destroys focus, so a keyboard or screen-reader user was
            silently returned to the top of the document on every question. Moving
            focus to the heading announces the new question instead.
          */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-6 text-[26px] font-semibold leading-tight tracking-tight text-ink outline-none sm:text-[28px]"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-[14px] leading-snug text-ink-muted">{subtitle}</p>
          ) : null}

          {body}

          {/* Art on mobile, where the aside is hidden. `compact` because this box
              is h-32 and FinderArt's full layout (p-8 + a size-32 tile + an mt-8
              caption) overflows it — the caption has been clipped and invisible
              on every phone since this strip was added. The gradient lives on
              the wrapper now, matching the aside. */}
          <div className="mt-6 h-32 overflow-hidden rounded-3xl bg-gradient-to-br from-mint via-brand-soft to-mint lg:hidden">
            <FinderArt step={step} answered={answered} compact />
          </div>

          {submitError ? (
            <p role="alert" className="mt-4 text-[14px] text-coral">
              {submitError}
            </p>
          ) : null}

          {/* The picker has no Continue — each choice is its own link. */}
          {step === STEP.ROLE ? null : (
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
          )}

          {firstName && index === 0 ? (
            <p className="mt-3 text-center text-[13px] text-ink-muted">
              Welcome, {firstName}. This takes about a minute.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
