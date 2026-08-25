// GET /api/parent/class-requests — group-class approvals waiting on this parent.
//
// The sibling of /api/parent/approvals, which covers 1:1 bookings only. Two
// endpoints rather than one because the two requests are genuinely different
// records with different fields: a 1:1 request has a session time and a closing
// window, a class request has a schedule and no expiry (a recurring class has no
// single anchoring session — §12 leaves group expiry open, so nothing here
// closes a request by a rule nobody agreed).

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { listParentClassRequests } from '@/lib/server/classJoinRequests';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { pending, decided } = await listParentClassRequests(admin, parentProfile.id);
    return NextResponse.json({ pending, decided });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/class-requests]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
