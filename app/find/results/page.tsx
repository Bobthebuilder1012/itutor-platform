/**
 * /find/results — three mutually exclusive states: exact, near, none.
 *
 * Reads the LAST `finder_requests` row for this user and renders the snapshot it
 * stored, rather than re-running the matcher. Two reasons: the page is then
 * cheap and idempotent on refresh, and "what did we actually recommend" stays
 * answerable later, which it would not be if the answer were recomputed against
 * a catalogue that has since moved.
 *
 * Empty states are an invitation to act, not an apology — no "Sorry", no
 * "Unfortunately".
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { availabilityLabel } from '@/lib/finder/wizard';
import { nearMissButtonLabel, nearMissStep, type GatingDimension } from '@/lib/matching/finder';
import { levelLabel, type CanonicalLevel } from '@/lib/matching/levels';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import MatchCard, { type MatchCardData } from '@/components/finder/MatchCard';

export const dynamic = 'force-dynamic';

interface RequestRow {
  id: string;
  level: string | null;
  subject_id: string | null;
  availability_blocks: string[] | null;
  lesson_type: string | null;
  match_class: 'exact' | 'near' | 'none' | null;
  near_miss_on: string | null;
  results: MatchCardData[] | null;
  child_label: string | null;
}

/** Turn the chosen blocks into a phrase: "Saturday mornings or Sunday afternoons". */
function blocksPhrase(blocks: string[]): string {
  const labels = blocks.map(b => availabilityLabel(b as AvailabilityBlock).toLowerCase());
  if (labels.length === 0) return 'any time';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

export default async function FinderResultsPage({
  searchParams,
}: {
  searchParams: { notify?: string };
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signup?redirect=/find');

  // RLS on finder_requests is `user_id = auth.uid()`, so the user's own client
  // is the right reader here — no service client needed.
  const { data } = await supabase
    .from('finder_requests')
    .select(
      'id, level, subject_id, availability_blocks, lesson_type, match_class, near_miss_on, results, child_label'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = (data ?? null) as RequestRow | null;

  // Nobody has run the Finder on this account yet — send them to do it rather
  // than showing an empty results frame.
  if (!row) redirect('/find');

  const matches = Array.isArray(row.results) ? row.results : [];
  const blocks = row.availability_blocks ?? [];
  const learner = row.child_label?.trim() || null;
  const levelText = row.level ? levelLabel(row.level as CanonicalLevel) : null;

  const heading =
    row.match_class === 'exact'
      ? matches.length === 1
        ? 'One class fits what you asked for.'
        : `${matches.length} classes fit what you asked for.`
      : row.match_class === 'near'
        ? row.near_miss_on === 'budget'
          ? matches.length === 1
            ? 'One class fits, except for the price.'
            : `${matches.length} classes fit, except for the price.`
          : matches.length === 1
            ? 'One class fits, except for the time.'
            : `${matches.length} classes fit, except for the time.`
        : null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="mb-8 flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-tight text-itutor-white">iTutor</span>
        <Link
          href="/student/dashboard"
          className="text-[13px] text-itutor-muted underline decoration-itutor-muted/40 hover:text-itutor-white"
        >
          Skip for now
        </Link>
      </div>

      {row.match_class === 'none' ? (
        <>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-itutor-white sm:text-[28px]">
            {row.lesson_type === 'one_on_one'
              ? 'One-to-one matching is not open yet.'
              : `We don't have a class for this on ${blocksPhrase(blocks)} yet.`}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-itutor-muted">
            {row.lesson_type === 'one_on_one'
              ? 'We have recorded what you are looking for. Right now the Finder matches group classes only — browse those below, or we will tell you when one-to-one opens.'
              : 'We have recorded what you asked for. The moment a teacher opens a class that fits, we can tell you.'}
          </p>

          <div className="mt-8 space-y-3">
            {searchParams?.notify === 'ok' ? (
              // Confirming in place rather than re-offering the button: a CTA
              // that looks unchanged after a click reads as broken.
              <p className="rounded-xl border border-itutor-green/30 bg-itutor-green/10 px-4 py-3.5 text-[14px] text-itutor-white">
                We&apos;ll email you as soon as a class opens that fits.
              </p>
            ) : (
              <>
                <NotifyMe requestId={row.id} />
                {searchParams?.notify === 'failed' ? (
                  <p role="alert" className="text-[13px] text-coral">
                    That didn&apos;t save. Please try again.
                  </p>
                ) : null}
              </>
            )}
            <Link
              href="/student/explore"
              className="block text-[14px] text-itutor-green underline decoration-itutor-green/40 hover:decoration-itutor-green"
            >
              See what&apos;s available now
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-itutor-white sm:text-[28px]">
            {heading}
          </h1>
          {levelText ? (
            <p className="mt-2 text-[14px] text-itutor-muted">
              {learner ? `For ${learner} · ` : ''}
              {levelText} · {blocksPhrase(blocks)}
            </p>
          ) : null}

          <div className="mt-7 space-y-3">
            {matches.map((match, index) => (
              <MatchCard
                key={match.group_id}
                data={match}
                rank={index + 1}
                nearMissOn={
                  row.match_class === 'near' ? (row.near_miss_on as GatingDimension | null) : null
                }
                requestedBlocks={blocks}
              />
            ))}
          </div>

          <div className="mt-8 space-y-3 pb-2">
            {row.match_class === 'near' && row.near_miss_on ? (
              <Link
                href={`/find?step=${nearMissStep(row.near_miss_on as GatingDimension)}`}
                className="inline-flex rounded-full border border-itutor-border bg-itutor-card px-6 py-3 text-[15px] font-semibold text-itutor-white hover:border-itutor-green/40"
              >
                {nearMissButtonLabel(row.near_miss_on as GatingDimension)}
              </Link>
            ) : null}

            <p className="text-[14px] text-itutor-muted">
              Not quite right?{' '}
              <Link
                href="/find"
                className="text-itutor-green underline decoration-itutor-green/40 hover:decoration-itutor-green"
              >
                Change what you're looking for
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The no-match CTA. One click — the family is already signed in, so asking for
 * an email here would be asking for something we already have.
 */
function NotifyMe({ requestId }: { requestId: string }) {
  return (
    <form action="/api/finder/notify-me" method="post">
      <input type="hidden" name="request_id" value={requestId} />
      <button
        type="submit"
        className="w-full rounded-full bg-itutor-green px-6 py-3.5 text-[15px] font-semibold text-black hover:brightness-110 sm:w-auto"
      >
        Tell me when a class opens
      </button>
    </form>
  );
}
