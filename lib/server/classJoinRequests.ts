// Parent approval for GROUP CLASS enrolment — the group-class half of §4.
//
// WHAT WAS BROKEN
// resolveBilling decides whether a student books for themselves or needs a
// parent's approval, and every 1:1 path consults it. No group-class path did.
// A child whose parent had set "ask for approval first" could open the
// marketplace and join any class, free or gated, and nothing was ever sent to
// the parent. Statement 2 of the handover — "Approval is consent, not just
// payment — a free class still needs it" — was unimplemented for exactly the
// classes where consent is the only thing at stake.
//
// THE TWO GATES ARE DIFFERENT AND BOTH APPLY
//   the parent's gate   this module: does the child have permission to enrol
//   the tutor's gate    groups.require_join_requests: does the tutor accept them
// A class can have neither, either or both. The parent's gate comes first,
// because a request the parent will refuse should never reach a tutor's roster,
// and approving passes the child on to the tutor's queue when one exists.
//
// Nothing here reserves a place — the same rule as a 1:1 request, and the
// parent's email says so.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBilling } from '@/lib/server/bookingRequests';
import {
  notifyParentOfClassRequest,
  notifyStudentOfClassDecision,
  notifyTutorOfJoinRequest,
} from '@/lib/server/classRequestNotify';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';
import { classifyMembership } from '@/lib/services/groupMembership';
import { hasAnyPrice } from '@/lib/payments/groupPricing';

export type ClassRequestRow = {
  id: string;
  group_id: string;
  student_id: string;
  parent_id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
  requested_at: string;
  decided_at: string | null;
  decline_reason: string | null;
};

type GroupRow = {
  id: string;
  name: string | null;
  tutor_id: string;
  require_join_requests: boolean | null;
  pricing_model: string | null;
  price_monthly: number | string | null;
  price_per_session: number | string | null;
  price_per_course: number | string | null;
  archived_at: string | null;
};

/**
 * Does joining this class cost money?
 *
 * hasAnyPrice, not isPaidGroup: the question here is whether a seat can be
 * granted without a payment, and ANY price means no. isPaidGroup answers the
 * narrower "could Stripe charge for this", which is the right test for a
 * checkout and the wrong one for a gate.
 */
function costsMoney(group: GroupRow | null): boolean {
  return hasAnyPrice(group as Parameters<typeof hasAnyPrice>[0]);
}

async function loadGroup(admin: SupabaseClient, groupId: string): Promise<GroupRow | null> {
  const { data } = await admin
    .from('groups')
    .select(
      'id, name, tutor_id, require_join_requests, pricing_model, price_monthly, price_per_session, price_per_course, archived_at'
    )
    .eq('id', groupId)
    .maybeSingle();
  return (data as GroupRow | null) ?? null;
}

async function displayName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin
    .from('profiles')
    .select('full_name, display_name')
    .eq('id', userId)
    .maybeSingle();
  const p = data as { full_name: string | null; display_name: string | null } | null;
  return p?.display_name || p?.full_name || 'Someone';
}

/**
 * A one-line "when it meets", best effort — the email reads better with it.
 * Exported because the parent enrol route sends the student the same line.
 */
export async function nextSessionLabel(admin: SupabaseClient, groupId: string): Promise<string | null> {
  const { data: gs } = await admin.from('group_sessions').select('id').eq('group_id', groupId).limit(20);
  const ids = ((gs ?? []) as Array<{ id: string }>).map((g) => g.id);
  if (!ids.length) return null;

  const { data: occ } = await admin
    .from('group_session_occurrences')
    .select('scheduled_start_at')
    .in('group_session_id', ids)
    .is('cancelled_at', null)
    .gte('scheduled_start_at', new Date().toISOString())
    .order('scheduled_start_at', { ascending: true })
    .limit(1);

  const next = (occ ?? [])[0] as { scheduled_start_at: string } | undefined;
  if (!next) return null;

  return new Date(next.scheduled_start_at).toLocaleString('en-TT', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Port_of_Spain',
  });
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export type ClassJoinGate =
  | { needsParentApproval: false }
  | { needsParentApproval: true; parentId: string };

