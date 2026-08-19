/**
 * Class Match Week — the account step, as a pop-up.
 *
 * This used to redirect to /signup. That page is a dark full-width brand layout,
 * so a visitor coming off a green campaign screen landed on what looked like a
 * different product, at the moment they had just done the work and had the least
 * patience for it. It now renders the same account form in an overlay over the
 * campaign's own background, and offers LOG IN beside it — plenty of people
 * joining already have an account from a previous term (docs 03 §3.2), and
 * "create an account" is a dead end for them.
 *
 * Role still travels rather than being asked again: it was the questionnaire's
 * first question. Passing it to SignupCard skips its role step, which also
 * sidesteps the parent card being hidden behind PARENT_ACCOUNTS_ENABLED — the
 * picker is never rendered, so a parent from the campaign gets a parent account
 * regardless of the flag.
 *
 * Sits between the questionnaire and results. Who lands here:
 *  - Already authed → straight to results (carrying ?session= through). The
 *    submission is claimed onto the account at the first authed results load.
 *  - No cmw_token, or a token with no stored submission → back to the landing
 *    page; there is nothing to sign up FOR yet.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getSubmissionByToken } from '@/lib/classMatchWeek/portalData';
import CampaignAuthOverlay from '@/components/classMatchWeek/portal/CampaignAuthOverlay';

export const dynamic = 'force-dynamic';

export default async function ClassMatchWeekSignupPage({
  searchParams,
}: {
  searchParams: { session?: string | string[] };
}) {
  const rawSession = searchParams?.session;
  const sessionParam = typeof rawSession === 'string' && rawSession ? rawSession : null;
  const resultsPath = sessionParam
    ? `/class-match-week/results?session=${encodeURIComponent(sessionParam)}`
    : '/class-match-week/results';

  const authed = await getServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (user) redirect(resultsPath);

  const cookieStore = await cookies();
  const token = cookieStore.get('cmw_token')?.value;
  if (!token) redirect('/class-match-week');

  const submission = await getSubmissionByToken(getServiceClient(), token);
  if (!submission) redirect('/class-match-week');

  return (
    <main className="min-h-screen bg-mint-wash">
      <CampaignAuthOverlay role={submission.role} redirectTo={resultsPath} />
    </main>
  );
}
