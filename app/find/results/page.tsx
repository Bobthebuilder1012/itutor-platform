/**
 * /find/results — kept only as a redirect.
 *
 * The wizard used to end here. It now ends on "My best matches"
 * (/student/matches or /parent/matches), which lives inside the normal app
 * chrome and is where the answers are edited from then on — the Finder itself is
 * a one-time interstitial, so its output should not live at a URL that reads
 * like part of the interstitial.
 *
 * This route survives because it is already in the wild: browser history, a
 * back button pressed after signup, and the notify-me form's redirect target all
 * point at it. Redirecting is cheaper than a broken link.
 */

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function FinderResultsRedirect({
  searchParams,
}: {
  searchParams: { notify?: string };
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signup?redirect=/find');

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (data as { role?: string | null } | null)?.role ?? null;
  const base = role === 'parent' ? '/parent/matches' : '/student/matches';

  // Carry ?notify= through so the confirmation still lands after the POST.
  const notify = searchParams?.notify;
  redirect(notify ? `${base}?notify=${encodeURIComponent(notify)}` : base);
}