/**
 * Does this student need a parent's approval to enrol in a class?
 *
 * Delegates to resolveBilling so there is one definition of "dependent", shared
 * with every 1:1 path. A student with no linked parent, or one whose parent has
 * turned self-pay on, is unaffected by anything in this module.
 */
export async function resolveClassJoinGate(
  admin: SupabaseClient,
  studentId: string
): Promise<ClassJoinGate> {
  const billing = await resolveBilling(admin, studentId);
  if (billing.mode === 'parent_approval') {
    return { needsParentApproval: true, parentId: billing.parentId };
  }
  return { needsParentApproval: false };
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

export type CreateClassRequestResult =
  | { ok: true; requestId: string; alreadyPending: boolean; parentId: string }
  | { ok: false; reason: string };

export async function createClassJoinRequest(
  admin: SupabaseClient,
  params: { groupId: string; studentId: string; parentId: string }
): Promise<CreateClassRequestResult> {
  const group = await loadGroup(admin, params.groupId);
  if (!group || group.archived_at) return { ok: false, reason: 'class_unavailable' };

  // A second press must find the first request, not raise a duplicate the
  // parent has to answer twice. The partial unique index enforces this in the
  // database; reading first is what makes the response honest about which
  // happened.
  const { data: existing } = await admin
    .from('class_join_requests')
    .select('id, parent_id')
    .eq('group_id', params.groupId)
    .eq('student_id', params.studentId)
    .eq('status', 'PENDING')
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; parent_id: string };
    return { ok: true, requestId: row.id, alreadyPending: true, parentId: row.parent_id };
  }

  const { data: inserted, error } = await admin
    .from('class_join_requests')
    .insert({
      group_id: params.groupId,
      student_id: params.studentId,
      parent_id: params.parentId,
      status: 'PENDING',
    })
    .select('id')
    .single();

  if (error || !inserted) return { ok: false, reason: error?.message ?? 'insert_failed' };

  const requestId = (inserted as { id: string }).id;

  // Notification failure must not undo a request that exists.
  try {
    const { data: parent } = await admin
      .from('profiles')
      .select('email, full_name, display_name')
      .eq('id', params.parentId)
      .maybeSingle();
    const p = parent as {
      email: string | null;
      full_name: string | null;
      display_name: string | null;
    } | null;

    await notifyParentOfClassRequest(admin, {
      parentId: params.parentId,
      parentEmail: p?.email ?? null,
      parentName: p?.display_name || p?.full_name || null,
      childId: params.studentId,
      childName: await displayName(admin, params.studentId),
      className: group.name ?? 'a class',
      tutorName: await displayName(admin, group.tutor_id),
      scheduleLabel: await nextSessionLabel(admin, params.groupId),
      priceTtd: Number(group.price_monthly ?? 0),
      requiresTutorApproval: Boolean(group.require_join_requests),
      requestId,
      groupId: params.groupId,
    });
  } catch (e) {
    console.error('[classJoinRequests] parent notification failed:', e);
  }

  return { ok: true, requestId, alreadyPending: false, parentId: params.parentId };
}

// ---------------------------------------------------------------------------
// Writing the membership — shared so an approved request and a direct join
// produce exactly the same roster row and the same tutor notice.
// ---------------------------------------------------------------------------

export type JoinOutcome =
  | { ok: true; status: 'approved' | 'pending'; alreadyMember: boolean }
  | { ok: false; reason: string };

