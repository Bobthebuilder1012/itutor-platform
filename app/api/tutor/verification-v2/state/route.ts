// GET /api/tutor/verification-v2/state
// Everything the page needs to resume where the teacher left off. Refreshes the
// Stripe session result on the way, so returning from Stripe works without
// waiting for the webhook.

import { NextResponse } from 'next/server';
import { guardV2, loadState } from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Read-only, so a revoked teacher may load it to see their status.
  const g = await guardV2({ allowRevoked: true });
  if (g.error) return g.error;

  try {
    const state = await loadState(g.db, g.tutorId, g.profileStatus);
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[verification-v2/state] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not load your verification' }, { status: 500 });
  }
}
