// POST /api/parent/booking/check — handover §5.
//
// The two checks that resolve inline once a parent picks a child:
//   schedule conflict  against THAT child's own commitments
//   level mismatch     a confirmation, never a block
//
// §5: "Reuse the existing conflict checker for the recommendation query (subject
// match, non-overlap with the selected child's schedule). Do not write a second
// implementation." So findChildScheduleConflict does the overlap test here AND
// filters the alternatives — one definition of "clashes", used twice.
//
// Nothing here books anything. It answers "would this work for this child", and
// §5 is clear there is no approval step: the parent is already the
// decision-maker, so the only thing standing between this answer and checkout is
// the parent reading it.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';
import { conflictMessage, findChildScheduleConflict } from '@/lib/services/scheduleConflict';
import { classifyMembership } from '@/lib/services/groupMembership';

export const dynamic = 'force-dynamic';

/** Enough to be useful, few enough to stay one query. */
const MAX_ALTERNATIVES = 4;

export async function POST(request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const body = (await request.json().catch(() => ({}))) as {
      childId?: string;
      groupId?: string | null;
      start?: string | null;
      end?: string | null;
    };

    if (!body.childId) {
      return NextResponse.json({ error: 'childId is required' }, { status: 400 });
    }
    await requireParentChild(parentProfile.id, body.childId);

    // ---- what is being proposed -------------------------------------------
    let start = body.start ?? null;
    let end = body.end ?? null;
    let subjectName: string | null = null;
    let classFormLevel: string | null = null;
    let groupTutorId: string | null = null;

    if (body.groupId) {
      const { data: group } = await admin
        .from('groups')
        .select('id, subject, form_level, tutor_id')
        .eq('id', body.groupId)
        .maybeSingle();

      const g = group as {
        id: string;
        subject: string | null;
        form_level: string | null;
        tutor_id: string;
      } | null;
      if (!g) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

      subjectName = g.subject;
      classFormLevel = g.form_level;
      groupTutorId = g.tutor_id;

      // The next occurrence is what a parent is really being asked about — a
      // class they are joining now starts at its next session, not its first.
      if (!start || !end) {
        const { data: gs } = await admin
          .from('group_sessions')
          .select('id')
          .eq('group_id', g.id)
          .limit(50);

        const gsIds = ((gs ?? []) as unknown as Array<{ id: string }>).map((r) => r.id);
        if (gsIds.length > 0) {
          const { data: occ } = await admin
            .from('group_session_occurrences')
            .select('scheduled_start_at, scheduled_end_at')
            .in('group_session_id', gsIds)
            .is('cancelled_at', null)
            .gte('scheduled_start_at', new Date().toISOString())
            .order('scheduled_start_at', { ascending: true })
            .limit(1);

          const next = (occ ?? [])[0] as
            | { scheduled_start_at: string; scheduled_end_at: string }
            | undefined;
          if (next) {
            start = next.scheduled_start_at;
            end = next.scheduled_end_at;
          }
        }
      }
    }

    // ---- level mismatch: warn, never block (§5) ---------------------------
    const { data: childProfile } = await admin
      .from('profiles')
      .select('form_level, full_name, display_name')
      .eq('id', body.childId)
      .maybeSingle();

    const child = childProfile as {
      form_level: string | null;
      full_name: string | null;
      display_name: string | null;
    } | null;

    const childLevel = child?.form_level ?? null;
    const levelMismatch = Boolean(
      childLevel && classFormLevel && childLevel !== classFormLevel
    );

    // ---- already in this class --------------------------------------------
    // Checked BEFORE anything else, because it outranks every other answer: a
    // child who is already enrolled will always "clash" with this class (their
    // own sessions are the ones in the way), and telling the parent to pick a
    // different slot — or asking them to confirm the level — is answering a
    // question they did not ask. One sentence, the true one, and no CTA.
    const childFirstName =
      (child?.display_name || child?.full_name || 'This student').split(' ')[0] || 'This student';

    if (body.groupId) {
      const membership = await findMembership(admin, body.childId, body.groupId);
      if (membership) {
        return NextResponse.json({
          childLevel,
          classFormLevel,
          levelMismatch: false,
          levelMessage: null,
          schedule: { checked: false, reason: 'already_in_class' },
          alternatives: [],
          alreadyIn: {
            status: membership,
            message:
              membership === 'pending'
                ? `${childFirstName} has already asked to join this class — the tutor has not answered yet.`
                : `${childFirstName} is already in this class.`,
          },
        });
      }
    }

    // ---- schedule conflict -------------------------------------------------
    // No window resolved means nothing to compare against — a class with no
    // scheduled sessions yet. Reported as "unknown", not as "clear": telling a
    // parent there is no clash when we never looked would be a lie they act on.
    if (!start || !end) {
      return NextResponse.json({
        childLevel,
        classFormLevel,
        levelMismatch,
        levelMessage: levelMismatch
          ? `Your student is in ${childLevel}, this is a ${classFormLevel} class — are you sure this is the right class?`
          : null,
        schedule: { checked: false, reason: 'no_scheduled_sessions' },
        alternatives: [],
      });
    }

    // The class being considered is excluded from its own conflict check — see
    // findChildScheduleConflict's excludeGroupId.
    const conflict = await findChildScheduleConflict(admin, body.childId, start, end, {
      excludeGroupId: body.groupId ?? null,
    });

    if (!conflict) {
      return NextResponse.json({
        childLevel,
        classFormLevel,
        levelMismatch,
        levelMessage: levelMismatch
          ? `Your student is in ${childLevel}, this is a ${classFormLevel} class — are you sure this is the right class?`
          : null,
        schedule: { checked: true, clear: true, message: 'No schedule conflicts' },
        alternatives: [],
      });
    }

    // ---- alternatives (§5) -------------------------------------------------
    // Same subject, different class, and — checked with the SAME conflict
    // function — at a time this child is actually free.
    const alternatives = await findAlternatives(admin, {
      childId: body.childId,
      subjectName,
      excludeGroupId: body.groupId ?? null,
      excludeTutorId: groupTutorId,
    });

    return NextResponse.json({
      childLevel,
      classFormLevel,
      levelMismatch,
      levelMessage: levelMismatch
        ? `Your student is in ${childLevel}, this is a ${classFormLevel} class — are you sure this is the right class?`
        : null,
      schedule: {
        checked: true,
        clear: false,
        // §5's wording.
        message: 'This student has a class which would conflict with this schedule',
        detail: conflictMessage(conflict),
      },
      alternatives,
      // "Conflict with no alternatives → 'No tutors found.' Not an error state."
      alternativesMessage: alternatives.length === 0 ? 'No tutors found.' : null,
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/booking/check]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Is this child already in (or already waiting on) this class? Returns
 * 'enrolled', 'pending', or null. Both membership tables are consulted because
 * either one alone can carry a live place: group_members is the roster, and a
 * paid class's seat lives in group_enrollments.
 */
async function findMembership(
  admin: Awaited<ReturnType<typeof requireParentContext>>['admin'],
  childId: string,
  groupId: string
): Promise<'enrolled' | 'pending' | null> {
  const [{ data: member }, { data: enrollment }] = await Promise.all([
    admin
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', childId)
      .maybeSingle(),
    admin
      .from('group_enrollments')
      .select('status')
      .eq('group_id', groupId)
      .eq('student_id', childId)
      .in('status', ['ACTIVE', 'GRACE'])
      .maybeSingle(),
  ]);

  if (enrollment) return 'enrolled';

  // classifyMembership, not a literal list: group_members.status carries two
  // vocabularies depending on which route wrote the row.
  return classifyMembership((member as { status: string | null } | null)?.status);
}

type Alternative = {
  groupId: string;
  name: string;
  tutorName: string;
  subject: string | null;
  priceMonthly: number | null;
  when: string | null;
};

async function findAlternatives(
  admin: Awaited<ReturnType<typeof requireParentContext>>['admin'],
  params: {
    childId: string;
    subjectName: string | null;
    excludeGroupId: string | null;
    excludeTutorId: string | null;
  }
): Promise<Alternative[]> {
  if (!params.subjectName) return [];

  let query = admin
    .from('groups')
    .select('id, name, subject, price_monthly, tutor_id, status')
    .eq('subject', params.subjectName)
    .limit(30);

  if (params.excludeGroupId) query = query.neq('id', params.excludeGroupId);

  const { data: candidates } = await query;

  const groups = ((candidates ?? []) as unknown as Array<{
    id: string;
    name: string | null;
    subject: string | null;
    price_monthly: number | null;
    tutor_id: string;
    status: string | null;
  }>).filter((g) => !g.status || g.status.toUpperCase() === 'ACTIVE');

  if (groups.length === 0) return [];

  const tutorIds = Array.from(new Set(groups.map((g) => g.tutor_id)));
  const { data: tutors } = await admin
    .from('profiles')
    .select('id, full_name, display_name')
    .in('id', tutorIds);

  const tutorName = new Map(
    ((tutors ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
    }>).map((t) => [t.id, t.display_name || t.full_name || 'Tutor'])
  );

  const out: Alternative[] = [];

  for (const g of groups) {
    if (out.length >= MAX_ALTERNATIVES) break;

    const { data: gs } = await admin.from('group_sessions').select('id').eq('group_id', g.id).limit(20);
    const gsIds = ((gs ?? []) as unknown as Array<{ id: string }>).map((r) => r.id);
    if (gsIds.length === 0) continue;

    const { data: occ } = await admin
      .from('group_session_occurrences')
      .select('scheduled_start_at, scheduled_end_at')
      .in('group_session_id', gsIds)
      .is('cancelled_at', null)
      .gte('scheduled_start_at', new Date().toISOString())
      .order('scheduled_start_at', { ascending: true })
      .limit(1);

    const next = (occ ?? [])[0] as
      | { scheduled_start_at: string; scheduled_end_at: string }
      | undefined;
    if (!next) continue;

    // Same checker as above — recommending a class that also clashes would be
    // worse than recommending nothing.
    const clash = await findChildScheduleConflict(
      admin,
      params.childId,
      next.scheduled_start_at,
      next.scheduled_end_at
    );
    if (clash) continue;

    out.push({
      groupId: g.id,
      name: g.name ?? 'Class',
      tutorName: tutorName.get(g.tutor_id) ?? 'Tutor',
      subject: g.subject,
      priceMonthly: g.price_monthly,
      when: new Date(next.scheduled_start_at).toLocaleString('en-TT', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Port_of_Spain',
      }),
    });
  }

  return out;
}
