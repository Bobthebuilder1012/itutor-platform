// POST /api/tutor/classes/[classId]/pause — the tutor-pause spec, §2 and §4.
//
// Three actions: pause (announce), extend, resume-early.
//
// AUTHORITY: the tutor of this class, alone. No admin approval — §2 is explicit.
// That is safe specifically because pause_end is mandatory and auto-resume fires
// on it without anyone acting, so a tutor cannot leave a class paused
// indefinitely and there is nothing for an admin to have to un-stick.
//
// All three enforce the same 7 days' notice, including resume-early: "billing
// restarting unannounced is its own complaint — a family charged ahead of
// schedule has a legitimate grievance."

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  PAUSE_NOTICE_DAYS,
  extendTutorPause,
  resumeTutorPauseEarly,
  scheduleTutorPause,
} from '@/lib/payments/tutorPause';
import { fanOutPauseNotice } from '@/lib/server/tutorPauseNotify';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ classId: string }> };

const NOTICE_MESSAGE = `A change to a class break needs at least ${PAUSE_NOTICE_DAYS} days' notice, so families are not surprised by it.`;

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { classId } = await params;
    const admin = getServiceClient();

    // Authority: this tutor's own class, and nobody else's.
    const { data: group } = await admin
      .from('groups')
      .select('id, tutor_id, name')
      .eq('id', classId)
      .maybeSingle();

    const g = group as { id: string; tutor_id: string; name: string | null } | null;
    if (!g) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    if (g.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Not your class' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      pauseStart?: string;
      pauseEnd?: string;
      newPauseEnd?: string;
      newResumeAt?: string;
    };

    // Captured before the change so the extension email can say "it was due to
    // resume on X; it will now resume on Y".
    const { data: before } = await admin
      .from('group_enrollments')
      .select('pause_end')
      .eq('group_id', classId)
      .eq('pause_reason', 'tutor_break')
      .limit(1)
      .maybeSingle();
    const previousEnd = (before as { pause_end: string | null } | null)?.pause_end ?? null;

    if (body.action === 'pause') {
      if (!body.pauseStart || !body.pauseEnd) {
        return NextResponse.json(
          { error: 'pauseStart and pauseEnd are both required — a break cannot be open-ended' },
          { status: 400 }
        );
      }

      const result = await scheduleTutorPause(admin, {
        groupId: classId,
        tutorId: user.id,
        pauseStart: body.pauseStart,
        pauseEnd: body.pauseEnd,
      });

      if (!result.ok) return failure(result.reason);

      // Announced now, so families hear before enrolment reopens or the pause
      // begins. The cron re-runs this harmlessly for anything missed.
      const { notified } = await fanOutPauseNotice(admin, { groupId: classId, kind: 'paused' });

      return NextResponse.json({
        ok: true,
        action: 'pause',
        familiesAffected: result.affected,
        familiesNotified: notified,
        enrolmentClosedUntil: body.pauseEnd,
      });
    }

    if (body.action === 'extend') {
      if (!body.newPauseEnd) {
        return NextResponse.json({ error: 'newPauseEnd is required' }, { status: 400 });
      }

      const result = await extendTutorPause(admin, {
        groupId: classId,
        tutorId: user.id,
        newPauseEnd: body.newPauseEnd,
      });
      if (!result.ok) return failure(result.reason);

      const { notified } = await fanOutPauseNotice(admin, {
        groupId: classId,
        kind: 'extended',
        previousEnd,
      });

      return NextResponse.json({
        ok: true,
        action: 'extend',
        familiesAffected: result.affected,
        familiesNotified: notified,
      });
    }

    if (body.action === 'resume-early') {
      if (!body.newResumeAt) {
        return NextResponse.json({ error: 'newResumeAt is required' }, { status: 400 });
      }

      const result = await resumeTutorPauseEarly(admin, {
        groupId: classId,
        tutorId: user.id,
        newResumeAt: body.newResumeAt,
      });
      if (!result.ok) return failure(result.reason);

      const { notified } = await fanOutPauseNotice(admin, {
        groupId: classId,
        kind: 'resuming_early',
        previousEnd,
      });

      // Note: billing does not restart here. The pause end simply moved, and the
      // same auto-resume path lifts collection on that date — after families have
      // been told, which is the point of requiring notice.
      return NextResponse.json({
        ok: true,
        action: 'resume-early',
        familiesAffected: result.affected,
        familiesNotified: notified,
        resumesOn: body.newResumeAt,
      });
    }

    return NextResponse.json(
      { error: 'action must be pause, extend or resume-early' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[POST /api/tutor/classes/[classId]/pause]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function failure(reason: string) {
  const status = reason === 'no_active_tutor_pause' ? 409 : 400;
  const message =
    reason === 'insufficient_notice'
      ? NOTICE_MESSAGE
      : reason === 'pause_end_must_be_after_start'
        ? 'The break has to end after it starts.'
        : reason === 'not_earlier_than_current_end'
          ? 'That is not earlier than the date families were already given.'
          : reason === 'no_active_tutor_pause'
            ? 'This class does not have a break to change.'
            : reason;

  return NextResponse.json({ error: reason, message }, { status });
}
