/**
 * /find/browse — every listable class, unfiltered. Where Skip goes.
 *
 * WHY THIS EXISTS AT ALL. Skip used to push /student/dashboard, which for a
 * visitor with no account is a bounce straight to a login screen — the exact
 * dead end this whole change removes. And there is no working public browse page
 * to send them to instead: /classes and /search both read `groups` through the
 * BROWSER Supabase client, and the only SELECT policy on `groups` is
 * `TO authenticated`, so RLS empties them for an anonymous visitor with no error
 * at all. (/classes additionally filters `status = 'active'` where the real value
 * is 'PUBLISHED', so it is empty even signed in. Pre-existing, not fixed here.)
 *
 * WHY IT BYPASSES THE MATCHER. `matchFinderRequest` hard-filters on subject:
 * with no subject, `subjectNames` is empty, `subjectMatches` is false for every
 * candidate, and the verdict is 'none' with zero results. The fix is NOT to make
 * the matcher treat an empty subject list as "unconstrained" — that would mean a
 * REAL request whose subject failed to resolve silently turns into "show
 * everything", which is a wrong answer delivered with full confidence. So this
 * page loads supply directly and sorts it neutrally.
 *
 * AND WHY IT DOES NOT RANK. A score with no query behind it is a lie, and
 * MatchCard's whole premise is rendered facts rather than a generated claim.
 * The order is "classes that can actually take someone, newest first", which is
 * a statement about availability rather than about fit.
 *
 * NO finder_requests ROW AND NO demand_signals ROW. A skip states no preference,
 * so there is nothing to ledger; a row of nulls would poison the demand map that
 * teacher recruitment reads. The `finder_skipped` event still fires from the
 * wizard and carries the step they left on.
 */

import Link from 'next/link';
import { getServiceClient } from '@/lib/supabase/server';
import { loadFinderSupply } from '@/lib/finder/supply';
import { isFinderEnabled } from '@/lib/featureFlags/finder';
import { classAvailabilityBlocks } from '@/lib/matching/availability';
import MatchCard, { type MatchCardData } from '@/components/finder/MatchCard';
import { STEP } from '@/lib/finder/wizard';

export const dynamic = 'force-dynamic';

/** Enough to browse, few enough to scan. */
const MAX_SHOWN = 24;

function roleFromParam(raw: string | undefined): 'student' | 'parent' {
  return raw === 'parent' ? 'parent' : 'student';
}

export default async function FinderBrowsePage({
  searchParams,
}: {
  searchParams: { role?: string };
}) {
  if (!isFinderEnabled()) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center sm:px-6">
        <p className="text-[15px] text-ink-muted">This is not available right now.</p>
      </div>
    );
  }

  const role = roleFromParam(searchParams?.role);
  const supply = await loadFinderSupply(getServiceClient());

  // Classes that can take someone, newest first. `seatsRemaining === null` means
  // "no stated capacity", which is most classes and is NOT the same as full — so
  // it sorts with the roomy ones rather than last.
  const ordered = [...supply].sort((a, b) => {
    const seats = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
    const bySeats = seats(b.seatsRemaining) - seats(a.seatsRemaining);
    if (bySeats !== 0) return bySeats;
    return (b.tutorVerified ? 1 : 0) - (a.tutorVerified ? 1 : 0);
  });

  const shown: MatchCardData[] = ordered.slice(0, MAX_SHOWN).map((row, index) => ({
    group_id: row.groupId,
    rank: index + 1,
    blocks: classAvailabilityBlocks(row.scheduleEntries),
    // Nothing was asked, so nothing was missed. An empty array here is what
    // stops MatchCard rendering a "you asked for…" line about a question that
    // was never put.
    missed: [],
    name: row.name,
    tutor_name: row.tutorName,
    tutor_verified: row.tutorVerified,
    monthly_price: row.monthlyPrice,
    class_format: row.classFormat,
    region_name: row.regionName,
    seats_remaining: row.seatsRemaining,
    session_length_minutes: row.sessionLengthMinutes,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/"
          aria-label="iTutor home"
          className="text-[15px] font-semibold tracking-tight text-ink"
        >
          iTutor
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-border bg-white px-4 py-2 text-[14px] font-semibold text-ink transition hover:bg-mint"
        >
          Log in
        </Link>
      </div>

      <header>
        {/* NEVER "no matches" or "nothing found". Nothing was asked for, so
            nothing failed to match — describing this as an empty result would
            invent a disappointment. */}
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
          Every class on iTutor right now
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-muted">
          You skipped the questions, so nothing is filtered out.{' '}
          {shown.length === 1 ? '1 class is' : `${shown.length} classes are`} open.
        </p>
      </header>

      {/* ABOVE the list, not below it. Someone who skipped is browsing, and the
          offer to narrow is the most useful thing on the screen — at the bottom
          of twenty-four cards it does not exist. */}
      <section className="mt-6 rounded-2xl border border-brand/30 bg-brand-soft/40 p-5">
        <h2 className="text-[16px] font-semibold text-ink">Want a shortlist instead?</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          A few quick questions and we&rsquo;ll narrow this to the classes that fit
          your year, your timetable and your budget.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/find?role=${role}`}
            className="inline-flex rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110"
          >
            Answer the questions
          </Link>
        </div>

        {/* Unset chips, each opening the one question it names. This turns the
            skip screen into a way back INTO the questionnaire one answer at a
            time, which is a far better re-entry than "start over". */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: 'Any year', step: STEP.LEVEL },
            { label: 'Any time', step: STEP.AVAILABILITY },
            { label: 'Online or in person', step: STEP.DELIVERY },
            { label: 'Any budget', step: STEP.BUDGET },
          ].map(chip => (
            <Link
              key={chip.label}
              href={`/find?role=${role}&step=${chip.step}`}
              className="inline-flex items-center rounded-full border border-border bg-white px-3 py-1.5 text-[13px] text-ink-muted transition hover:border-brand/60 hover:text-ink"
            >
              {chip.label}
            </Link>
          ))}
        </div>
      </section>

      {shown.length === 0 ? (
        <p className="mt-7 rounded-2xl border border-border bg-white px-4 py-5 text-[14px] text-ink-muted">
          No classes are open at the moment. Answer the questions above and
          we&rsquo;ll tell you the moment one opens that fits.
        </p>
      ) : (
        <section className="mt-6 space-y-3" aria-label="All classes">
          {shown.map((match, index) => (
            <MatchCard
              key={match.group_id}
              data={match}
              rank={index + 1}
              // Nothing was asked, so there is no near miss to name.
              nearMissOn={null}
              requestedBlocks={[]}
            />
          ))}
        </section>
      )}
    </div>
  );
}
