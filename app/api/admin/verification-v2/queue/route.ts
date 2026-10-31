// GET /api/admin/verification-v2/queue?tab=review|waiting|done        (what the screen uses)
//   review   applications in review                      (needs an admin)
//   waiting  sent back, rejected, or asked to verify again (needs the teacher)
//   done     verified or revoked
// Also returns `counts` for the three tabs. Or ?status=IN_REVIEW|REVERIFICATION_REQUIRED|REJECTED|VERIFIED|REVOKED|IN_PROGRESS.
// The v2 applications, oldest submission first, with just enough to pick one.
// No ID images exist in v2 (the identity provider holds them), and none are returned.
// Also returns `setup`: which identity-provider settings are missing (names only).

import { NextRequest, NextResponse } from 'next/server';
import { guardAdminV2 } from '@/lib/verificationV2/adminGuard';
import { schemaNotReady } from '@/lib/verificationV2/schemaReady';
import { identitySetupProblems } from '@/lib/identity/configStatus';

export const dynamic = 'force-dynamic';

const STATUSES = ['IN_PROGRESS', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'REVOKED', 'REVERIFICATION_REQUIRED'];

type Row = { status: string; decision_reason?: string | null };
const TABS: Record<string, (r: Row) => boolean> = {
  review: (r) => r.status === 'IN_REVIEW',
  // A teacher who is merely part-way through the form is not "waiting": they were not asked for anything.
  waiting: (r) =>
    r.status === 'REJECTED' || r.status === 'REVERIFICATION_REQUIRED' || (r.status === 'IN_PROGRESS' && !!r.decision_reason),
  done: (r) => r.status === 'VERIFIED' || r.status === 'REVOKED',
};

export async function GET(request: NextRequest) {
  const g = await guardAdminV2();
  if (g.error) return g.error;

  const params = new URL(request.url).searchParams;
  const tab = params.get('tab');
  if (tab && !(tab in TABS)) return NextResponse.json({ error: 'Unknown tab' }, { status: 400 });
  const status = tab ?? params.get('status') ?? 'IN_REVIEW';
  if (!tab && !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
  }

  let rows: any[] | null;
  let error: any;
  let counts: Record<string, number> | undefined;
  if (tab) {
    const all = await g.db
      .from('tutor_verification_v2')
      .select('tutor_id, status, identity_status, submitted_at, decided_at, created_at, decision_reason')
      .in('status', STATUSES)
      .order('submitted_at', { ascending: true })
      .limit(1000);
    error = all.error;
    const list: any[] = all.data ?? [];
    counts = Object.fromEntries(Object.entries(TABS).map(([k, test]) => [k, list.filter(test).length]));
    rows = list.filter(TABS[tab]).slice(0, 100);
  } else {
    const one = await g.db
      .from('tutor_verification_v2')
      .select('tutor_id, status, identity_status, submitted_at, decided_at, created_at')
      .eq('status', status)
      .order('submitted_at', { ascending: true })
      .limit(100);
    rows = one.data;
    error = one.error;
  }
  const setup = schemaNotReady(error);
  if (setup) return setup;
  if (error) {
    console.error('[admin/verification-v2/queue]', error.message);
    return NextResponse.json({ error: 'Could not load the queue' }, { status: 500 });
  }

  const ids = (rows ?? []).map((r: any) => r.tutor_id);
  const names: Record<string, { name: string | null; email: string | null }> = {};
  const credCount: Record<string, number> = {};
  const extraCount: Record<string, number> = {};

  if (ids.length > 0) {
    const [profiles, creds, extras] = await Promise.all([
      g.db.from('profiles').select('id, full_name, display_name, email').in('id', ids),
      g.db.from('tutor_credentials_v2').select('tutor_id').in('tutor_id', ids),
      g.db.from('tutor_extras_v2').select('tutor_id').in('tutor_id', ids),
    ]);
    for (const p of profiles.data ?? []) names[p.id] = { name: p.display_name || p.full_name, email: p.email };
    for (const c of creds.data ?? []) credCount[c.tutor_id] = (credCount[c.tutor_id] ?? 0) + 1;
    for (const e of extras.data ?? []) extraCount[e.tutor_id] = (extraCount[e.tutor_id] ?? 0) + 1;
  }

  return NextResponse.json({
    status,
    ...(counts ? { counts } : {}),
    setup: identitySetupProblems(),
    items: (rows ?? []).map((r: any) => ({
      tutorId: r.tutor_id,
      name: names[r.tutor_id]?.name ?? null,
      email: names[r.tutor_id]?.email ?? null,
      status: r.status,
      identityStatus: r.identity_status,
      submittedAt: r.submitted_at,
      decidedAt: r.decided_at,
      credentialCount: credCount[r.tutor_id] ?? 0,
      extraCount: extraCount[r.tutor_id] ?? 0,
    })),
  });
}
