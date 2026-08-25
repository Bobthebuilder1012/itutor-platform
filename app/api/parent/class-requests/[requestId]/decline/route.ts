// POST /api/parent/class-requests/[requestId]/decline
//
// The reason, if one is given, reaches the student verbatim — the same rule the
// 1:1 decline follows. It is optional: a parent who does not want to explain
// themselves to their own child should not be blocked from answering.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { declineClassJoinRequest } from '@/lib/server/classJoinRequests';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ requestId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { requestId } = await params;
    const { admin, parentProfile } = await requireParentContext();

    const body = (await request.json().catch(() => ({}))) as { reason?: string };

    const result = await declineClassJoinRequest(admin, {
      requestId,
      parentId: parentProfile.id,
      reason: body.reason ?? null,
    });

    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 409;
      return NextResponse.json(
        {
          error:
            result.reason === 'not_found'
              ? 'That request is not on your account.'
              : 'That request has already been answered.',
        },
        { status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/class-requests/[requestId]/decline]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
