// GET /api/admin/verification-v2/queue?status=IN_REVIEW|REVERIFICATION_REQUIRED|REJECTED|VERIFIED|REVOKED|IN_PROGRESS
// The v2 applications, oldest submission first, with just enough to pick one.
// No ID images exist in v2 (Stripe holds them), and none are returned.

import { NextRequest, NextResponse } from 'next/server';
import { guardAdminV2 } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

const STATUSES = ['IN_PROGRESS', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'REVOKED', 'REVERIFICATION_REQUIRED'];

export async function GET(request: NextRequest) {
  const g = await guardAdminV2();
  if (g.error) return g.error;

  const status = new URL(request.url).searchParams.get('status') ?? 'IN_REVIEW';
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
  }

  const { data: rows, error } = await g.db
    .from('tutor_verification_v2')
    .select('tutor_id, status, identity_status, submitted_at, decided_at, created_at')
    .eq('status', status)
    .order('submitted_at', { ascending: true })
    .limit(100);
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
