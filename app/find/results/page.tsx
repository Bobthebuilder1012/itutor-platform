/**
 * /find/results — the matches, for a visitor who may have no account.
 *
 * This route used to be a bare redirect into /student/matches or /parent/matches.
 * It is now the anonymous half of the results experience, and still redirects for
 * anyone signed in — so the two audiences see the same component in the place
 * that suits each: inside the app chrome with an account, standalone without one.
 *
 * WHY NOT REUSE /student/matches FOR BOTH. StudentShell renders the full student
 * sidebar and falls back to the literal name "Student" when useProfile() has no
 * user, so a logged-out visitor would be shown an account menu for an account
 * that does not exist. The results themselves are safe to render — they are a
 * SNAPSHOT stored on the run, not a live read through RLS — but the furniture
 * around them is not.
 *
 * It is also still the notify-me redirect target, so `?notify=` has to keep
 * working through both branches.
 */

import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { readFinderToken } from '@/lib/finder/token';
import { adoptFinderRunFromCookie } from '@/lib/finder/adoptFromCookie';
import MatchResults, { type FinderRequestRow } from '@/components/finder/MatchResults';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const BASE_COLUMNS =
  'id, level, availability_blocks, lesson_type, budget_max, match_class, near_miss_on, results, child_label, created_at, role, skipped';

/** delivery_pref lands in 243, which may not be applied. */
const SELECT_TIERS = [`${BASE_COLUMNS}, delivery_pref`, BASE_COLUMNS];

function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

export default async function FinderResultsPage({
  searchParams,
}: {
  searchParams: { notify?: string };
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const notify = searchParams?.notify;

  // ── Signed in: adopt, then hand over to the permanent home ────────────────
  // The adoption happens HERE as well as on the matches pages because this is
  // the page an anonymous visitor is standing on when they sign in — claiming
  // before the redirect means the run is already theirs by the time they arrive.
  if (user) {
    await adoptFinderRunFromCookie(user.id);

    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = (data as { role?: string | null } | null)?.role ?? null;
    const base = role === 'parent' ? '/parent/matches' : '/student/matches';
    redirect(notify ? `${base}?notify=${encodeURIComponent(notify)}` : base);
  }

  // ── Anonymous: read the run this browser's token names ────────────────────
  const token = await readFinderToken();
  if (!token) return <NoRun />;

  // Service client: an anonymous caller has no RLS identity, and the
  // authenticated policy is scoped to user_id — the column that is null here.
  // The token is the capability, and it is httpOnly so a page cannot forge one.
  const service = getServiceClient();

  let row: FinderRequestRow | null = null;
  for (const columns of SELECT_TIERS) {
    const { data, error } = await service
      .from('finder_requests')
      .select(columns)
      .eq('token', token)
      .maybeSingle();

    if (!error) {
      row = (data ?? null) as unknown as FinderRequestRow | null;
      break;
    }
    if (!isSchemaMismatch(error)) {
      console.error('[find/results] run read failed:', error.message);
      return <NoRun />;
    }
  }

  if (!row) return <NoRun />;

  const role = ((row as unknown as { role?: string }).role === 'parent'
    ? 'parent'
    : 'student') as 'student' | 'parent';

  return <MatchResults row={row} notify={notify} mode="anonymous" role={role} />;
}

/**
 * No token, or a token with nothing behind it — an expired cookie, a cleared
 * browser, or someone who opened the URL directly. An invitation rather than an
 * error: there is nothing wrong, they simply have not answered anything yet.
 */
function NoRun() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="text-[24px] font-semibold tracking-tight text-ink">
        Let&rsquo;s find your iTutor
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        Answer a few quick questions and we&rsquo;ll show you the classes that fit
        — no account needed.
      </p>
      <Link
        href="/start"
        className="mt-6 inline-flex rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110"
      >
        Start
      </Link>
    </div>
  );
}
