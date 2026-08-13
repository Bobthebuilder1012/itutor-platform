// GET /api/parent/feedback/reports — the parent's on-platform copy of feedback.
//
// Handover §9.1: "Feedback threads, with realistic sparsity in fixtures."
//
// This reads the unified feedback table (migration 222) and is now the only
// parent-facing feedback read. The route that used to sit at /api/parent/feedback
// served the legacy tutor_feedback data and was removed with it in migration 223,
// once §12.3 was settled in favour of this model.
//
// Sparsity is expected, not a bug. §8 makes feedback optional and pull-based,
// and most classes produce none, so the empty state has to read as normal rather
// than as something having gone wrong.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { PARTICIPATION_LABELS, type Participation } from '@/lib/server/feedbackReports';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const { data: links } = await admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', parentProfile.id);

    const childIds = ((links ?? []) as unknown as Array<{ child_id: string }>).map(
      (l) => l.child_id
    );
    if (childIds.length === 0) {
      return NextResponse.json({ reports: [], openRequests: [], hasChildren: false });
    }

    const [{ data: feedbackRows }, { data: requestRows }] = await Promise.all([
      admin
        .from('feedback')
        .select(
          'id, child_id, tutor_id, request_id, attendance_snapshot, attendance_note, participation, sections, created_at, updated_at'
        )
        .in('child_id', childIds)
        .order('created_at', { ascending: false })
        .limit(60),
      // Requests still waiting. Shown without any timeframe language (§8.1) —
      // the date asked, and nothing that implies a due date.
      admin
        .from('feedback_requests')
        .select('id, child_id, tutor_id, requested_at, requester_role')
        .in('child_id', childIds)
        .eq('status', 'open'),
    ]);

    const reports = (feedbackRows ?? []) as unknown as Array<{
      id: string;
      child_id: string;
      tutor_id: string;
      request_id: string | null;
      attendance_snapshot: Record<string, unknown> | null;
      attendance_note: string | null;
      participation: Participation;
      sections: Array<{ key: string; label: string; body: string }> | null;
      created_at: string;
      updated_at: string;
    }>;

    const open = (requestRows ?? []) as unknown as Array<{
      id: string;
      child_id: string;
      tutor_id: string;
      requested_at: string;
      requester_role: string;
    }>;

    const peopleIds = Array.from(
      new Set([
        ...childIds,
        ...reports.map((r) => r.tutor_id),
        ...open.map((r) => r.tutor_id),
      ])
    );

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name, username')
      .in('id', peopleIds);

    const nameById = new Map(
      ((profiles ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
        username: string | null;
      }>).map((p) => [p.id, p.display_name || p.full_name || p.username || 'Unknown'])
    );

    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString('en-TT', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Port_of_Spain',
      });

    return NextResponse.json({
      hasChildren: true,
      reports: reports.map((r) => {
        const snap = (r.attendance_snapshot ?? {}) as {
          rateLabel?: string;
          attended?: number;
          late?: number;
          absent?: number;
          cancelled?: number;
          excluded?: number;
        };
        return {
          id: r.id,
          childName: nameById.get(r.child_id) ?? 'Your child',
          tutorName: nameById.get(r.tutor_id) ?? 'Tutor',
          date: fmt(r.created_at),
          // §8.2: surface "edited". Compared server-side so every surface agrees
          // on what counts as an edit.
          edited: new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 1000,
          editedOn: fmt(r.updated_at),
          answeredARequest: Boolean(r.request_id),
          attendance: {
            label: snap.rateLabel ?? null,
            attended: snap.attended ?? null,
            late: snap.late ?? null,
            absent: snap.absent ?? null,
            cancelled: snap.cancelled ?? null,
            excluded: snap.excluded ?? null,
          },
          attendanceNote: r.attendance_note,
          participation: r.participation,
          participationLabel: PARTICIPATION_LABELS[r.participation] ?? r.participation,
          sections: r.sections ?? [],
        };
      }),
      openRequests: open.map((r) => ({
        id: r.id,
        childName: nameById.get(r.child_id) ?? 'Your child',
        tutorName: nameById.get(r.tutor_id) ?? 'Tutor',
        // The request date only. No "expected", no progress (§8.1).
        requestedOn: fmt(r.requested_at),
        byYou: r.requester_role === 'parent',
      })),
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/feedback/reports]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
