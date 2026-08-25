/**
 * /find — the wizard's server entry.
 *
 * One job that has to happen on the server: STAMP `finder_prompted_at` ON FIRST
 * RENDER, not on completion. Written here rather than from the client because a
 * family that abandons mid-wizard must not be re-forced on their next login, and
 * a client-side write loses exactly the people who bounce — who are the ones the
 * flag exists for.
 *
 * It does NOT gate on `form_level`. It used to, on the reasoning that two
 * interstitials must never stack — but /signup/complete-role only collects a
 * level while `role` is unset, so anyone with a role already set is forwarded
 * straight back out of it. That sequencing belongs on the login path (which does
 * it correctly) and not here, where the wizard asks for the level itself as its
 * very first question.
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

  // TWO SELECTS, NOT ONE, AND THE SPLIT IS LOAD-BEARING.
  //
  // A missing column fails the WHOLE PostgREST select, and migration 238 is what
  // adds finder_prompted_at / finder_completed_at. Asking for them alongside
  // role/form_level meant that on any database where 238 had not been applied,
  // the entire read returned null — which this page read as "no profile,
  // therefore no form_level" and bounced to /signup/complete-role. That page
  // then sees a perfectly complete profile and forwards to the dashboard, so
  // clicking "Find your iTutor" silently round-tripped straight back home.
  //
  // So the columns that have always existed are read on their own and are
  // load-bearing; the Finder's own columns are read separately and tolerated.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, form_level')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    // Never redirect on a failed read. A read failure says nothing about the
    // user's profile, and turning one into a redirect is what caused the loop.
    console.error('[find] profile read failed:', profileError.message);
  }

  const row = (profile ?? null) as {
    role?: string | null;
    full_name?: string | null;
    form_level?: string | null;
  } | null;

  const isParent = row?.role === 'parent';

  // NOTE: there is deliberately NO form_level gate here. The wizard's first
  // question is the level, so it needs nothing on the profile — and
  // /signup/complete-role only collects one while `role` is unset, so sending
  // someone there to acquire a level is a round trip that changes nothing. The
  // login path still sequences complete-role ahead of the Finder for genuinely
  // incomplete profiles, which is where that guard belongs.

  // Finder state. Unreadable columns mean 238 has not been applied yet; the
  // wizard still renders, it simply cannot remember that it prompted.
  let promptedAt: string | null = null;
  let completedAt: string | null = null;
  let finderColumnsExist = true;

  const { data: finderState, error: finderStateError } = await supabase
    .from('profiles')
    .select('finder_prompted_at, finder_completed_at')
    .eq('id', user.id)
    .maybeSingle();

  if (finderStateError) {
    finderColumnsExist = false;
    console.error(
      '[find] finder state unreadable — is migration 238 applied?',
      finderStateError.message
    );
  } else {
    const state = (finderState ?? null) as {
      finder_prompted_at?: string | null;
      finder_completed_at?: string | null;
    } | null;
    promptedAt = state?.finder_prompted_at ?? null;
    completedAt = state?.finder_completed_at ?? null;
  }

  // Stamp the prompt on first render rather than on completion — otherwise
  // anyone who abandons mid-wizard is re-forced on their next login. Service
  // client because `profiles` RLS does not let a user write this column.
  if (finderColumnsExist && !promptedAt) {
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
      alreadyCompleted={Boolean(completedAt)}
    />
  );
}
