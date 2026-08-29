/**
 * "My best matches" — the permanent home of a Finder run's result.
 *
 * ONE IMPLEMENTATION, THREE ENTRY POINTS. /student/matches and /parent/matches
 * render this, and /find/results redirects into whichever of the two fits the
 * role. The wizard is a one-time interstitial; the answers it collects live on
 * here, inside the normal app chrome, which is what makes them feel like part of
 * the account rather than the output of a form that has since closed.
 *
 * Renders the SNAPSHOT stored on the request rather than re-running the matcher.
 * The page is then cheap and idempotent on refresh, and "what did we actually
 * recommend" stays answerable later — which it would not be if the answer were
 * recomputed against a catalogue that has since moved.
 *
 * Server component: no interactivity of its own beyond links. The cards are
 * client components because they emit match_viewed.
 */

import Link from 'next/link';
import { Pencil } from 'lucide-react';
import {
  availabilityLabel,
  deliveryPrefLabel,
  nearMissStep,
  BUDGET_BANDS,
  LESSON_TYPES,
  STEP,
} from '@/lib/finder/wizard';
import { nearMissButtonLabel, type GatingDimension } from '@/lib/matching/finder';
import { levelLabel, type CanonicalLevel } from '@/lib/matching/levels';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import { classHref, signupThen } from '@/lib/finder/links';
import MatchCard, { type MatchCardData } from './MatchCard';

export interface FinderRequestRow {
  id: string;
  level: string | null;
  availability_blocks: string[] | null;
  lesson_type: string | null;
  delivery_pref: string | null;
  budget_max: number | string | null;
  match_class: 'exact' | 'near' | 'fallback' | 'none' | null;
  near_miss_on: string | null;
  results: MatchCardData[] | null;
  child_label: string | null;
  created_at: string | null;
}