export async function performGroupJoin(
  admin: SupabaseClient,
  params: { groupId: string; studentId: string; notifyTutor?: boolean }
): Promise<JoinOutcome> {
  const group = await loadGroup(admin, params.groupId);
  if (!group || group.archived_at) return { ok: false, reason: 'class_unavailable' };
  if (group.tutor_id === params.studentId) return { ok: false, reason: 'own_class' };

  const { data: existing } = await admin
    .from('group_members')
    .select('id, status')
    .eq('group_id', params.groupId)
    .eq('user_id', params.studentId)
    .maybeSingle();

  const row = existing as { id: string; status: string } | null;
  if (row && classifyMembership(row.status)) {
    return {
      ok: true,
      status: classifyMembership(row.status) === 'pending' ? 'pending' : 'approved',
      alreadyMember: true,
    };
  }

  // The tutor's own gate. group_members.status is constrained to
  // {pending, approved, denied, suspended, banned, removed} — 'pending' is the
  // tutor's queue, and there is no roster status for "the parent has not
  // answered", which is why the request lives in its own table.
  const status = group.require_join_requests ? 'pending' : 'approved';

  if (row) {
    const { error } = await admin
      .from('group_members')
      .update({ status, joined_at: new Date().toISOString(), action_reason: null })
      .eq('id', row.id);
    if (error) return { ok: false, reason: error.message };
  } else {
    const { error } = await admin
      .from('group_members')
      .insert({ group_id: params.groupId, user_id: params.studentId, status });
    if (error) return { ok: false, reason: error.message };
  }

  if (params.notifyTutor !== false) {
    const studentName = await displayName(admin, params.studentId);
    const className = group.name ?? 'your class';
    const isRequest = status === 'pending';

    await notifyInApp(admin, {
      userId: group.tutor_id,
      type: isRequest ? 'join_request' : 'new_class_member',
      title: isRequest
        ? `${studentName} wants to join ${className}`
        : `${studentName} joined ${className}`,
      message: isRequest
        ? `${studentName} has requested to join "${className}". Go to the Roster to approve or decline.`
        : `${studentName} has joined "${className}".`,
      link: `/tutor/classes/${params.groupId}?tab=roster`,
      metadata: { groupId: params.groupId, studentId: params.studentId },
    });

    // The email the tutor never used to get.
    try {
      await notifyTutorOfJoinRequest(admin, {
        tutorId: group.tutor_id,
        className,
        groupId: params.groupId,
        studentName,
        isRequest,
      });
    } catch (e) {
      console.error('[classJoinRequests] tutor email failed:', e);
    }
  }

  return { ok: true, status, alreadyMember: false };
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

async function loadRequestForParent(
  admin: SupabaseClient,
  requestId: string,
  parentId: string
): Promise<ClassRequestRow | null> {
  const { data } = await admin
    .from('class_join_requests')
    .select('id, group_id, student_id, parent_id, status, requested_at, decided_at, decline_reason')
    .eq('id', requestId)
    .eq('parent_id', parentId)
    .maybeSingle();
  return (data as ClassRequestRow | null) ?? null;
}

export async function approveClassJoinRequest(
  admin: SupabaseClient,
  params: { requestId: string; parentId: string }
): Promise<{ ok: boolean; reason?: string; awaitingTutor?: boolean; groupId?: string }> {
  const req = await loadRequestForParent(admin, params.requestId, params.parentId);
  if (!req) return { ok: false, reason: 'not_found' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'already_decided' };

  // A PAID CLASS IS NOT APPROVED INTO A SEAT.
  //
  // performGroupJoin writes a roster row and takes no payment, so approving a
  // priced class here would hand out a paid place for nothing — the same defect
  // that /api/parent/enroll-child had before hasAnyPrice was added to it.
  //
  // Consent and payment are one act for the parent: they enrol the child from
  // the class page, which charges in the same step. The request is left PENDING
  // and settles itself once the seat exists (see settleIfEnrolled), so an
  // abandoned checkout leaves the request in the queue rather than showing a
  // child as approved into a class nobody paid for.
  const priced = await loadGroup(admin, req.group_id);
  if (costsMoney(priced)) {
    return { ok: false, reason: 'payment_required', groupId: req.group_id };
  }

  const joined = await performGroupJoin(admin, {
    groupId: req.group_id,
    studentId: req.student_id,
  });
  if (!joined.ok) return { ok: false, reason: joined.reason };

  // Marked decided only after the seat write succeeded. The other order would
  // leave a request showing "approved" with no membership behind it.
  await admin
    .from('class_join_requests')
    .update({
      status: 'APPROVED',
      decided_at: new Date().toISOString(),
      decided_by: params.parentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.id)
    .eq('status', 'PENDING');

  const awaitingTutor = joined.status === 'pending';

  try {
    const group = await loadGroup(admin, req.group_id);
    const { data: student } = await admin
      .from('profiles')
      .select('email, full_name, display_name')
      .eq('id', req.student_id)
      .maybeSingle();
    const s = student as {
      email: string | null;
      full_name: string | null;
      display_name: string | null;
    } | null;

    await notifyStudentOfClassDecision(admin, {
      studentId: req.student_id,
      studentEmail: s?.email ?? null,
      studentName: s?.display_name || s?.full_name || null,
      parentName: await displayName(admin, params.parentId),
      className: group?.name ?? 'the class',
      groupId: req.group_id,
      approved: true,
      awaitingTutor,
    });
  } catch (e) {
    console.error('[classJoinRequests] student approval notice failed:', e);
  }

  return { ok: true, awaitingTutor };
}

export async function declineClassJoinRequest(
  admin: SupabaseClient,
  params: { requestId: string; parentId: string; reason?: string | null }
): Promise<{ ok: boolean; reason?: string }> {
  const req = await loadRequestForParent(admin, params.requestId, params.parentId);
  if (!req) return { ok: false, reason: 'not_found' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'already_decided' };

  const { error } = await admin
    .from('class_join_requests')
    .update({
      status: 'DECLINED',
      decided_at: new Date().toISOString(),
      decided_by: params.parentId,
      decline_reason: params.reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.id)
    .eq('status', 'PENDING');

  if (error) return { ok: false, reason: error.message };

  try {
    const group = await loadGroup(admin, req.group_id);
    const { data: student } = await admin
      .from('profiles')
      .select('email, full_name, display_name')
      .eq('id', req.student_id)
      .maybeSingle();
    const s = student as {
      email: string | null;
      full_name: string | null;
      display_name: string | null;
    } | null;

    await notifyStudentOfClassDecision(admin, {
      studentId: req.student_id,
      studentEmail: s?.email ?? null,
      studentName: s?.display_name || s?.full_name || null,
      parentName: await displayName(admin, params.parentId),
      className: group?.name ?? 'the class',
      groupId: req.group_id,
      approved: false,
      reason: params.reason ?? null,
    });
  } catch (e) {
    console.error('[classJoinRequests] student decline notice failed:', e);
  }

  return { ok: true };
}

/** The student's own withdrawal — decision 28's equivalent for a class. */
export async function withdrawClassJoinRequest(
  admin: SupabaseClient,
  params: { requestId: string; studentId: string }
): Promise<{ ok: boolean; reason?: string }> {
  const { data } = await admin
    .from('class_join_requests')
    .select('id, status')
    .eq('id', params.requestId)
    .eq('student_id', params.studentId)
    .maybeSingle();

  const row = data as { id: string; status: string } | null;
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'PENDING') return { ok: false, reason: 'already_decided' };

  await admin
    .from('class_join_requests')
    .update({ status: 'WITHDRAWN', decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'PENDING');

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type ParentClassRequest = {
  id: string;
  groupId: string;
  className: string;
  tutorName: string;
  childId: string;
  childName: string;
  priceTtd: number;
  isFree: boolean;
  scheduleLabel: string | null;
  requestedAt: string;
  requiresTutorApproval: boolean;
};

export type DecidedClassRequest = {
  id: string;
  className: string;
  childName: string;
  decision: 'Approved' | 'Declined' | 'Withdrawn';
  at: string | null;
  reason: string | null;
};

export async function listParentClassRequests(
  admin: SupabaseClient,
  parentId: string
): Promise<{ pending: ParentClassRequest[]; decided: DecidedClassRequest[] }> {
  const { data } = await admin
    .from('class_join_requests')
    .select('id, group_id, student_id, status, requested_at, decided_at, decline_reason')
    .eq('parent_id', parentId)
    .order('requested_at', { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Array<{
    id: string;
    group_id: string;
    student_id: string;
    status: string;
    requested_at: string;
    decided_at: string | null;
    decline_reason: string | null;
  }>;
  if (rows.length === 0) return { pending: [], decided: [] };

  const groupIds = Array.from(new Set(rows.map((r) => r.group_id)));
  const { data: groups } = await admin
    .from('groups')
    .select('id, name, tutor_id, price_monthly, require_join_requests')
    .in('id', groupIds);

  const groupById = new Map(
    ((groups ?? []) as GroupRow[]).map((g) => [g.id, g])
  );

  const peopleIds = Array.from(
    new Set([
      ...rows.map((r) => r.student_id),
      ...((groups ?? []) as GroupRow[]).map((g) => g.tutor_id),
    ])
  );
  const { data: people } = await admin
    .from('profiles')
    .select('id, full_name, display_name')
    .in('id', peopleIds);

  const nameById = new Map(
    ((people ?? []) as Array<{ id: string; full_name: string | null; display_name: string | null }>).map(
      (p) => [p.id, p.display_name || p.full_name || 'Unknown']
    )
  );

  const pending: ParentClassRequest[] = [];
  const decided: DecidedClassRequest[] = [];

  for (const r of rows) {
    const g = groupById.get(r.group_id);
    const className = g?.name ?? 'A class';
    const childName = nameById.get(r.student_id) ?? 'Your child';

    if (r.status === 'PENDING') {
      // The parent may already have enrolled (and paid for) this child from the
      // class page. Showing it as still waiting would ask them to approve
      // something they have already done.
      if (await settleIfEnrolled(admin, r)) continue;

      const price = Number(g?.price_monthly ?? 0);
      pending.push({
        id: r.id,
        groupId: r.group_id,
        className,
        tutorName: g ? nameById.get(g.tutor_id) ?? 'Tutor' : 'Tutor',
        childId: r.student_id,
        childName,
        priceTtd: price,
        isFree: price <= 0,
        scheduleLabel: await nextSessionLabel(admin, r.group_id),
        requestedAt: r.requested_at,
        requiresTutorApproval: Boolean(g?.require_join_requests),
      });
    } else {
      decided.push({
        id: r.id,
        className,
        childName,
        decision:
          r.status === 'APPROVED' ? 'Approved' : r.status === 'DECLINED' ? 'Declined' : 'Withdrawn',
        at: r.decided_at,
        reason: r.decline_reason,
      });
    }
  }

  return { pending, decided };
}

/**
 * Has this request already been satisfied by an enrolment?
 *
 * A paid request is never approved into a seat (see approveClassJoinRequest) —
 * the parent pays on the class page instead, and that path writes the roster
 * row without knowing a request existed. Rather than teach every payment route,
 * webhook and admin tool to close requests, the request settles itself the next
 * time anyone looks at it. Idempotent, and correct no matter which route
 * created the seat.
 *
 * Returns true when the row was settled and should no longer be shown.
 */
async function settleIfEnrolled(
  admin: SupabaseClient,
  row: { id: string; group_id: string; student_id: string }
): Promise<boolean> {
  const { data } = await admin
    .from('group_members')
    .select('status')
    .eq('group_id', row.group_id)
    .eq('user_id', row.student_id)
    .maybeSingle();

  const status = (data as { status: string } | null)?.status ?? null;
  if (!status || !classifyMembership(status)) return false;

  await admin
    .from('class_join_requests')
    .update({
      status: 'APPROVED',
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'PENDING');

  return true;
}

/** The student's view: which of their pending requests is waiting on a parent. */
export async function pendingRequestForStudent(
  admin: SupabaseClient,
  params: { groupId: string; studentId: string }
): Promise<ClassRequestRow | null> {
  const { data } = await admin
    .from('class_join_requests')
    .select('id, group_id, student_id, parent_id, status, requested_at, decided_at, decline_reason')
    .eq('group_id', params.groupId)
    .eq('student_id', params.studentId)
    .eq('status', 'PENDING')
    .maybeSingle();

  const row = (data as ClassRequestRow | null) ?? null;
  if (!row) return null;

  // Same self-settling rule as the parent's queue: once the seat exists the
  // request is spent, and the student should see the class, not "waiting on
  // your parent".
  if (await settleIfEnrolled(admin, row)) return null;
  return row;
}
