// POST /api/bookings/[bookingId]/withdraw — decision 28.
//
// "Students may withdraw a pending request, clearing the parent's queue."
//
// The student is the only person who can do this and only while the request is
// still pending; migration 219's trigger enforces the same rule underneath, so
// this route is the usable path rather than the only defence.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { withdrawRequest } from '@/lib/server/bookingRequests';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ bookingId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { bookingId } = await params;
    const admin = getServiceClient();

    const result = await withdrawRequest(admin, { bookingId, studentId: user.id });
    if (!result.ok) {
      const status =
        result.reason === 'not_found' ? 404 : result.reason === 'not_yours' ? 403 : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }

    // No email either way. The parent discovers this in their queue, which is
    // where they were going to look anyway — and a "your child changed their
    // mind" email for something they never actioned is noise.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/bookings/[bookingId]/withdraw]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
