// POST /api/feedback   a tutor writes feedback
// PATCH /api/feedback  a tutor edits it after posting (§8.2)
//
// Handover §8.2. The tutor is the only author, and the route is the only writer
// of attendance_snapshot — migration 222's trigger refuses a client-supplied one
// because a tutor filling in their own figures could report 100% for a student
// who attended twice, indistinguishably from a real report.
//
// Feedback may answer a request or be volunteered unprompted (§8, request_id
// null). Both reach parent and student (decision 14), as two emails with
// different bodies (§8.2).

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { hasTaughtRelationship } from '@/lib/server/feedbackRequests';
import {
  buildAttendanceSnapshot,
  deliverFeedback,
  PARTICIPATION_VALUES,
  type FeedbackSection,
  type Participation,
} from '@/lib/server/feedbackReports';

export const dynamic = 'force-dynamic';

/** Guards against a JSONB column being used as unbounded storage. */
const MAX_SECTIONS = 8;
const MAX_SECTION_BODY = 4000;
const MAX_NOTE = 2000;

function parseSections(input: unknown): FeedbackSection[] | null {
  if (input == null) return [];
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_SECTIONS) return null;

  const out: FeedbackSection[] = [];
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) return null;
    const s = raw as Record<string, unknown>;
    const key = typeof s.key === 'string' ? s.key.slice(0, 64) : null;
    const label = typeof s.label === 'string' ? s.label.slice(0, 120) : null;
    const body = typeof s.body === 'string' ? s.body.slice(0, MAX_SECTION_BODY) : '';
    if (!key || !label) return null;
    // Empty sections are dropped rather than stored: §12.2 leaves the section
    // list open, and a blank "Behaviour" heading reads as a judgement withheld.
    if (body.trim().length === 0) continue;
    out.push({ key, label, body });
  }
  return out;
}

