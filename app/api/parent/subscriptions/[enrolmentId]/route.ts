// POST /api/parent/subscriptions/[enrolmentId] — handover §10.7, decision 30.
//
// One route, four actions: pause, resume, cancel, restart. They share the same
// authorisation and the same failure handling, and splitting them into four
// files would mean four copies of the payer check.
//
// PAYER-INITIATED ONLY
// The caller must be the linked parent of the enrolled child. Tutor-initiated
// pause is not reachable here at all: §12.4 leaves its blast radius undecided
// (whether it stops billing for every enrolled family at once, what happens to
// seats, who may trigger it) and the scoped spec for it is deferred. A tutor
// hitting this endpoint gets a 403, not a partially-implemented pause.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';
import {
  cancelSubscription,
  loadEnrolment,
  pauseSubscription,
  restartSubscription,
  resumeSubscription,
} from '@/lib/payments/subscriptionPause';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ enrolmentId: string }> };

type Action = 'pause' | 'resume' | 'cancel' | 'restart';

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { enrolmentId } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      reason?: string | null;
      resumeAt?: string | null;
    };

    const action = body.action as Action | undefined;
    if (!action || !['pause', 'resume', 'cancel', 'restart'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be pause, resume, cancel or restart' },
        { status: 400 }
      );
    }

    const enrolment = await loadEnrolment(admin, enrolmentId);
    if (!enrolment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // The subscription belongs to a child; the parent's standing to act on it
    // comes from the link, not from the enrolment row.
    await requireParentChild(parentProfile.id, enrolment.student_id);

    const result =
      action === 'pause'
        ? await pauseSubscription(admin, {
            enrolmentId,
            actorId: parentProfile.id,
            resumeAt: body.resumeAt ?? null,
          })
        : action === 'resume'
          ? await resumeSubscription(admin, { enrolmentId })
          : action === 'cancel'
            ? await cancelSubscription(admin, {
                enrolmentId,
                actorId: parentProfile.id,
                reason: body.reason ?? null,
              })
            : await restartSubscription(admin, { enrolmentId });

    if (!result.ok) {
      const status =
        result.reason === 'already_cancelled' ? 409 : result.reason === 'not_found' ? 404 : 502;
      return NextResponse.json({ error: result.reason }, { status });
    }

    // The student is told, because this changes whether their class continues and
    // they did not do it. Subscription category, so it honours §10.6.
    if (!result.alreadyInState) {
      const message: Record<Action, { title: string; body: string }> = {
        pause: {
          title: 'Your class billing was paused',
          body: 'Your place is kept and the same tutor stays. Charges stop until it resumes.',
        },
        resume: {
          title: 'Your class billing resumed',
          body: 'Charges restart on the original billing date.',
        },
        cancel: {
          title: 'Your class will end after this month',
          body: 'Classes already paid for stay on your calendar. The next charge will not be taken.',
        },
        restart: {
          title: 'Your class will continue',
          body: 'The scheduled cancellation was called off.',
        },
      };

      await notifyInApp(admin, {
        userId: enrolment.student_id,
        type: 'subscription_reactivation',
        title: message[action].title,
        message: message[action].body,
        link: '/student/classes',
      });
    }

    return NextResponse.json({ ok: true, action, alreadyInState: result.alreadyInState ?? false });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/subscriptions/[enrolmentId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
