// POST /api/tutor/verification-v2/identity   { country: 'TT' | 'GY' | 'BB' | ... }
// Step 2. Starts (or continues, or falls back on) the teacher's identity check
// and returns the provider's hosted-flow URL.
//
// Provider-agnostic. WHICH provider is decided by config/identityRouting.ts (the
// teacher's document country, the fallback chain, the attempt cap) through
// lib/identity/start.ts. This route only does HTTP. Stored: the neutral result,
// the provider name and its session reference. Never an ID image, an ID number
// or a client secret.

import { NextRequest, NextResponse } from 'next/server';
import { startIdentityCheck } from '@/lib/identity/start';
import { blocked, guardV2, hasConsent, isEditable, loadRow } from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const g = await guardV2();
  if (g.error) return g.error;
  const { db, tutorId } = g;

  const body = await request.json().catch(() => ({}));
  const country: string | null = typeof body?.country === 'string' ? body.country : null;

  try {
    const row = await loadRow(db, tutorId);
    if (!hasConsent(row)) return blocked('Please accept the notice first', 409, { code: 'consent_required' });
    if (!isEditable(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const result = await startIdentityCheck({
      db,
      tutorId,
      row: row!,
      country,
      returnUrl: `${appUrl}/tutor/verification-v2?identity=return`,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code, ...(result.extra ?? {}) }, { status: result.httpStatus });
    }
    if (result.kind === 'redirect') return NextResponse.json({ url: result.url, status: 'pending' });
    return NextResponse.json({ status: result.kind });
  } catch (err) {
    console.error('[verification-v2/identity] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not start the identity check' }, { status: 500 });
  }
}
