// POST /api/tutor/verification-v2/submit
// Moves the submission to IN_REVIEW. That is all: no approval, no email, no
// notification, and profiles.tutor_verification_status is not touched.
// Needs consent, a verified identity and at least one credential, all checked
// here from saved data, not from anything the browser claims.

import { NextResponse } from 'next/server';
import { setV2Status, statusErrorResponse } from '@/lib/verification/setStatus';
import {
  blocked,
  guardV2,
  hasConsent,
  hasIdentity,
  isEditable,
  loadCredentials,
  loadRow,
} from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const g = await guardV2();
  if (g.error) return g.error;
  const { db, tutorId } = g;

  try {
    const row = await loadRow(db, tutorId);
    if (!isEditable(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });
    if (!hasConsent(row)) return blocked('Please accept the notice first', 409, { code: 'consent_required' });
    if (!hasIdentity(row)) return blocked('Complete the identity check first', 409, { code: 'identity_required' });
    if ((await loadCredentials(db, tutorId)).length === 0) {
      return blocked('Add at least one credential first', 409, { code: 'credentials_required' });
    }

    // Through the one status function: allowed from IN_PROGRESS or REJECTED only,
    // and conditional on the status just read, so a double click cannot submit twice.
    const submitted = await setV2Status({ tutorId, to: 'IN_REVIEW', actor: 'tutor', db });
    if (!submitted.ok) return statusErrorResponse(submitted);

    return NextResponse.json({ ok: true, status: 'IN_REVIEW' });
  } catch (err) {
    console.error('[verification-v2/submit] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not submit' }, { status: 500 });
  }
}
