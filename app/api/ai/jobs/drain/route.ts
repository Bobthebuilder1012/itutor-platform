/**
 * Run the worker on demand.
 *
 * ── A deliberate, signed-off exception to rule 1 ────────────────────────────
 *
 * Rule 1 says no model call happens inside a request handler. This route breaks
 * that, knowingly, because the alternative is that generation cannot work at
 * all outside production: Vercel triggers cron jobs only for production
 * deployments, so on any preview URL a QUEUED job sits there forever with
 * nothing to pick it up.
 *
 * What the rule was protecting is preserved. The page does not wait on this —
 * the browser fires it and forgets, then polls `/api/ai/jobs/{id}` for the
 * result — so no user-facing request is ever blocked on a provider. What is
 * lost is the guarantee that a slow provider cannot occupy a function slot,
 * which is a capacity concern rather than a correctness one.
 *
 * In production the cron remains the real executor and this route is a
 * redundant nudge. If that ever stops being true, this is the first thing to
 * re-examine.
 *
 * Scoped to the caller's own jobs by way of the shared claim RPC — the worker
 * claims oldest-first across all users, which is fine here because a signed-in
 * tutor draining the queue helps whoever is next in it too.
 */
import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { processAiJobs } from '@/lib/services/aiJobService';
import { isAiProviderConfigured } from '@/lib/ai/provider';

// Registering the handlers is a side effect of this import.
import '@/lib/ai/handlers';

export const dynamic = 'force-dynamic';

/** Model calls are slow; the default function timeout would cut a batch short. */
export const maxDuration = 300;

export async function POST() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in only. An open endpoint that runs model calls is an open endpoint
  // that spends money.
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAiProviderConfigured()) {
    return NextResponse.json(
      { error: 'iTutor AI is not switched on in this environment yet.', code: 'PROVIDER_UNCONFIGURED' },
      { status: 503 }
    );
  }

  try {
    const summary = await processAiJobs();
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('[ai/jobs/drain] failed:', error);
    return NextResponse.json({ error: 'Worker failed' }, { status: 500 });
  }
}
