// POST /api/tutor/verification-v2/consent   { accepted: true }
// Step 1. Stores the consent timestamp. Creates the teacher's v2 row.

import { schemaNotReady } from '@/lib/verificationV2/schemaReady';
import { NextRequest, NextResponse } from 'next/server';
import { CONSENT_VERSION } from '@/lib/verificationV2/constants';
import { blocked, guardV2, isEditable, loadRow } from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const g = await guardV2();
  if (g.error) return g.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return blocked('Invalid request', 400);
  }
  if (body?.accepted !== true) return blocked('You must accept to continue', 400);

  try {
    const row = await loadRow(g.db, g.tutorId);
    if (!isEditable(row)) return blocked('Your submission is locked while it is reviewed');
    // Already consented to this wording: keep the original timestamp.
    if (row?.consent_at && row.consent_version === CONSENT_VERSION) {
      return NextResponse.json({ ok: true, consentAt: row.consent_at });
    }

    const consentAt = new Date().toISOString();
    const { error } = await g.db
      .from('tutor_verification_v2')
      .upsert(
        { tutor_id: g.tutorId, consent_at: consentAt, consent_version: CONSENT_VERSION },
        { onConflict: 'tutor_id' }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true, consentAt });
  } catch (err) {
    const setup = schemaNotReady(err);
    if (setup) return setup;
    console.error('[verification-v2/consent] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not save your consent' }, { status: 500 });
  }
}
