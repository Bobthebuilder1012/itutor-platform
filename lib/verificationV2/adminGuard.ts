// Guard for the admin v2 routes: flag, then an admin or reviewer session, then
// (for decisions) the named-reviewer config. Returns the service client and the
// actor to record, or the ready-made error response.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { mayDecideV2 } from '@/config/verificationReview';
import type { Db } from '@/lib/verification/setStatus';
import type { ReviewActor, ReviewFailure } from './review';

export async function guardAdminV2(opts: { decide?: boolean; adminOnly?: boolean } = {}): Promise<
  | { error: NextResponse }
  | { error: null; db: Db; actor: ReviewActor; actorId: string }
> {
  if (!isVerificationV2Enabled()) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return { error: auth.error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const isAdminRole = auth.profile.role === 'admin';
  if (opts.adminOnly && !isAdminRole) {
    return { error: NextResponse.json({ error: 'Admin role required', code: 'actor_not_allowed' }, { status: 403 }) };
  }

  // TODO(policy): the named reviewer. Empty config = everyone who passed requireAdmin.
  if (opts.decide && !mayDecideV2({ id: auth.profile.id, email: auth.profile.email })) {
    return {
      error: NextResponse.json(
        { error: 'You are not an approved reviewer for these decisions', code: 'not_named_reviewer' },
        { status: 403 }
      ),
    };
  }

  return {
    error: null,
    db: getServiceClient() as Db,
    actor: isAdminRole ? 'admin' : 'reviewer',
    actorId: auth.profile.id,
  };
}

export function reviewErrorResponse(failure: ReviewFailure) {
  return NextResponse.json(
    {
      error: failure.message,
      code: failure.code,
      ...(failure.partial ? { partial: true } : {}),
    },
    { status: failure.httpStatus }
  );
}
