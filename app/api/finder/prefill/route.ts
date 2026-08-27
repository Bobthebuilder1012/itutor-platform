// GET /api/finder/prefill — what this browser already told us, for signup.
//
// A visitor answers the questionnaire, sees their matches, and then creates an
// account. Signup's profile step asks for a year level they have already given
// one screen earlier. Asking the same question twice in the same sitting is the
// single most visible way this reordering can fail, so this route is how the
// answer travels.
//
// SEPARATE FROM /api/finder/answers ON PURPOSE. That route serves the WIZARD and
// returns the full answer set so a filter chip can repopulate the form. This one
// serves SIGNUP and returns only the three fields signup can act on. A signup
// form has no business being able to read someone's budget band, and a route
// that returns everything invites a caller to depend on it.
//
// Read by two clients, both of which are client components and therefore cannot
// read the httpOnly cookie themselves: SignupCard's profile step, and
// /signup/complete-role on the Google path.
//
// `form_level_label` is null for CAPE by construction — see formLevelLabelFor.
// Both `Lower 6` and `Upper 6` normalise to the same canonical level, so there
// is no inverse and a guess would invent a fact. Signup asks in that one case.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { readFinderToken } from '@/lib/finder/token';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

const EMPTY = { role: null, form_level_label: null, child_label: null };

export async function GET() {
  if (!isFinderEnabled()) return NextResponse.json(EMPTY);

  try {
    const token = await readFinderToken();

    // A session is not required, but if there is one it takes precedence: the
    // account's latest run beats whatever a stale cookie points at.
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !token) return NextResponse.json(EMPTY);

    // Service client: an anonymous caller has no RLS identity, and the
    // authenticated policy is scoped to user_id — null for the run in question.
    const service = getServiceClient();

    let query = service.from('finder_requests').select('role, form_level_label, child_label');
    query = user ? query.eq('user_id', user.id) : query.eq('token', token as string);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Most likely 247 is unapplied, so the columns do not exist yet. Not worth
      // surfacing: signup simply asks the question as it always did.
      console.warn('[finder/prefill] read failed:', error.message);
      return NextResponse.json(EMPTY);
    }

    const row = (data ?? null) as {
      role?: string | null;
      form_level_label?: string | null;
      child_label?: string | null;
    } | null;

    if (!row) return NextResponse.json(EMPTY);

    return NextResponse.json({
      role: row.role ?? null,
      form_level_label: row.form_level_label ?? null,
      child_label: row.child_label ?? null,
    });
  } catch (err) {
    console.error('[GET finder/prefill]', err);
    return NextResponse.json(EMPTY);
  }
}
