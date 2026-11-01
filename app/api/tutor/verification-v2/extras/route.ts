// POST   /api/tutor/verification-v2/extras        add one extra (max 3)
// DELETE /api/tutor/verification-v2/extras?id=…   remove one
// Step 4. The limit of 3 is checked here AND by a database trigger.

import { schemaNotReady } from '@/lib/verificationV2/schemaReady';
import { NextRequest, NextResponse } from 'next/server';
import { MAX_EXTRAS } from '@/lib/verificationV2/constants';
import { validateExtra } from '@/lib/verificationV2/validation';
import {
  blocked,
  guardV2,
  identityStepDone,
  isVerifiedTeacher,
  isEditable,
  loadExtras,
  loadRow,
  loadCredentials,
} from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

const LIMIT_MESSAGE = `You can add at most ${MAX_EXTRAS} extras`;

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

  const check = validateExtra(body);
  if (!check.ok) return blocked(check.error, 400);

  try {
    const row = await loadRow(db, tutorId);
    if (!isEditable(row) && !isVerifiedTeacher(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });
    if (!identityStepDone(row)) return blocked('Complete the identity check first', 409, { code: 'identity_required' });
    if ((await loadCredentials(db, tutorId)).length === 0) {
      return blocked('Add at least one credential first', 409, { code: 'credentials_required' });
    }

    if ((await loadExtras(db, tutorId)).length >= MAX_EXTRAS) {
      return blocked(LIMIT_MESSAGE, 409, { code: 'extras_limit' });
    }

    const { data, error } = await db
      .from('tutor_extras_v2')
      .insert({
        tutor_id: tutorId,
        title: check.value.title,
        description: check.value.description,
        link_url: check.value.link_url,
      })
      .select('id')
      .single();
    if (error) {
      // Lost a race with another request: the trigger is the backstop.
      if (error.message?.includes('extras_limit_reached')) {
        return blocked(LIMIT_MESSAGE, 409, { code: 'extras_limit' });
      }
      throw error;
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    const setup = schemaNotReady(err);
    if (setup) return setup;
    console.error('[verification-v2/extras] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not save the extra' }, { status: 500 });
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
    if (!isEditable(row) && !isVerifiedTeacher(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });

    const { error } = await db.from('tutor_extras_v2').delete().eq('id', id).eq('tutor_id', tutorId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const setup = schemaNotReady(err);
    if (setup) return setup;
    console.error('[verification-v2/extras] delete failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not remove the extra' }, { status: 500 });
  }
}
