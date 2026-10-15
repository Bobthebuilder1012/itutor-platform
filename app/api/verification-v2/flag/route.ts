// GET /api/verification-v2/flag  ->  { enabled: boolean }
// Lets client components (the nav links, the badges) learn the server-side
// VERIFICATION_V2_ENABLED flag without it being a NEXT_PUBLIC_ variable.
// Public on purpose: it returns one boolean and nothing else.

import { NextResponse } from 'next/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ enabled: isVerificationV2Enabled() }, { headers: { 'Cache-Control': 'no-store' } });
}
