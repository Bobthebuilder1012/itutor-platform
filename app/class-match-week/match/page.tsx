/**
 * Class Match Week — questionnaire wrapper.
 *
 * Thin server shell: reads the role picked on the landing page (asked once,
 * never re-asked), fetches the live campaign with the service client — the
 * visitor is anonymous and RLS silently returns nothing to anonymous reads —
 * and hands both to the client questionnaire.
 */

import { redirect } from 'next/navigation';
import { getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';
import Questionnaire from '@/components/classMatchWeek/portal/Questionnaire';
import type { SubmissionRole } from '@/lib/classMatchWeek/types';

export const dynamic = 'force-dynamic';

export default async function ClassMatchWeekMatchPage({
  searchParams,
}: {
  searchParams?: { role?: string };
}) {
  const role: SubmissionRole = searchParams?.role === 'student' ? 'student' : 'parent';

  const campaign = await getLiveCampaign(getServiceClient());
  if (!campaign) redirect('/class-match-week');

  return <Questionnaire role={role} campaign={campaign} />;
}
