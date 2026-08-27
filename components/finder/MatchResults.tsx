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
function FilterChip({ label, step }: { label: string; step: number }) {
  return (
    <Link
      href={`/find?step=${step}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[13px] text-ink transition hover:border-brand/60 hover:bg-mint"
    >
      {label}
      <Pencil className="size-3 text-ink-muted" strokeWidth={2} />
    </Link>
  );
}

export default function MatchResults({
  row,
  notify,
}: {
  row: FinderRequestRow;
  notify?: string;
}) {
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
          {learner ? `${learner}'s best matches` : 'My best matches'}
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-muted">
          {row.match_class === 'none'
            ? 'We have recorded what you are looking for.'
            : heading}
        </p>
      </header>

      {/* The answers, each editable in place */}
      <section className="mt-5" aria-label="Your search">
        <div className="flex flex-wrap gap-2">
          {levelText ? (
            // The level is NOT editable here — it comes from the account, not the
            // wizard, so it is changed in profile settings. Rendering it as a
            // static pill keeps that distinction visible.
            <span className="inline-flex items-center rounded-full bg-mint px-3 py-1.5 text-[13px] font-medium text-brand-deep">
              {levelText}
            </span>
          ) : null}
          <FilterChip label={blocksPhrase(blocks)} step={STEP.AVAILABILITY} />
          {lessonTypeText ? (
            <FilterChip label={lessonTypeText} step={STEP.LESSON_TYPE} />
          ) : null}
          {/* Only rendered when the run actually answered it. A run from before
              migration 243 has no preference, and showing a default here would
              claim the family said something they were never asked. */}
          {row.delivery_pref ? (
            <FilterChip
              label={deliveryPrefLabel(row.delivery_pref)}
              step={STEP.DELIVERY}
            />
          ) : null}
          <FilterChip label={budgetLabelFor(row.budget_max)} step={STEP.BUDGET} />
        </div>
        <p className="mt-2.5 text-[13px] text-ink-muted">
          Tap anything above to change it, or{' '}
          <Link
            href="/find"
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
            ) : (
              <form action="/api/finder/notify-me" method="post">
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

            {/* /student/find-tutors, not /student/explore — the latter exists only
                as /student/explore/[groupId] and an index link 404s. */}
            <Link
              href="/student/find-tutors"
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

          <section className="mt-5 space-y-3" aria-label="Recommended classes">
            {matches.map((match, index) => (
              <MatchCard
                key={match.group_id}
                data={match}
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
                href={`/find?step=${nearMissStep(row.near_miss_on as GatingDimension)}`}
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
