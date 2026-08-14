// GET /api/parent/approvals — the parent's queue and their Past decisions.
//
// Handover §9.1. Past decisions carries every outcome, including expired and
// withdrawn, because no email is sent for either (§4.2, decision 28) — this
// list is the only place they surface at all.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { listParentRequests } from '@/lib/server/bookingRequests';
import { formatWhen } from '@/lib/server/bookingRequestContext';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const { pending, decided, childIds } = await listParentRequests(admin, parentProfile.id);

    // One batched profile read for children and tutors together, rather than a
    // lookup per row.
    const tutorIds = Array.from(
      new Set([...pending, ...decided].map((r) => r.tutorId).filter(Boolean))
    );
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name, username, avatar_url')
      .in('id', Array.from(new Set([...childIds, ...tutorIds])));

    const nameById = new Map<string, { name: string; avatar: string | null }>();
    for (const p of profiles ?? []) {
      nameById.set(p.id, {
        name: p.display_name || p.full_name || p.username || 'Unknown',
        avatar: p.avatar_url ?? null,
      });
    }

    const now = Date.now();

    return NextResponse.json({
      pending: pending.map((r) => ({
        id: r.id,
        childId: r.studentId,
        childName: nameById.get(r.studentId)?.name ?? 'Your child',
        // The kit's queue links to the tutor's profile: half of an approval
        // decision is "do I trust this person with my child".
        tutorId: r.tutorId,
        tutorName: nameById.get(r.tutorId)?.name ?? 'Tutor',
        tutorAvatar: nameById.get(r.tutorId)?.avatar ?? null,
        when: formatWhen(r.requestedStartAt),
        minutes: r.durationMinutes,
        // Decision 10 — labelled as-listed everywhere it is shown, so a parent
        // comparing it with the tutor's current rate is not confused by a gap.
        priceWhenRequested: r.frozenPrice,
        isFree: r.isFree,
        requestedAt: r.requestedAt,
        closesAt: r.expiresAt ? formatWhen(r.expiresAt) : null,
        // §4.2: inside the last two hours the parent may no longer approve. The
        // queue says so rather than letting them click and be refused.
        closed: r.expiresAt ? new Date(r.expiresAt).getTime() <= now : false,
      })),
      decided: decided.map((r) => ({
        id: r.id,
        childId: r.studentId,
        childName: nameById.get(r.studentId)?.name ?? 'Your child',
        tutorName: nameById.get(r.tutorId)?.name ?? 'Tutor',
        decision: r.outcome,
        total: r.total,
        at: r.decidedAt ? formatWhen(r.decidedAt) : null,
        reason: r.reason,
        // The one outcome a parent did not cause, so it gets an explanation
        // rather than being left to look like a decision they made.
        note:
          r.outcome === 'Expired'
            ? 'Closed unanswered two hours before the session. The place went to another student.'
            : r.outcome === 'Withdrawn'
              ? 'Your child withdrew this request before you answered.'
              : null,
      })),
      hasChildren: childIds.length > 0,
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/approvals]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
