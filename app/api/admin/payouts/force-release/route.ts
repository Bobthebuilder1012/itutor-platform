// POST /api/admin/payouts/force-release
//
// Immediately flips all owed (in-escrow) payout_ledger rows to
// release_ready, bypassing the normal 7-day grace window.
// Calls flip_owed_to_release_ready(0) — the same RPC the daily cron
// uses, but with 0 grace hours so everything qualifies.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const { data, error } = await (admin as any).rpc('flip_owed_to_release_ready', {
    p_grace_hours: 0,
  });

  if (error) {
    console.error('[POST /api/admin/payouts/force-release]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, released: data });
}
