/**
 * Class Match Week — "Complete your profile".
 *
 * Sits BETWEEN the questionnaire and results: the anonymous phase ends at Q5,
 * and everything from results onward requires an authenticated user. This
 * wrapper only decides who should see the form:
 *
 * - Already authed → straight to results (carrying ?session= through). The
 *   submission row is claimed onto the account at the first authed results
 *   load, not here.
 * - No cmw_token cookie, or a token with no stored submission → back to the
 *   campaign landing page; there is nothing to sign up FOR yet.
 *
 * Reads go through the service client — the visitor is anonymous and RLS
 * yields zero rows to anon, silently. Reading cookies() opts this route into
 * dynamic rendering; force-dynamic makes that explicit.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getSubmissionByToken } from '@/lib/classMatchWeek/portalData';
import CompleteProfile from '@/components/classMatchWeek/portal/CompleteProfile';

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

  return <CompleteProfile role={submission.role} sessionParam={sessionParam} />;
}