async function resolveNames(
  admin: ReturnType<typeof getServiceClient>,
  childId: string,
  tutorId: string
): Promise<{ childName: string; tutorName: string }> {
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, display_name, username')
    .in('id', [childId, tutorId]);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    full_name: string | null;
    display_name: string | null;
    username: string | null;
  }>;
  const nameOf = (id: string) => {
    const p = rows.find((r) => r.id === id);
    return p?.display_name || p?.full_name || p?.username || 'Unknown';
  };
  return { childName: nameOf(childId), tutorName: nameOf(tutorId) };
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
      requestId?: string | null;
      sessionId?: string | null;
      participation?: string;
      attendanceNote?: string | null;
      sections?: unknown;
      kind?: 'general' | 'session' | 'monthly';
    };

    const childId = body.childId;
    if (!childId) return NextResponse.json({ error: 'childId is required' }, { status: 400 });

    // §8.2: participation is a required single select. Feedback with no
    // participation answer is the one shape the template does not allow.
    const participation = body.participation as Participation | undefined;
    if (!participation || !PARTICIPATION_VALUES.includes(participation)) {
      return NextResponse.json(
        { error: 'participation must be one of: ' + PARTICIPATION_VALUES.join(', ') },
        { status: 400 }
      );
    }

    const sections = parseSections(body.sections);
    if (sections === null) return NextResponse.json({ error: 'Malformed sections' }, { status: 400 });

    const admin = getServiceClient();

    // The author is always the caller. tutor_id is never taken from the body.
    const tutorId = user.id;

    const taught = await hasTaughtRelationship(admin, { childId, tutorId });
    if (!taught) {
      return NextResponse.json(
        { error: 'no_relationship', message: 'You have not taught this student.' },
        { status: 403 }
      );
    }

    // A request id is only honoured if it really belongs to this pair and is
    // still open — otherwise a tutor could close somebody else's request.
    let requestId: string | null = null;
    if (body.requestId) {
      const { data: req } = await admin
        .from('feedback_requests')
        .select('id, status')
        .eq('id', body.requestId)
        .eq('child_id', childId)
        .eq('tutor_id', tutorId)
        .maybeSingle();
      const r = req as { id: string; status: string } | null;
      if (r && r.status === 'open') requestId = r.id;
    }

    // §8.2: generated here, from the §6 helper, frozen at write time.
    const snapshot = await buildAttendanceSnapshot(admin, { childId, tutorId });

    const { data: created, error } = await admin
      .from('feedback')
      .insert({
        kind: body.kind ?? (body.sessionId ? 'session' : 'general'),
        session_id: body.sessionId ?? null,
        child_id: childId,
        tutor_id: tutorId,
        request_id: requestId,
        attendance_snapshot: snapshot,
        attendance_note: body.attendanceNote?.slice(0, MAX_NOTE) || null,
        participation,
        sections,
      })
      .select('id')
      .single();

    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'insert_failed' }, { status: 500 });
    }

    const feedbackId = (created as { id: string }).id;

    // Close the request. §8.3's instrumentation depends on this pairing:
    // requested_at against this row's created_at is the time-to-response.
    if (requestId) {
      await admin
        .from('feedback_requests')
        .update({
          status: 'answered',
          answered_feedback_id: feedbackId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'open');
    }

    const names = await resolveNames(admin, childId, tutorId);

    try {
      await deliverFeedback(admin, {
        feedbackId,
        childId,
        tutorId,
        tutorName: names.tutorName,
        childName: names.childName,
        snapshot,
        participation,
        attendanceNote: body.attendanceNote ?? null,
        sections,
        answeringRequest: Boolean(requestId),
        isEdit: false,
      });
    } catch (e) {
      // Delivery must not undo the report — it exists and both parties can read
      // it in the app.
      console.error('[feedback] delivery failed:', e);
    }

    return NextResponse.json({ ok: true, feedbackId, answeredRequestId: requestId });
  } catch (err) {
    console.error('[POST /api/feedback]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * §8.2: "Editable after posting; stamp updated_at and surface 'edited'."
 *
 * The snapshot is NOT recomputed on edit. It is a record of what the attendance
 * was when the report was written, and silently refreshing it would change the
 * meaning of a tutor's note about those figures.
 */
export async function PATCH(request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      feedbackId?: string;
      participation?: string;
      attendanceNote?: string | null;
      sections?: unknown;
    };

    if (!body.feedbackId) {
      return NextResponse.json({ error: 'feedbackId is required' }, { status: 400 });
    }

    const admin = getServiceClient();

    const { data: existing } = await admin
      .from('feedback')
      .select('id, child_id, tutor_id, attendance_snapshot, request_id, participation')
      .eq('id', body.feedbackId)
      .maybeSingle();

    const row = existing as unknown as {
      id: string;
      child_id: string;
      tutor_id: string;
      attendance_snapshot: Record<string, unknown> | null;
      request_id: string | null;
      participation: Participation;
    } | null;

    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (row.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Not your feedback' }, { status: 403 });
    }

    const participation = (body.participation as Participation | undefined) ?? row.participation;
    if (!PARTICIPATION_VALUES.includes(participation)) {
      return NextResponse.json({ error: 'Invalid participation' }, { status: 400 });
    }

    const sections = body.sections === undefined ? undefined : parseSections(body.sections);
    if (sections === null) return NextResponse.json({ error: 'Malformed sections' }, { status: 400 });

    const patch: Record<string, unknown> = { participation };
    if (body.attendanceNote !== undefined) {
      patch.attendance_note = body.attendanceNote?.slice(0, MAX_NOTE) || null;
    }
    if (sections !== undefined) patch.sections = sections;

    // updated_at is set by the trigger in migration 222, not here — the "edited"
    // marker is derived from it, so it must not depend on a caller remembering.
    const { error } = await admin.from('feedback').update(patch).eq('id', body.feedbackId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const names = await resolveNames(admin, row.child_id, row.tutor_id);

    try {
      await deliverFeedback(admin, {
        feedbackId: row.id,
        childId: row.child_id,
        tutorId: row.tutor_id,
        tutorName: names.tutorName,
        childName: names.childName,
        snapshot: (row.attendance_snapshot ?? {}) as never,
        participation,
        attendanceNote: (patch.attendance_note as string | null) ?? null,
        sections: (sections ?? []) as FeedbackSection[],
        answeringRequest: Boolean(row.request_id),
        isEdit: true,
      });
    } catch (e) {
      console.error('[feedback] edit delivery failed:', e);
    }

    return NextResponse.json({ ok: true, edited: true });
  } catch (err) {
    console.error('[PATCH /api/feedback]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
