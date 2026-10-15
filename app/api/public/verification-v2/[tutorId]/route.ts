// GET /api/public/verification-v2/[tutorId]
// The click-through panel's data: verified date, credentials, up to 3 extras.
// 404 for any teacher who is not VERIFIED (indistinguishable from "never applied")
// and when the flag is off. Public, explicit columns only.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { loadPublicDetail } from '@/lib/verificationV2/publicView';
import type { Db } from '@/lib/verification/setStatus';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { tutorId: string } }) {
  if (!isVerificationV2Enabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const detail = await loadPublicDetail(getServiceClient() as Db, params.tutorId);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[public/verification-v2/detail]', (err as Error).message);
    return NextResponse.json({ error: 'Could not load' }, { status: 500 });
  }
}
