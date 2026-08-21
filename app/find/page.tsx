/**
 * /find — the wizard's server entry.
 *
 * Two jobs, both of which have to happen on the server:
 *
 * 1. STAMP `finder_prompted_at` ON FIRST RENDER, not on completion. Written
 *    here rather than from the client because a family that abandons mid-wizard
 *    must not be re-forced on their next login — and a client-side write loses
 *    exactly the people who bounce, who are the ones the flag exists for.
 *
 * 2. Decide whether the incomplete-profile interstitial takes precedence.
 *    A student with no `form_level` is already bounced to /signup/complete-role
 *    by the dashboard; stacking the Finder on top of that would give them two
 *    interstitials in a row.
 */

import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import FinderWizard from '@/components/finder/FinderWizard';
import type { FinderEntryRoute, FinderTrigger } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

function entryRouteFor(trigger: string | undefined): FinderEntryRoute {
  if (trigger === 'signup' || trigger === 'login_backfill') return 'forced';
  if (trigger === 'email') return 'email';
  if (trigger === 'dashboard') return 'dashboard';
  return 'nav';
}

export default async function FindPage({
  searchParams,
}: {
  searchParams: { trigger?: string; subject?: string; step?: string };
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The layout already redirected an unauthenticated visitor; this is a
  // type-narrowing guard, not a second gate.
  if (!user) redirect('/signup?redirect=/find');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, form_level, finder_prompted_at, finder_completed_at')
    .eq('id', user.id)
    .maybeSingle();

  const row = (profile ?? null) as {
    role?: string | null;
    full_name?: string | null;
    form_level?: string | null;
    finder_prompted_at?: string | null;
    finder_completed_at?: string | null;
  } | null;

  const isParent = row?.role === 'parent';

  // Guard: never stack two interstitials. A student who still owes us a
  // form_level finishes that first.
  if (!isParent && !row?.form_level) {
    redirect('/signup/complete-role');
  }

  // Stamp the prompt once. Service client because `profiles` RLS does not let a
  // user write this column, and a silent failure here would re-force the wizard
  // on every login — the single most annoying possible bug in this feature.
  if (!row?.finder_prompted_at) {
    const { error } = await getServiceClient()
      .from('profiles')
      .update({ finder_prompted_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      console.error('[find] finder_prompted_at stamp failed:', error.message);
    }
  }

  const trigger = searchParams?.trigger;

  return (
    <FinderWizard
      isParent={isParent}
      firstName={(row?.full_name ?? '').split(' ')[0] || null}
      learnerLevel={row?.form_level ?? null}
      prefillSubject={searchParams?.subject ?? null}
      entryRoute={entryRouteFor(trigger)}
      trigger={
        trigger === 'signup' || trigger === 'login_backfill'
          ? (trigger as FinderTrigger)
          : null
      }
      alreadyCompleted={Boolean(row?.finder_completed_at)}
    />
  );
}
