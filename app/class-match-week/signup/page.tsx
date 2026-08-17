/**
 * Class Match Week — account creation handoff.
 *
 * This page creates no account and renders no form. It hands off to the
 * main-site signup at /signup, because account creation should be the same
 * experience everywhere: the same steps, the same Google button, the same
 * validation, and the same fixes when any of that changes.
 *
 * The one difference the campaign introduces is ORDER: role is the
 * questionnaire's first question, so it is already known here and travels as
 * `?role=`, which makes /signup skip its role step rather than ask again.
 * Usefully, that also sidesteps the parent card being hidden behind
 * PARENT_ACCOUNTS_ENABLED — the picker is never rendered, so a parent from the
 * campaign gets a parent account regardless of the flag.
 *
 * Sits between the questionnaire and results: the anonymous phase ends at Q5.
 * Who lands here:
 *  - Already authed → straight to results (carrying ?session= through). The
 *    submission is claimed onto the account at the first authed results load.
 *  - No cmw_token, or a token with no stored submission → back to the landing
 *    page; there is nothing to sign up FOR yet.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getSubmissionByToken } from '@/lib/classMatchWeek/portalData';

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

  redirect(
    `/signup?role=${submission.role}&redirect=${encodeURIComponent(resultsPath)}`
  );
}
