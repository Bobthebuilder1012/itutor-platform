/**
 * Class Match Week — questionnaire wrapper.
 *
 * Thin server shell: reads the role picked on the landing page (asked once,
 * never re-asked), fetches the live campaign with the service client — the
 * visitor is anonymous and RLS silently returns nothing to anonymous reads —
 * and hands both to the client questionnaire.
 *
 * ONE-TIME GATE. Anyone who has already finished is sent to their matches
 * instead of the form. Completion is checked twice because the two identities
 * can disagree: the `cmw_token` cookie is what the anonymous questionnaire
 * wrote, and the account is what survives a cleared cookie or a second device.
 * Either one being closed closes the form.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  getLiveCampaign,
  getSubmissionByToken,
  getSubmissionForUser,
} from '@/lib/classMatchWeek/portalData';
import Questionnaire from '@/components/classMatchWeek/portal/Questionnaire';
import type { SubmissionRole } from '@/lib/classMatchWeek/types';

export const dynamic = 'force-dynamic';

export default async function ClassMatchWeekMatchPage({
  searchParams,
}: {
  searchParams?: { role?: string };
}) {
  const role: SubmissionRole = searchParams?.role === 'student' ? 'student' : 'parent';

  const admin = getServiceClient();
  const campaign = await getLiveCampaign(admin);
  if (!campaign) redirect('/class-match-week');

  const token = (await cookies()).get('cmw_token')?.value;
  if (token) {
    const byToken = await getSubmissionByToken(admin, token);
    if (byToken?.completed_at) redirect('/class-match-week/results');
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const byUser = await getSubmissionForUser(admin, user.id);
    if (byUser?.completed_at) redirect('/class-match-week/results');
  }

  return <Questionnaire role={role} campaign={campaign} />;
}
