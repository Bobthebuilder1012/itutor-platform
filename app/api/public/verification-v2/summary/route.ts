// GET /api/public/verification-v2/summary?ids=a,b,c   (at most 50)
// -> { summaries: { [tutorId]: { idChecked, credentialsReviewed, hasExtras } } }
//
// Public (class cards and the finder are used logged out). Only VERIFIED
// teachers appear in the map; everyone else is simply absent. 404 when the flag
// is off. See lib/verificationV2/publicView.ts for exactly what can be returned.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { loadPublicSummaries, MAX_SUMMARY_IDS } from '@/lib/verificationV2/publicView';
import type { Db } from '@/lib/verification/setStatus';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isVerificationV2Enabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ summaries: {} });
  if (ids.length > MAX_SUMMARY_IDS) {
    return NextResponse.json({ error: `At most ${MAX_SUMMARY_IDS} ids` }, { status: 400 });
  }

  try {
    const summaries = await loadPublicSummaries(getServiceClient() as Db, ids);
    return NextResponse.json({ summaries }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[public/verification-v2/summary]', (err as Error).message);
    return NextResponse.json({ error: 'Could not load' }, { status: 500 });
  }
}
