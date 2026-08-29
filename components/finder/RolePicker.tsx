'use client';

/**
 * "What brings you to iTutor?" — the three-way fork at the front of everything.
 *
 * The Uber equivalent: Ride / Drive / Eats are one tap each, and the tap decides
 * which product you are in. Ours is not three products, it is one product with
 * three relationships to it, so the labels are first-person about the person
 * rather than nouns about the app — "Find a class for me", not "Student".
 *
 * ONE COMPONENT, TWO RENDER SITES. `/start` is the front door; `/find` renders
 * the same picker inline as its first screen when it arrives with no `?role=`.
 * A redirect from /find to /start would have been simpler and is wrong: it drops
 * every query param the visitor arrived with, and `?subject=` and the UTM params
 * are the attribution this whole feature exists to measure.
 *
 * THE TUTOR CARD IS A PEER, NOT A FOOTNOTE. Same size and shape as the other
 * two, below an "or" divider, in a different colour family — so the eye reads it
 * as a different kind of answer to the same question rather than a third flavour
 * of "find a class". It skips the questionnaire entirely: a tutor has no matches
 * to be shown, and their question is "how many students and how much", which a
 * questionnaire about someone's syllabus does not answer.
 *
 * ICON NOTE. `GraduationCap` for student is the only choice the two existing
 * pickers in this codebase agree on. `Users` for parent matches SignupCard.
 * `Presentation` for tutor is new, and deliberately so: SignupCard uses
 * `UserRound` for TUTOR while Class Match Week uses it for PARENT, and
 * inheriting that collision here would spread it to a third place.
 */

import Link from 'next/link';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import { ChevronRight, GraduationCap, Presentation, Users } from 'lucide-react';

interface Props {
  variant: 'page' | 'inline';
  /** Present on the inline variant so campaign params survive the choice. */
  searchParams?: ReadonlyURLSearchParams;
  /** False hides the parent card. See /start for why this is not cosmetic. */
  parentAccountsEnabled?: boolean;
}

function Card({
  href,
  title,
  detail,
  Icon,
  tone = 'brand',
}: {
  href: string;
  title: string;
  detail: string;
  Icon: typeof GraduationCap;
  tone?: 'brand' | 'coral';
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-3xl border border-border bg-white p-5 transition hover:border-brand hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <span
        aria-hidden
        className={`grid size-12 shrink-0 place-items-center rounded-2xl ${
          tone === 'coral' ? 'bg-coral/10 text-coral' : 'bg-brand-soft text-brand-deep'
        }`}
      >
        <Icon className="size-6" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-muted">{detail}</span>
      </span>
      {/* Three same-size bordered cards in a stack read as radio options. The
          chevron is what says "this navigates". */}
      <ChevronRight
        aria-hidden
        className="size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export default function RolePicker({
  variant,
  searchParams,
  parentAccountsEnabled = true,
}: Props) {
  /** Keep whatever the visitor arrived with, and add the role. */
  const findHref = (role: 'student' | 'parent') => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('role', role);
    // The step belongs to the previous screen; carrying it would drop the
    // visitor straight past the questions the role was needed for.
    params.delete('step');
    return `/find?${params.toString()}`;
  };

  return (
    <div className={variant === 'page' ? 'mt-8' : 'mt-6'}>
      <ul className="grid gap-3">
        <li>
          <Card
            href={findHref('student')}
            title="Find a class for me"
            detail="I'm the student"
            Icon={GraduationCap}
          />
        </li>
        {parentAccountsEnabled ? (
          <li>
            <Card
              href={findHref('parent')}
              title="Find a class for my child"
              detail="I'm a parent or guardian"
              Icon={Users}
            />
          </li>
        ) : null}
      </ul>

      {variant === 'page' ? (
        <>
          <div className="mt-4 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <ul className="mt-4 grid gap-3">
            <li>
              {/*
                `/signup?role=tutor`, NOT `/signup/tutor`. That route is a
                redirect that drops the query string, so it would land the tutor
                on the generic picker and ask "what brings you here?" again —
                one screen after they answered exactly that.
              */}
              <Card
                href="/signup?role=tutor"
                title="Teach on iTutor"
                detail="I want students"
                Icon={Presentation}
                tone="coral"
              />
            </li>
          </ul>
        </>
      ) : (
        // Inline, on /find: a tutor here has taken a wrong turn, so it is a text
        // link rather than a third card competing with the question.
        <p className="mt-5 text-[13px] text-ink-muted">
          Here to teach?{' '}
          <Link
            href="/signup?role=tutor"
            className="font-semibold text-brand-deep underline underline-offset-2"
          >
            Sign up as a tutor
          </Link>
        </p>
      )}
    </div>
  );
}