/** Turn chosen blocks into a phrase: "Saturday mornings or Sunday afternoons". */
function blocksPhrase(blocks: string[]): string {
  const labels = blocks.map(b => availabilityLabel(b as AvailabilityBlock).toLowerCase());
  if (labels.length === 0) return 'any time';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

function budgetLabelFor(max: number | string | null): string {
  if (max === null || max === undefined) return 'No budget limit';
  const n = typeof max === 'number' ? max : Number(max);
  return BUDGET_BANDS.find(b => b.max === n)?.label ?? `Up to $${n} a month`;
}

/**
 * An answer, shown as a chip that links back to the step that set it.
 *
 * This is the "edit filters" affordance. Each chip is a link rather than one
 * blanket "start again", because the common case is changing exactly one thing —
 * and making someone re-answer five questions to widen a budget is how a person
 * decides not to bother.
 */
function FilterChip({
  label,
  step,
  base,
}: {
  label: string;
  step: number;
  /**
   * `/find?` for an account, `/find?role=…&` without one. A bare `/find?step=N`
   * anonymously has no role, and the wizard cannot label its questions without
   * one — so it would drop the visitor on the role picker instead of the
   * question the chip named.
   */
  base: string;
}) {
  // Same pill the marketplace's own FilterMenu renders once a filter is
  // APPLIED — border-brand, bg-brand-soft, text-forest — because every answer
  // here already has a value; there is no "not filtering" state to distinguish
  // it from. The pencil takes the place of FilterMenu's chevron: this pill
  // opens the wizard step directly rather than a dropdown.
  return (
    <Link
      href={`${base}step=${step}`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-brand bg-brand-soft px-3 py-2 text-sm font-medium text-forest transition hover:bg-brand-soft/70"
    >
      {label}
      <Pencil className="size-3.5" strokeWidth={2} />
    </Link>
  );
}

export default function MatchResults({
  row,
  notify,
  mode = 'account',
  role = 'student',
}: {
  row: FinderRequestRow;
  notify?: string;
  /**
   * 'anonymous' renders outside any app shell, for a visitor with no account.
   * It cannot be inferred from `row.user_id`: a claimed run viewed by a
   * logged-out browser would still read as owned.
   */
  mode?: 'account' | 'anonymous';
  role?: 'student' | 'parent';
}) {
  const isAnonymous = mode === 'anonymous';
  // Chips must carry the role forward when there is no account to infer it from.
  const findBase = isAnonymous ? `/find?role=${role}&` : '/find?';
  const matches = Array.isArray(row.results) ? row.results : [];
  const blocks = row.availability_blocks ?? [];
  const learner = row.child_label?.trim() || null;
  const levelText = row.level ? levelLabel(row.level as CanonicalLevel) : null;
  const lessonTypeText =
    LESSON_TYPES.find(t => t.value === row.lesson_type)?.label ?? null;

  const heading =
    row.match_class === 'exact'
      ? matches.length === 1
        ? 'One class fits what you asked for.'
        : `${matches.length} classes fit what you asked for.`
      : row.match_class === 'near'
        ? row.near_miss_on === 'budget'
          ? 'Everything fits except the price.'
          : row.near_miss_on === 'delivery'
            ? 'Everything fits except how it is taught.'
            : 'Everything fits except the time.'
        : row.match_class === 'fallback'
          ? // Honest framing. These matched the SUBJECT only, so they may be the
            // wrong year, day and price at once — calling them "close" would be a
            // claim the family disproves one click later.
            `Nothing matched exactly, but here is what we teach in this subject.`
          : null;

  // Exactly Explore's own content container — `max-w-6xl mx-auto space-y-6`,
  // with no padding of its own, because every shell that renders this supplies
  // it on <main>. All three entry points are now inside one: /student/matches
  // and /parent/matches through their layouts, and /find/results through
  // PublicFinderShell. The anonymous branch used to add px-4 py-8 because it
  // had no shell at all; keeping that here would have indented this screen
  // relative to the marketplace it sits beside.
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* The iTutor wordmark and Log in link that used to sit here are the
          shell's now — see PublicFinderShell. Rendering them again would put
          two log-in affordances on one screen. */}

      {/* Same header scale as Explore's own h1/subtitle — this is the same
          product handing off to that one, not a smaller-type prelude to it. */}
      <header>
        <h1 className="text-2xl font-bold text-ink lg:text-3xl">
          {learner ? `${learner}'s best matches` : 'My best matches'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {row.match_class === 'none'
            ? 'We have recorded what you are looking for.'
            : heading}
        </p>
      </header>

      {/* The answers, each editable in place. Same row shape as the
          marketplace's own filter row — see FilterChip for why every pill
          renders in its "applied" colour. */}
      <section aria-label="Your search">
        <div className="flex flex-wrap items-center gap-2">
          {/* THE LEVEL IS EDITABLE NOW. It used to be a static pill with a
              comment saying it "comes from the account, not the wizard, so it is
              changed in profile settings" — which stopped being true the moment
              the wizard started asking for it. Left as a pill it would be the
              one answer on the screen a family could see and not change, and the
              one most likely to be a mis-tap. */}
          {levelText ? <FilterChip label={levelText} step={STEP.LEVEL} base={findBase} /> : null}
          <FilterChip label={blocksPhrase(blocks)} step={STEP.AVAILABILITY} base={findBase} />
          {lessonTypeText ? (
            <FilterChip label={lessonTypeText} step={STEP.LESSON_TYPE} base={findBase} />
          ) : null}
          {/* Only rendered when the run actually answered it. A run from before
              migration 243 has no preference, and showing a default here would
              claim the family said something they were never asked. */}
          {row.delivery_pref ? (
            <FilterChip
              label={deliveryPrefLabel(row.delivery_pref)}
              step={STEP.DELIVERY}
              base={findBase}
            />
          ) : null}
          <FilterChip label={budgetLabelFor(row.budget_max)} step={STEP.BUDGET} base={findBase} />
        </div>
        <p className="mt-2.5 text-[13px] text-ink-muted">
          Tap anything above to change it, or{' '}
          <Link
            // A new search anonymously starts at the picker: the role is the one
            // answer that is not a chip, and a fresh search should be free to
            // change it. With an account the role is the account's.
            href={isAnonymous ? '/start' : '/find'}
            className="font-semibold text-brand-deep underline underline-offset-2"
          >
            start a new search
          </Link>
          .
        </p>
      </section>

      {row.match_class === 'none' ? (
        <section className="mt-7 rounded-2xl border border-border bg-white p-5">
          <h2 className="text-[16px] font-semibold text-ink">
            {row.lesson_type === 'one_on_one'
              ? 'One-to-one matching is not open yet.'
              : 'No class in this subject yet.'}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            {row.lesson_type === 'one_on_one'
              ? 'We have recorded what you are looking for. The Finder matches group classes for now — browse those below, or we will tell you when one-to-one opens.'
              : 'The moment a teacher opens a class that fits, we can tell you.'}
          </p>

          <div className="mt-5 space-y-3">
            {notify === 'ok' ? (
              // Confirming in place rather than re-offering the button: a CTA
              // that looks unchanged after a click reads as broken.
              <p className="rounded-xl border border-brand/30 bg-brand-soft/40 px-4 py-3 text-[14px] text-ink">
                We will email you as soon as a class opens that fits.
              </p>
            ) : isAnonymous ? (
              // NO ANONYMOUS OPT-IN BUTTON, on purpose. resolve-demand emails
              // from profiles.email, so recording an opt-in with no account
              // behind it is a promise the system cannot keep — ranked in the
              // demand map and never honoured. Asking for the account here is
              // the one place in this flow where it genuinely buys the visitor
              // something, so the copy says what it buys.
              <Link
                href={`${signupThen(role, '/find/results')}&intent=notify`}
                className="inline-flex rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110"
              >
                Create a free account and we&rsquo;ll email you
              </Link>
            ) : (
              <form action="/api/finder/notify-me" method="post">
                {/* Kept for the no-JS post, but no longer an authorisation input:
                    the route picks the row from the session and ignores this. */}
                <input type="hidden" name="request_id" value={row.id} />
                <button
                  type="submit"
                  className="w-full rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110 sm:w-auto"
                >
                  Tell me when a class opens
                </button>
              </form>
            )}
            {notify === 'failed' ? (
              <p role="alert" className="text-[13px] text-coral">
                That did not save. Please try again.
              </p>
            ) : null}

            {/* /student/find-tutors is authed-only, and there is no working public
                browse page — /classes and /search both read `groups` through the
                browser client, which RLS empties for an anonymous visitor. So
                anonymously this goes to the Finder's own unfiltered view. */}
            <Link
              href={isAnonymous ? `/find/browse?role=${role}` : '/student/find-tutors'}
              className="block text-[14px] font-semibold text-brand-deep underline underline-offset-2"
            >
              Browse everything available now
            </Link>
          </div>
        </section>
      ) : (
        <>
          {row.match_class === 'fallback' ? (
            <p className="mt-7 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[13px] leading-snug text-ink-muted">
              These are in the subject you picked but may not match your times,
              year, budget or how you wanted to learn. Widening one of the
              filters above usually helps.
            </p>
          ) : null}

          {/* Said once, quietly, above the list rather than on every card. Three
              cards each shouting "create an account to join" would make signup
              the loudest thing on the screen, which is the failure this whole
              change exists to fix. */}
          {isAnonymous ? (
            <p className="mt-5 text-[13px] text-ink-muted">
              These are yours. A free account saves them and lets you join a class.
            </p>
          ) : null}

          {/* Grid, not a stacked list — the same layout Explore uses for its
              own class cards, and the reason MatchCard was redrawn to that
              card's shape rather than a bordered list row. */}
          <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Recommended classes">
            {matches.map((match, index) => (
              <MatchCard
                key={match.group_id}
                data={match}
                // Anonymously View class asks for the account first and opens
                // the class on the other side of it. See lib/finder/links.ts.
                ctaHref={classHref(match.group_id, role, isAnonymous)}
                rank={index + 1}
                nearMissOn={
                  row.match_class === 'near'
                    ? (row.near_miss_on as GatingDimension | null)
                    : null
                }
                requestedBlocks={blocks}
              />
            ))}
          </section>

          {row.match_class === 'near' && row.near_miss_on ? (
            <div className="mt-6">
              <Link
                href={`${findBase}step=${nearMissStep(row.near_miss_on as GatingDimension)}`}
                className="inline-flex rounded-full border border-border bg-white px-6 py-3 text-[15px] font-semibold text-ink transition hover:border-brand/60 hover:bg-mint"
              >
                {nearMissButtonLabel(row.near_miss_on as GatingDimension)}
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
