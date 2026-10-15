// POST   /api/tutor/verification-v2/credentials        add one credential
// DELETE /api/tutor/verification-v2/credentials?id=…   remove one
// Step 3. Needs consent and a verified identity first.

import { NextRequest, NextResponse } from 'next/server';
import { MAX_CREDENTIALS, MAX_PROOF_BYTES, PROOF_BUCKET } from '@/lib/verificationV2/constants';
import { isOwnProofPath, validateCredential } from '@/lib/verificationV2/validation';
import {
  blocked,
  guardV2,
  hasIdentity,
  isEditable,
  loadCredentials,
  loadRow,
} from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const g = await guardV2();
  if (g.error) return g.error;
  const { db, tutorId } = g;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return blocked('Invalid request', 400);
  }

  const check = validateCredential(body);
  if (!check.ok) return blocked(check.error, 400);
  const input = check.value;

  try {
    const row = await loadRow(db, tutorId);
    if (!isEditable(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });
    if (!hasIdentity(row)) return blocked('Complete the identity check first', 409, { code: 'identity_required' });

    const existing = await loadCredentials(db, tutorId);
    if (existing.length >= MAX_CREDENTIALS) {
      return blocked(`You can add at most ${MAX_CREDENTIALS} credentials`, 409, { code: 'credentials_limit' });
    }

    if (input.proofPath) {
      if (!isOwnProofPath(input.proofPath, tutorId)) return blocked('Invalid proof file', 400);

      // The file must really be in the bucket, within the size limit, and not
      // already attached to another credential.
      const slash = input.proofPath.indexOf('/');
      const folder = input.proofPath.slice(0, slash);
      const name = input.proofPath.slice(slash + 1);
      const { data: objects, error: listError } = await db.storage
        .from(PROOF_BUCKET)
        .list(folder, { search: name, limit: 5 });
      if (listError) throw listError;
      const object = objects?.find((o) => o.name === name);
      if (!object) return blocked('Upload the proof file before saving', 400);
      const size = Number((object.metadata as any)?.size ?? 0);
      if (size > MAX_PROOF_BYTES) return blocked('Proof files can be at most 10MB', 400);

      const { data: used } = await db
        .from('tutor_credentials_v2')
        .select('id')
        .eq('proof_path', input.proofPath)
        .limit(1);
      if (used && used.length > 0) return blocked('That file is already attached', 409);
    }

    const { data, error } = await db
      .from('tutor_credentials_v2')
      .insert({
        tutor_id: tutorId,
        kind: input.kind,
        subject: input.subject,
        grade: input.grade,
        exam_year: input.exam_year,
        school: input.school,
        degree: input.degree,
        field: input.field,
        graduation_year: input.graduation_year,
        proof_url: input.proof_url,
        proof_path: input.proofPath,
        proof_filename: input.proof_filename,
      })
      .select('id')
      .single();
    if (error) {
      if (error.message?.includes('credentials_limit_reached')) {
        return blocked(`You can add at most ${MAX_CREDENTIALS} credentials`, 409, { code: 'credentials_limit' });
      }
      throw error;
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[verification-v2/credentials] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not save the credential' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const g = await guardV2();
  if (g.error) return g.error;
  const { db, tutorId } = g;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return blocked('Missing id', 400);

  try {
    const row = await loadRow(db, tutorId);
    if (!isEditable(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });

    const { data: cred } = await db
      .from('tutor_credentials_v2')
      .select('id, proof_path')
      .eq('id', id)
      .eq('tutor_id', tutorId)
      .maybeSingle();
    if (!cred) return blocked('Not found', 404);

    const { error } = await db.from('tutor_credentials_v2').delete().eq('id', id).eq('tutor_id', tutorId);
    if (error) throw error;

    if (cred.proof_path) {
      await db.storage.from(PROOF_BUCKET).remove([cred.proof_path]).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[verification-v2/credentials] delete failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not remove the credential' }, { status: 500 });
  }
}
