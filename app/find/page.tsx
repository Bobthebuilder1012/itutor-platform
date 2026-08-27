/**
 * /find — the wizard's server entry.
 *
 * NO LONGER REQUIRES AN ACCOUNT. Every profile read below is now conditional on
 * there being a session, and none of them is load-bearing: an anonymous visitor
 * gets the wizard with the role from `?role=`, no saved subjects, and the level
 * asked as a question instead of read off `profiles.form_level`.
 *
 * The one job that still has to happen on the server, and only for an authed
 * visitor: STAMP `finder_prompted_at` ON FIRST RENDER, not on completion. A
 * family that abandons mid-wizard must not be re-forced on their next login, and
 * a client-side write loses exactly the people who bounce — who are the ones the
 * flag exists for. For an ANONYMOUS visitor there is no profile to stamp, so
 * lib/finder/claim.ts does it at adoption time instead; without that the login
 * backfill would re-ask every question a week after they answered it.
 *
 * It does NOT gate on `form_level`, and now cannot: the wizard asks for the level
 * itself. That sequencing belongs on the login path, which does it correctly.
 */

import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { normaliseLearnerLevel, type CanonicalLevel } from '@/lib/matching/levels';
import FinderWizard from '@/components/finder/FinderWizard';
import type { FinderEntryRoute, FinderTrigger } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

function entryRouteFor(trigger: string | undefined): FinderEntryRoute {
  if (trigger === 'signup' || trigger === 'login_backfill') return 'forced';
  if (trigger === 'email') return 'email';
  if (trigger === 'dashboard') return 'dashboard';
  return 'nav';
}

/** `?role=` is visitor-supplied, so it is validated rather than cast. */
function roleFromParam(raw: string | undefined): 'student' | 'parent' | null {
  return raw === 'student' || raw === 'parent' ? raw : null;
}

export default async function FindPage({
  searchParams,
}: {
  searchParams: { trigger?: string; subject?: string; step?: string; role?: string };
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = Boolean(user);

  let accountRole: 'student' | 'parent' | null = null;
  let firstName: string | null = null;
  let profileLevel: CanonicalLevel | null = null;
  let savedSubjects: string[] = [];

  if (user) {
    // TWO SELECTS, NOT ONE, AND THE SPLIT IS LOAD-BEARING.
    //
    // A missing column fails the WHOLE PostgREST select, and migration 238 is
    // what adds finder_prompted_at / finder_completed_at. Asking for them
    // alongside role/form_level meant that on any database where 238 had not
    // been applied, the entire read returned null — which this page read as "no
    // profile, therefore no form_level" and bounced to /signup/complete-role.
    // That page then sees a complete profile and forwards to the dashboard, so
    // clicking "Find your iTutor" silently round-tripped straight back home.
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

    accountRole = row?.role === 'parent' ? 'parent' : row?.role === 'student' ? 'student' : null;
    firstName = (row?.full_name ?? '').split(' ')[0] || null;

    // Resolved through the normalisation layer so an unrecognised `form_level`
    // reads as "unknown" and the wizard asks, rather than being shown raw.
    profileLevel = normaliseLearnerLevel(row?.form_level ?? null);

    // Subjects already on the account, so the first question can show what we
    // already know instead of starting cold. Best-effort: a failure here costs
    // the "You study this" badge, not the wizard.
    //
    // Empty for an anonymous visitor by construction, which is the correct
    // degradation — the badge and its divider simply do not render.
    const { data: subjectRows, error: subjectErr } = await supabase
      .from('user_subjects')
      .select('subjects(name)')
      .eq('user_id', user.id);
    if (subjectErr) {
      console.error('[find] saved subjects read failed:', subjectErr.message);
    }
    savedSubjects = ((subjectRows ?? []) as Array<{ subjects?: { name?: string | null } | null }>)
      .map(r => r.subjects?.name ?? '')
      .filter(Boolean);

    // Finder state. Unreadable columns mean 238 has not been applied yet; the
    // wizard still renders, it simply cannot remember that it prompted.
    const { data: finderState, error: finderStateError } = await supabase
      .from('profiles')
      .select('finder_prompted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (finderStateError) {
      console.error(
        '[find] finder state unreadable — is migration 238 applied?',
        finderStateError.message
      );
    } else {
      const promptedAt =
        (finderState as { finder_prompted_at?: string | null } | null)?.finder_prompted_at ?? null;

      // Stamp the prompt on first render rather than on completion. Service
      // client because `profiles` RLS does not let a user write this column.
      if (!promptedAt) {
        const { error } = await getServiceClient()
          .from('profiles')
          .update({ finder_prompted_at: new Date().toISOString() })
          .eq('id', user.id);
        if (error) {
          console.error('[find] finder_prompted_at stamp failed:', error.message);
        }
      }
    }
  }

  // THE ACCOUNT WINS OVER THE URL. `?role=` is how an anonymous visitor's choice
  // travels, but an authed parent must not be able to land in the student flow —
  // with different copy, a different results destination and a missing child
  // question — by editing a query string.
  const role = accountRole ?? roleFromParam(searchParams?.role);

  const trigger = searchParams?.trigger;

  return (
    <FinderWizard
      isParent={role === 'parent'}
      role={role}
      isAuthenticated={isAuthenticated}
      firstName={firstName}
      profileLevel={profileLevel}
      savedSubjects={savedSubjects}
      prefillSubject={searchParams?.subject ?? null}
      entryRoute={entryRouteFor(trigger)}
      trigger={
        trigger === 'signup' || trigger === 'login_backfill'
          ? (trigger as FinderTrigger)
          : null
      }
    />
  );
}
