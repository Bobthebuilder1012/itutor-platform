/**
 * /student/matches — "My best matches".
 *
 * The permanent home of the Finder's answer, inside the normal student shell
 * (supplied by app/student/layout.tsx). The wizard is a one-time interstitial;
 * this is where its answers live afterwards and where filters get edited.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getLatestFinderRequest } from '@/lib/finder/latestRequest';
import { adoptFinderRunFromCookie } from '@/lib/finder/adoptFromCookie';
import MatchResults from '@/components/finder/MatchResults';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

export default async function StudentMatchesPage({
  searchParams,
}: {
  searchParams: { notify?: string };
}) {
  if (!isFinderEnabled()) redirect('/student/dashboard');

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/student/matches');

  // Belt and braces. /find/claim and the auth callback both claim already, but
  // this is where someone lands who reached an account by a path neither covers
  // — logging in from the nav, an email link, a second device. Idempotent, one
  // indexed read, and Class Match Week does the same on three pages for the same
  // reason: guessing the single correct moment to claim is how you end up wrong
  // on whichever path nobody tested.
  await adoptFinderRunFromCookie(user.id);

  const row = await getLatestFinderRequest(supabase, user.id);

  // Never run the Finder? Invite rather than redirect. A redirect into a forced
  // wizard from a page the student chose to open takes the choice away, and this
  // page is reachable from the dashboard card.
  if (!row) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">
          My best matches
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          Answer five quick questions and we will line up the classes that fit
          your subject, your timetable and your budget.
        </p>
        <Link
          href="/find?trigger=dashboard"
          className="mt-6 inline-flex rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110"
        >
          Find my iTutor
        </Link>
      </div>
    );
  }

  return <MatchResults row={row} notify={searchParams?.notify} />;
}
