// Feedback requests — handover §8.1.
//
// GET  ?childId=&tutorId=  the shared quota's state, for a disabled button and
//                          its plain reason (§9.2)
// POST                     spend this month's request
//
// One endpoint serves both the parent and the student because the quota is
// shared (decision 13) and the rules are identical for both — two endpoints
// would be two places for the supersede rule to drift.
//
// The notification goes to the TUTOR ONLY (§8.1), and it is the entire
// mechanism: nothing else ever prompts a tutor about feedback. No deadline is
// computed, nothing is scheduled, and there is no follow-up.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  canRequestFor,
  createFeedbackRequest,
  getQuotaStatus,
  hasTaughtRelationship,
} from '@/lib/server/feedbackRequests';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';
import { sendEmail, logEmailSend } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const childId = request.nextUrl.searchParams.get('childId');
    const tutorId = request.nextUrl.searchParams.get('tutorId');
    if (!childId || !tutorId) {
      return NextResponse.json({ error: 'childId and tutorId are required' }, { status: 400 });
    }

    const admin = getServiceClient();

    const role = await canRequestFor(admin, { actorId: user.id, childId });
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const quota = await getQuotaStatus(admin, { childId, tutorId });
    return NextResponse.json({ ...quota, youAre: role });
  } catch (err) {
    console.error('[GET /api/feedback/requests]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      childId?: string;
      tutorId?: string;
    };
    // A student requesting for themselves need not name themselves, and must not
    // have to discover their own id to do it. Decision 15 makes this the common
    // case: students may request independently, linked parent or not.
    const childId = body.childId ?? user.id;
    const { tutorId } = body;
    if (!tutorId) {
      return NextResponse.json({ error: 'tutorId is required' }, { status: 400 });
    }

    const admin = getServiceClient();

    // Decision 15: a student may always request for themselves; a linked parent
    // may request on their behalf. Nobody else.
    const role = await canRequestFor(admin, { actorId: user.id, childId });
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const taught = await hasTaughtRelationship(admin, { childId, tutorId });
    if (!taught) {
      return NextResponse.json(
        { error: 'no_relationship', message: 'That tutor has not taught this student.' },
        { status: 409 }
      );
    }

    const result = await createFeedbackRequest(admin, {
      childId,
      tutorId,
      requesterId: user.id,
      requesterRole: role,
    });

    if (!result.ok) {
      if (result.reason === 'quota_used') {
        // Not an error the user caused — the household shares one request, and
        // the other party may have spent it seconds ago. Say who and when.
        return NextResponse.json(
          { error: 'quota_used', message: result.quota.reason, quota: result.quota },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    // §8.1 — the tutor, and only the tutor.
    try {
      await notifyTutor(admin, { childId, tutorId, requestId: result.requestId });
    } catch (e) {
      console.error('[feedback/requests] tutor notify failed:', e);
    }

    return NextResponse.json({
      ok: true,
      requestId: result.requestId,
      supersededId: result.supersededId,
      // Deliberately says only that it was sent, with no timeframe. §8.1 bans
      // "pending", "expected" and any progress language.
      message: 'Requested. The tutor will answer when they can.',
    });
  } catch (err) {
    console.error('[POST /api/feedback/requests]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function notifyTutor(
  admin: ReturnType<typeof getServiceClient>,
  params: { childId: string; tutorId: string; requestId: string }
): Promise<void> {
  const { data: people } = await admin
    .from('profiles')
    .select('id, full_name, display_name, email')
    .in('id', [params.childId, params.tutorId]);

  const rows = (people ?? []) as unknown as Array<{
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  }>;
  const child = rows.find((p) => p.id === params.childId);
  const tutor = rows.find((p) => p.id === params.tutorId);

  const childName = child?.display_name || child?.full_name || 'A student';

  await notifyInApp(admin, {
    userId: params.tutorId,
    type: 'feedback_requested',
    title: `Feedback requested for ${childName}`,
    // No date pressure, no "by when". The request date is the only fact given.
    message: 'They asked for a general update on how this student is doing.',
    link: '/tutor/clients',
    metadata: { request_id: params.requestId, child_id: params.childId },
  });

  if (!tutor?.email) return;

  const subject = `Feedback requested for ${childName}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111827;line-height:1.6">
    <p>Hi ${(tutor.display_name || tutor.full_name || 'there').split(' ')[0]},</p>
    <p><strong>${childName}</strong>&rsquo;s family has asked for feedback on how they are doing.</p>
    <p>There is no deadline. Write it when you have something worth saying.</p>
    <p><a href="${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://myitutor.com').replace(/\/$/, '')}/tutor/clients"
          style="display:inline-block;background:#199356;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Open your clients</a></p>
  </div>`;

  const result = await sendEmail({ to: tutor.email, subject, html });
  await logEmailSend({
    userId: params.tutorId,
    emailType: 'feedback_requested',
    recipientEmail: tutor.email,
    subject,
    status: result.success ? 'success' : 'failed',
    errorMessage: result.error,
  });
}
