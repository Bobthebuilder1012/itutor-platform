/**
 * Class Match Week — the teacher's way in.
 *
 * Decision-only, like /class-match-week/signup next door: no form, no UI, one
 * redirect. The landing page's teacher card points here rather than straight at
 * /signup because the right destination depends on who is asking.
 *
 * Teachers are this campaign's binding constraint — docs 00 §1 counts eleven
 * eligible teachers against seven questionnaire levels, four of which have no
 * supply at all — so this path exists to turn a teacher who reads the landing
 * page into an account. It skips the questionnaire deliberately: that asks what
 * a learner wants to study, which is not a question a teacher can answer, and
 * /match coerces any unrecognised role to `parent`, so sending a teacher
 * through it would file them as a parent.
 *
 * Three ways to arrive:
 *
 *  - ANONYMOUS → /signup with role=tutor preset, landing on the teacher's
 *    campaign page once the account exists. Verification is not required to
 *    take part (docs 00 §1 — requiring it would cut supply to two teachers), so
 *    a brand-new account can opt in as soon as it has one published
 *    monthly-priced class.
 *
 *  - ALREADY A TUTOR → straight to that campaign page. Someone who is signed in
 *    as a teacher did not mean "create another account", and /signup would show
 *    them a dead form.
 *
 *  - SIGNED IN AS A STUDENT OR PARENT → back to the landing page, which says
 *    why. `profiles.role` is fixed once set, so this account cannot offer a
 *    class; returning them to an unchanged page would read as a broken button.
 */

import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Where a teacher's campaign work actually happens: opt-in and taster sessions.
 * The My Business tab, not the old /tutor/class-match-week route — that now only
 * redirects here, and sending someone through two hops costs a render.
 */
const TEACHER_HOME = '/tutor/classes?tab=class-match-week';

export default async function ClassMatchWeekTeachPage() {
  const authed = await getServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();

  if (!user) {
    redirect(`/signup?role=tutor&redirect=${encodeURIComponent(TEACHER_HOME)}`);
  }

  // Read the role with the service client, as the rest of the portal does. The
  // session is already verified, so this is a lookup of the caller's own row —
  // and it cannot come back empty because of an RLS policy, which matters here
  // because an unreadable role would misroute a real teacher to the notice.
  const { data: profile } = await getServiceClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'tutor') redirect(TEACHER_HOME);

  redirect('/class-match-week?teach=needs-teacher-account');
}
