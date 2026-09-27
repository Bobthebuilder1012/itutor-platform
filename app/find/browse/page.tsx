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
import ClassCard from '@/components/marketplace/ClassCard';
import { supplyRowToCard } from '@/lib/finder/cardData';
import PublicFinderShell from '@/components/finder/PublicFinderShell';
import { classHref } from '@/lib/finder/links';
import { STEP } from '@/lib/finder/wizard';

export const dynamic = 'force-dynamic';

/** Enough to browse, few enough to scan. */
const MAX_SHOWN = 24;

function roleFromParam(raw: string | undefined): 'student' | 'parent' {
  return raw === 'parent' ? 'parent' : 'student';
}

/**
 * The shell's top-bar search lands here. Name, tutor and subject, matched as a
 * plain substring — this filters a page of already-loaded supply rather than
 * pretending to be the marketplace's search, which has filters, facets and a
 * tutors tab this page deliberately does not.
 */
function matchesQuery(row: { name: string; tutorName: string | null; subject: string | null }, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [row.name, row.tutorName, row.subject].some(
    field => (field ?? '').toLowerCase().includes(needle)
  );
}

export default async function FinderBrowsePage({
  searchParams,
}: {
  searchParams: { role?: string; q?: string };
}) {
  if (!isFinderEnabled()) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center sm:px-6">
        <p className="text-[15px] text-ink-muted">This is not available right now.</p>
      </div>
    );
  }

  const role = roleFromParam(searchParams?.role);
  const query = (searchParams?.q ?? '').trim();
  const supply = await loadFinderSupply(getServiceClient());
  const filtered = supply.filter(row => matchesQuery(row, query));

  // Classes that can take someone, newest first. `seatsRemaining === null` means
  // "no stated capacity", which is most classes and is NOT the same as full — so
  // it sorts with the roomy ones rather than last.
  const ordered = [...filtered].sort((a, b) => {
    const seats = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
    const bySeats = seats(b.seatsRemaining) - seats(a.seatsRemaining);
    if (bySeats !== 0) return bySeats;
    return (b.tutorVerified ? 1 : 0) - (a.tutorVerified ? 1 : 0);
  });

  // Straight to the shared marketplace card — same component Explore renders,
  // so this page cannot drift into a poorer version of the same catalogue.
  const shown = ordered.slice(0, MAX_SHOWN);

  return (
    // Exactly Explore's content container. The wordmark-and-Log-in row that used
    // to open this page is the shell's now — see PublicFinderShell — and the
    // padding comes from its <main>, so neither is repeated here.
    <PublicFinderShell role={role} returnTo={`/find/browse?role=${role}`}>
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        {/* NEVER "no matches" or "nothing found" when nothing was ASKED for —
            describing an unfiltered list as an empty result would invent a
            disappointment. A search IS a question, though, so once one has been
            typed the copy says what was searched for and what came back. */}
        <h1 className="text-2xl font-bold text-ink lg:text-3xl">
          {query ? `Classes matching “${query}”` : 'Every class on iTutor right now'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {query ? (
            <>
              {shown.length === 1 ? '1 class' : `${shown.length} classes`} matched.{' '}
              <Link href={`/find/browse?role=${role}`} className="font-semibold text-brand-deep underline underline-offset-2">
                Clear the search
              </Link>
            </>
          ) : (
            <>
              You skipped the questions, so nothing is filtered out.{' '}
              {shown.length === 1 ? '1 class is' : `${shown.length} classes are`} open.
            </>
          )}
        </p>
      </header>

      {/* ABOVE the list, not below it. Someone who skipped is browsing, and the
          offer to narrow is the most useful thing on the screen — at the bottom
          of twenty-four cards it does not exist. */}
      <section className="rounded-2xl border border-brand/30 bg-brand-soft/40 p-5">
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
        <p className="rounded-2xl border border-border bg-white px-4 py-5 text-[14px] text-ink-muted">
          {query
            ? 'Nothing matched that search. Try a subject, a class name or a teacher’s name — or clear it to see everything.'
            : 'No classes are open at the moment. Answer the questions above and we’ll tell you the moment one opens that fits.'}
        </p>
      ) : (
        // Grid, not a stacked list — matching Explore's own lesson grid.
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="All classes">
          {shown.map((supplyRow) => (
            <ClassCard
              key={supplyRow.groupId}
              l={supplyRowToCard(supplyRow)}
              // Everyone on this page is logged out — the whole route exists
              // for a visitor with no account — so View class always asks for
              // one first. Same rule as /find/results; lib/finder/links.ts.
              href={classHref(supplyRow.groupId, role, true)}
            />
          ))}
        </section>
      )}
    </div>
    </PublicFinderShell>
  );
}
