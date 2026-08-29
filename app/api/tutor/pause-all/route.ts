// GET / POST /api/tutor/pause-all — one break across every class a tutor runs.
//
// The same rules as the per-class control, applied in a loop: 7 days' notice, a
// mandatory end date, seats held, billing extended rather than refunded, and the
// same four emails fanned out per class.
//
// PARTIAL SUCCESS IS REPORTED, NOT HIDDEN
// Each class is applied independently and a failure on one does not abort the
// rest — a tutor going on holiday needs the other five classes paused even if one
// has a problem. The response names what failed, because "Pause All" that
// silently paused four of five is how a family gets charged during a break their
// tutor believes they announced.
//
// Classes already on a break are skipped rather than re-paused, so Pause All is
// safe to press twice and cannot stack two breaks on one class.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { PAUSE_NOTICE_DAYS, scheduleTutorPause } from '@/lib/payments/tutorPause';
import { fanOutPauseNotice } from '@/lib/server/tutorPauseNotify';

export const dynamic = 'force-dynamic';

type ClassRow = { id: string; name: string | null; subject: string | null };

async function tutorClasses(
  admin: ReturnType<typeof getServiceClient>,
  tutorId: string
): Promise<ClassRow[]> {
  const { data } = await admin
    .from('groups')
    .select('id, name, subject')
    .eq('tutor_id', tutorId)
    .limit(200);
  return (data ?? []) as unknown as ClassRow[];
}

export async function GET(_request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();
    const classes = await tutorClasses(admin, user.id);
    if (classes.length === 0) {
      return NextResponse.json({ classes: [], anyPaused: false, noticeDays: PAUSE_NOTICE_DAYS });
    }

    const ids = classes.map((c) => c.id);

    // Which classes already have a break, and the window, so the banner can name
    // dates rather than just saying "some classes are paused".
    const { data: paused } = await admin
      .from('group_enrollments')
      .select('group_id, pause_start, pause_end, paused_at')
      .in('group_id', ids)
      .eq('pause_reason', 'tutor_break')
      .limit(500);

    const byGroup = new Map<
      string,
      { start: string | null; end: string | null; active: boolean }
    >();
    for (const r of (paused ?? []) as unknown as Array<{
      group_id: string;
      pause_start: string | null;
      pause_end: string | null;
      paused_at: string | null;
    }>) {
      if (!byGroup.has(r.group_id)) {
        byGroup.set(r.group_id, {
          start: r.pause_start,
          end: r.pause_end,
          active: Boolean(r.paused_at),
        });
      }
    }

    const rows = classes.map((c) => {
      const p = byGroup.get(c.id);
      return {
        id: c.id,
        name: c.name || c.subject || 'Class',
        paused: Boolean(p),
        active: p?.active ?? false,
        start: p?.start ?? null,
        end: p?.end ?? null,
      };
    });

    return NextResponse.json({
      classes: rows,
      anyPaused: rows.some((r) => r.paused),
      pausedCount: rows.filter((r) => r.paused).length,
      noticeDays: PAUSE_NOTICE_DAYS,
      earliestStart: new Date(Date.now() + PAUSE_NOTICE_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10),
    });
  } catch (err) {
    console.error('[GET /api/tutor/pause-all]', err);
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
      pauseStart?: string;
      pauseEnd?: string;
    };

    if (!body.pauseStart || !body.pauseEnd) {
      return NextResponse.json(
        { error: 'pauseStart and pauseEnd are both required — a break cannot be open-ended' },
        { status: 400 }
      );
    }

    const admin = getServiceClient();
    const classes = await tutorClasses(admin, user.id);
    if (classes.length === 0) {
      return NextResponse.json({ error: 'You have no classes to pause' }, { status: 409 });
    }

    const applied: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ name: string; reason: string }> = [];
    let familiesAffected = 0;
    let familiesNotified = 0;

    for (const c of classes) {
      const name = c.name || c.subject || 'Class';

      // Already on a break: skipping keeps Pause All idempotent and stops two
      // breaks stacking on one class.
      const { data: existing } = await admin
        .from('group_enrollments')
        .select('id')
        .eq('group_id', c.id)
        .eq('pause_reason', 'tutor_break')
        .limit(1);

      if (existing && existing.length > 0) {
        skipped.push(name);
        continue;
      }

      const result = await scheduleTutorPause(admin, {
        groupId: c.id,
        tutorId: user.id,
        pauseStart: body.pauseStart,
        pauseEnd: body.pauseEnd,
      });

      if (!result.ok) {
        // Logged and reported, never silent. One bad class must not stop the rest.
        failed.push({ name, reason: result.reason });
        continue;
      }

      familiesAffected += result.affected;
      applied.push(name);

      const out = await fanOutPauseNotice(admin, { groupId: c.id, kind: 'paused' });
      familiesNotified += out.notified;
    }

    // 207 when some classes could not be paused: the caller must not read this as
    // a clean success and tell the tutor everything is on break.
    const status = failed.length > 0 ? 207 : 200;

    return NextResponse.json(
      {
        ok: failed.length === 0,
        applied,
        skipped,
        failed,
        familiesAffected,
        familiesNotified,
      },
      { status }
    );
  } catch (err) {
    console.error('[POST /api/tutor/pause-all]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
