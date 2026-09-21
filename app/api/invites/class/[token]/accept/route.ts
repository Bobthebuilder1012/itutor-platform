// POST /api/invites/class/[token]/accept
// Redeems an invitation for the signed-in student.
//
// The rules all live in lib/server/classInvites.redeemInvite — notably that a
// priced class is never joined here, only paid for on the class page.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { redeemInvite } from '@/lib/server/classInvites';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();

    // Only a student can take a seat. A tutor or parent following an invite is
    // told so plainly by the page — reachable because the signup flow still
    // asks for a role, so an invited person can pick the wrong one.
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile as { role: string } | null)?.role ?? null;
    if (role !== 'student') {
      return NextResponse.json({ error: 'student_account_required', role }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const source = typeof body?.source === 'string' ? body.source.slice(0, 40) : null;

    const result = await redeemInvite(admin, {
      token: params.token,
      studentId: user.id,
      source,
    });

    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    // enrolment_started has been defined and client-emittable since the
    // attribution work and has never been fired anywhere. An invited student
    // reaching a class is exactly the moment it describes.
    try {
      await track(
        PRODUCT_EVENTS.CLASS_INVITE_ACCEPTED,
        { group_id: result.groupId, outcome: result.outcome, source },
        { userId: user.id },
      );
      if (result.outcome !== 'pending_payment') {
        await track(PRODUCT_EVENTS.ENROLMENT_STARTED, { group_id: result.groupId }, { userId: user.id });
      }
    } catch (e) {
      console.error('[classInvites] analytics failed:', e);
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[classInvites] accept failed:', e?.message ?? e);
    return NextResponse.json({ error: 'accept_failed' }, { status: 500 });
  }
}
