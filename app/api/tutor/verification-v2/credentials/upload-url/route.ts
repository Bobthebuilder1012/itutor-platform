// POST /api/tutor/verification-v2/credentials/upload-url
//   { contentType: 'application/pdf'|'image/jpeg'|'image/png', size: number }
// Returns a one-use signed upload URL for {tutor_id}/{uuid}.{ext} in the private
// tutor-credential-proofs bucket. The file goes straight from the browser to
// Storage. The filename is never part of the path.

import { schemaNotReady } from '@/lib/verificationV2/schemaReady';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { PROOF_BUCKET } from '@/lib/verificationV2/constants';
import { validateUploadRequest } from '@/lib/verificationV2/validation';
import { blocked, guardV2, identityStepDone, isEditable, isVerifiedTeacher, loadRow } from '@/lib/verificationV2/server';

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

  const check = validateUploadRequest(body);
  if (!check.ok) return blocked(check.error, 400);

  try {
    const row = await loadRow(g.db, g.tutorId);
    if (!isEditable(row) && !isVerifiedTeacher(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });
    if (!identityStepDone(row)) return blocked('Complete the identity check first', 409, { code: 'identity_required' });

    const path = `${g.tutorId}/${randomUUID()}.${check.value.ext}`;
    const { data, error } = await g.db.storage.from(PROOF_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error('no signed url');

    return NextResponse.json({ path, token: data.token });
  } catch (err) {
    const setup = schemaNotReady(err);
    if (setup) return setup;
    console.error('[verification-v2/upload-url] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not prepare the upload' }, { status: 500 });
  }
}
